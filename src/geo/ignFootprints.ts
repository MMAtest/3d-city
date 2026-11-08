/**
 * Accurate building footprint source: offline tiled © IGN BD TOPO, Open Licence 2.0.
 * Replace OSM approximated shapes ONLY inside successfully loaded IGN tile bounds.
 * Outside our snapshot, keep live OpenFreeMap buildings. No invented buildings.
 */
import { clipBuildingToRect } from './clip';
import { centroid, signedArea, withOrientation, pointInRing, ringBounds, type Polygon, type Ring } from './polygon';
import { makeProjector, type LngLat } from './projection';
import type { BuildingSpec } from '../scene/buildingsMesh';
import { lidarHeight, type Lidar } from './marseilleDetail';

interface Footprint { id: string; h: number | null; p: number[][][] }
interface FootprintTile {
  bbox: [number, number, number, number];
  tile: [number, number];
  buildings: Footprint[];
}
export interface FootprintStats { ignCount: number; ignoredOsm: number; ignoredDuplicate: number; loadedTiles: number; chosen: number; lidarMeasured: number; osmRestored: number; }
export interface FootprintResult { specs: BuildingSpec[]; stats: FootprintStats; }

const CENTER: LngLat = { lon: 5.3700, lat: 43.2930 };
const SIZE = 1500;
const GRID = 4;
const originProjector = makeProjector(CENTER);

function gridCell(x: number, y: number): LngLat {
  return originProjector.toLngLat(-3000 + x * SIZE, -3000 + y * SIZE);
}
export function tileBounds(x: number, y: number): [number, number, number, number] {
  const a = gridCell(x, y), b = gridCell(x + 1, y + 1);
  return [a.lon, a.lat, b.lon, b.lat];
}
function inside([west, south, east, north]: [number, number, number, number], c: LngLat): boolean {
  return c.lon >= west && c.lon < east && c.lat >= south && c.lat < north;
}
function overlaps(b: [number, number, number, number], c: LngLat, sizeM: number): boolean {
  const sw = originProjector.toLocal(b[0], b[1]), ne = originProjector.toLocal(b[2], b[3]);
  const pc = originProjector.toLocal(c.lon, c.lat);
  const r = sizeM / 2;
  return sw[0] < pc[0] + r && ne[0] > pc[0] - r && sw[1] < pc[1] + r && ne[1] > pc[1] - r;
}

export async function loadIgnFootprints(center: LngLat, sizeM: number, signal?: AbortSignal): Promise<FootprintTile[]> {
  if (center.lon < 5.25 || center.lon > 5.46 || center.lat < 43.22 || center.lat > 43.37) return [];
  const jobs: Promise<FootprintTile | null>[] = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const bbox = tileBounds(x, y);
    if (!overlaps(bbox, center, sizeM)) continue;
    jobs.push((async (): Promise<FootprintTile | null> => {
      try {
        let data: FootprintTile | null = null;
        const base = import.meta.env.BASE_URL + 'ign-buildings/' + x + '-' + y + '.json';
        // Gzip reduces 11 MB of official city data to ~2 MB transferred.
        // DecompressionStream is supported on modern Safari, Chrome and Firefox;
        // plain JSON is retained as a fallback for older engines.
        if (typeof DecompressionStream !== 'undefined') {
          const packed = await fetch(base + '.gz', { signal });
          if (packed.ok && packed.body) {
            try {
              const expanded = packed.body.pipeThrough(new DecompressionStream('gzip'));
              data = await new Response(expanded).json() as FootprintTile;
            } catch (err) {
              if (signal?.aborted) throw err;
              console.warn('IGN compressed tile unavailable, using JSON', err);
            }
          }
        }
        if (!data) {
          const response = await fetch(base, { signal });
          if (!response.ok) throw new Error('HTTP ' + response.status);
          data = await response.json() as FootprintTile;
        }
        if (data.tile?.[0] !== x || data.tile?.[1] !== y || !Array.isArray(data.buildings)) throw new Error('Invalid IGN tile');
        return data;
      } catch (error) {
        if (signal?.aborted) throw error;
        console.warn('IGN building tile unavailable; falling back to OSM', x, y, error);
        return null;
      }
    })());
  }
  if (!jobs.length) return [];
  return (await Promise.all(jobs)).filter((x): x is FootprintTile => !!x);
}

/** Render the entire official footprint inventory on covered sectors, with OSM outside it. */
export function mergeIgnFootprints(osm: BuildingSpec[], tiles: FootprintTile[], center: LngLat, sizeM: number, lidar?: Lidar | null): FootprintResult {
  const stats: FootprintStats = { ignCount: 0, ignoredOsm: 0, ignoredDuplicate: 0, loadedTiles: tiles.length, chosen: 0, lidarMeasured: 0, osmRestored: 0 };
  if (!tiles.length) return { specs: osm, stats: { ...stats, chosen: osm.length } };
  const proj = makeProjector(center), h = sizeM / 2, seen = new Set<string>();
  const official: BuildingSpec[] = [];
  for (const tile of tiles) for (const b of tile.buildings) {
    if (!b.id || seen.has(b.id)) { stats.ignoredDuplicate++; continue; }
    seen.add(b.id);
    if (!b.p?.length || b.p[0].length < 3) continue;
    const rings: Ring[] = [];
    for (const coords of b.p) {
      const projected = coords.map(([lon, lat]) => proj.toLocal(lon, lat));
      if (projected.length >= 3 && Math.abs(signedArea(projected)) >= 0.25) rings.push(projected);
    }
    if (!rings.length) continue;
    const poly: Polygon = {
      outer: withOrientation(rings[0], true), holes: rings.slice(1).map(r => withOrientation(r, false)),
    };
    for (const cut of clipBuildingToRect(poly, -h, -h, h, h, 1)) {
      const height = typeof b.h === 'number' && b.h >= 2 && b.h < 185 ? b.h : 9;
      const spec: BuildingSpec = { poly: cut, height, minHeight: 0, estimated: b.h == null, heightKnown: b.h != null };
      const measured = lidar ? lidarHeight(spec, center, lidar) : null;
      if (measured != null) {
        spec.height = measured;
        spec.estimated = false;
        spec.heightKnown = true;
        stats.lidarMeasured++;
      }
      official.push(spec);
      stats.ignCount++;
    }
  }
  // IGN is preferred, but it does not necessarily list *every* OSM building.
  // A spatial index makes it cheap to preserve OSM features without an official
  // polygon overlapping them, instead of erasing an entire cadastral block.
  const STEP = 40; // metres
  const key = (x: number, y: number) => x + ':' + y;
  const buckets = new Map<string, number[]>();
  const officialBounds = official.map(x => ringBounds(x.poly.outer));
  for (let i = 0; i < official.length; i++) {
    const [w, south, east, north] = officialBounds[i];
    for (let y = Math.floor(south / STEP); y <= Math.floor(north / STEP); y++)
      for (let x = Math.floor(w / STEP); x <= Math.floor(east / STEP); x++) {
        const k = key(x, y), list = buckets.get(k) || [];
        list.push(i); buckets.set(k, list);
      }
  }
  const all: BuildingSpec[] = [...official];
  for (const spec of osm) {
    const c = centroid(spec.poly.outer), local = proj.toLngLat(c[0], c[1]);
    if (!tiles.some(t => inside(t.bbox, local))) { all.push(spec); continue; }
    const b = ringBounds(spec.poly.outer);
    const candidates = new Set<number>();
    for (let y = Math.floor(b[1] / STEP); y <= Math.floor(b[3] / STEP); y++)
      for (let x = Math.floor(b[0] / STEP); x <= Math.floor(b[2] / STEP); x++)
        for (const i of buckets.get(key(x, y)) || []) candidates.add(i);
    let present = false;
    for (const i of candidates) {
      const other = official[i], b2 = officialBounds[i];
      const iw = Math.max(0, Math.min(b[2], b2[2]) - Math.max(b[0], b2[0]));
      const ih = Math.max(0, Math.min(b[3], b2[3]) - Math.max(b[1], b2[1]));
      if (iw <= 0 || ih <= 0) continue;
      const area1 = (b[2]-b[0])*(b[3]-b[1]);
      const area2 = (b2[2]-b2[0])*(b2[3]-b2[1]);
      const coverage = iw*ih / Math.max(0.1, Math.min(area1, area2));
      if (coverage >= 0.31 || pointInRing(c, other.poly.outer) ||
          pointInRing(centroid(other.poly.outer), spec.poly.outer)) { present = true; break; }
    }
    if (present) stats.ignoredOsm++;
    else { all.push(spec); stats.osmRestored++; }
  }
  stats.chosen = all.length;
  return { specs: all, stats };
}
