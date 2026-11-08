/**
 * Marseille's optional high-detail layer: reuse the real IGN / OSM datasets
 * from the AFFLUE research branch without coupling this renderer to Next.js.
 * Sources: © IGN Géoplateforme (Licence Ouverte 2.0), © OSM contributors (ODbL).
 * LiDAR HD is 2021 acquisition; never present it as a current survey.
 */
import { makeProjector, type LngLat } from './projection';
import { centroid, pointInRing, ringBounds, signedArea, type Pt } from './polygon';
import type { HeightGrid } from './terrain';
import type { BuildingSpec } from '../scene/buildingsMesh';

export type BBox = [number, number, number, number]; // west,south,east,north
export type Raster = { bbox: BBox; size: [number, number]; z: number[] };
export type Lidar = { bbox: BBox; size: [number, number]; mnt: number[]; mns: number[] };
export type IgnBuilding = { id: number; p: [number, number][]; h: number; ign?: number };
export type IgnRegion = { buildings: IgnBuilding[]; ignHeightMatches: number };
export type MarseilleDetails = {
  zones: { name: string; region: IgnRegion; terrain: Raster }[];
  lidar: Lidar | null;
};
export type DetailStats = { ignMatched: number; lidarMatched: number; terrainPoints: number; lidarPoints: number; sourceBuildings: number };
export const EMPTY_STATS = (): DetailStats => ({ ignMatched: 0, lidarMatched: 0, terrainPoints: 0, lidarPoints: 0, sourceBuildings: 0 });

const ZONES = [
  { name: 'Vieux-Port', bbox: [5.3631, 43.2905, 5.3773, 43.2984] as BBox, slug: 'vieux-port' },
  { name: 'Cours Julien', bbox: [5.3772, 43.2879, 5.3915, 43.2970] as BBox, slug: 'cours-julien' },
] as const;
const LIDAR_BBOX: BBox = [5.3847, 43.29325, 5.3872, 43.29575];

export function intersectsArea(center: LngLat, size: number, bbox: BBox): boolean {
  const proj = makeProjector(center);
  const sw = proj.toLocal(bbox[0], bbox[1]);
  const ne = proj.toLocal(bbox[2], bbox[3]);
  const h = size / 2;
  return ne[0] >= -h && sw[0] <= h && ne[1] >= -h && sw[1] <= h;
}

async function fetchJson<T>(slug: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(import.meta.env.BASE_URL + 'afflue/' + slug + '.json', { signal });
  if (!res.ok) throw new Error('IGN detail HTTP ' + res.status + ': ' + slug);
  return res.json() as Promise<T>;
}

/** Only load detailed datasets intersecting this scene; leave other cities unaffected. */
export async function loadMarseilleDetails(center: LngLat, size: number, signal?: AbortSignal): Promise<MarseilleDetails | null> {
  if (center.lat < 43.20 || center.lat > 43.39 || center.lon < 5.20 || center.lon > 5.51) return null;
  const zones = ZONES.filter((z) => intersectsArea(center, size, z.bbox));
  const lidarWanted = intersectsArea(center, size, LIDAR_BBOX);
  if (!zones.length && !lidarWanted) return null;

  const [regionResults, lidarResult] = await Promise.all([
    Promise.all(zones.map(async (z) => {
      try {
        const [region, terrain] = await Promise.all([
          fetchJson<IgnRegion>(z.slug, signal), fetchJson<Raster>(z.slug + '-terrain', signal),
        ]);
        return { name: z.name, region, terrain };
      } catch (err) {
        if (signal?.aborted) throw err;
        console.warn('Optional IGN detail unavailable:', z.name, err);
        return null;
      }
    })),
    lidarWanted ? fetchJson<Lidar>('la-plaine-poggioli-lidar', signal).catch((err) => {
      if (signal?.aborted) throw err;
      console.warn('Optional LiDAR detail unavailable:', err);
      return null;
    }) : Promise.resolve(null),
  ]);
  return { zones: regionResults.filter((x): x is NonNullable<typeof x> => x !== null), lidar: lidarResult };
}

/** Sample a south-to-north and west-to-east IGN elevation raster; outside returns null. */
export function sampleRaster(grid: Raster, lon: number, lat: number, values: number[] = grid.z): number | null {
  const [west, south, east, north] = grid.bbox;
  if (lon < west || lon > east || lat < south || lat > north) return null;
  const [nx, ny] = grid.size;
  if (nx < 2 || ny < 2 || values.length !== nx * ny) return null;
  const gx = Math.min(nx - 1.000001, Math.max(0, (lon - west) / (east - west) * (nx - 1)));
  const gy = Math.min(ny - 1.000001, Math.max(0, (lat - south) / (north - south) * (ny - 1)));
  const ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
  const i = iy * nx + ix;
  const a = values[i], b = values[i + 1], c = values[i + nx], d = values[i + nx + 1];
  const val = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  return Number.isFinite(val) && val > -100 && val < 3000 ? val : null;
}

/** Fade corrected elevation into regional data over ~30 m, no hard square seams. */
function edgeWeight(bbox: BBox, lon: number, lat: number, widthM: number): number {
  const proj = makeProjector({ lon, lat });
  const x = Math.min((lon - bbox[0]) * proj.mPerDegLon, (bbox[2] - lon) * proj.mPerDegLon);
  const y = Math.min((lat - bbox[1]) * proj.mPerDegLat, (bbox[3] - lat) * proj.mPerDegLat);
  return Math.max(0, Math.min(1, Math.min(x, y) / widthM));
}

export function patchTerrain(grid: HeightGrid, center: LngLat, details: MarseilleDetails | null): DetailStats {
  const stats = EMPTY_STATS();
  if (!details) return stats;
  stats.sourceBuildings = details.zones.reduce((n, z) => n + z.region.buildings.length, 0);
  const proj = makeProjector(center), h = grid.sizeM / 2, step = grid.sizeM / (grid.n - 1);
  const terrains = details.zones.map((z) => z.terrain);
  for (let j = 0; j < grid.n; j++) {
    for (let i = 0; i < grid.n; i++) {
      const k = j * grid.n + i;
      const ll = proj.toLngLat(-h + i * step, -h + j * step);
      let corrected = grid.elev[k];
      // Use continuous RGE ALTI where available and blend at cut edges.
      for (const terrain of terrains) {
        const z = sampleRaster(terrain, ll.lon, ll.lat);
        if (z != null) {
          const w = edgeWeight(terrain.bbox, ll.lon, ll.lat, 35);
          if (w > 0) { corrected = corrected * (1 - w) + z * w; stats.terrainPoints++; }
        }
      }
      if (details.lidar) {
        const lidar = details.lidar;
        const ground = sampleRaster({ ...lidar, z: lidar.mnt }, ll.lon, ll.lat);
        if (ground != null) {
          const w = edgeWeight(lidar.bbox, ll.lon, ll.lat, 12);
          if (w > 0) { corrected = corrected * (1 - w) + ground * w; stats.lidarPoints++; }
        }
      }
      grid.elev[k] = corrected;
    }
  }
  grid.min = Infinity; grid.max = -Infinity;
  for (let k = 0; k < grid.elev.length; k++) {
    grid.min = Math.min(grid.min, grid.elev[k]);
    grid.max = Math.max(grid.max, grid.elev[k]);
  }
  return stats;
}

type SourceSpec = { center: Pt; bbox: BBox; area: number; height: number; ign: boolean };
const BIN = 24; // metres, fast and predictable spatial matching
const key = (x: number, y: number) => Math.floor(x / BIN) + ':' + Math.floor(y / BIN);

function buildIndex(center: LngLat, details: MarseilleDetails): Map<string, SourceSpec[]> {
  const proj = makeProjector(center), buckets = new Map<string, SourceSpec[]>();
  for (const zone of details.zones) for (const feature of zone.region.buildings) {
    if (!feature.ign || !Number.isFinite(feature.h) || feature.h < 2 || feature.h > 200 || feature.p.length < 3) continue;
    const ring = feature.p.map(([lon, lat]) => proj.toLocal(lon, lat));
    const c = centroid(ring), bounds = ringBounds(ring), area = Math.abs(signedArea(ring));
    if (area < 2) continue;
    const source: SourceSpec = { center: c, bbox: bounds, area, height: feature.h, ign: true };
    const k = key(c[0], c[1]);
    const bucket = buckets.get(k) || [];
    bucket.push(source);
    buckets.set(k, bucket);
  }
  return buckets;
}

/** Match footprints conservatively, including size and bbox overlap checks. */
function matchIgn(spec: BuildingSpec, index: Map<string, SourceSpec[]>): number | null {
  const c = centroid(spec.poly.outer);
  const area = Math.abs(signedArea(spec.poly.outer));
  if (area < 3) return null;
  const b = ringBounds(spec.poly.outer), [bx, by] = [Math.floor(c[0] / BIN), Math.floor(c[1] / BIN)];
  let best: { height: number; score: number } | null = null;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    for (const source of index.get((bx + dx) + ':' + (by + dy)) || []) {
      const dist = Math.hypot(c[0] - source.center[0], c[1] - source.center[1]);
      const maxDistance = Math.min(18, Math.max(7, Math.sqrt(Math.max(area, source.area)) * .38));
      if (dist > maxDistance) continue;
      const ratio = area / source.area;
      if (ratio < .48 || ratio > 2.1) continue;
      const overlapW = Math.max(0, Math.min(b[2], source.bbox[2]) - Math.max(b[0], source.bbox[0]));
      const overlapH = Math.max(0, Math.min(b[3], source.bbox[3]) - Math.max(b[1], source.bbox[1]));
      const tileBox = (b[2] - b[0]) * (b[3] - b[1]);
      const sourceBox = (source.bbox[2] - source.bbox[0]) * (source.bbox[3] - source.bbox[1]);
      const boxCoverage = overlapW * overlapH / Math.min(tileBox, sourceBox);
      if (!Number.isFinite(boxCoverage) || boxCoverage < .66) continue;
      const score = dist + Math.abs(Math.log(ratio)) * 8 + (1 - boxCoverage) * 8;
      if (best === null || score < best.score) best = { height: source.height, score };
    }
  }
  return best?.height ?? null;
}

/** Robust estimate from MNS minus MNT, sampled INSIDE the building (no tree stand-ins). */
function lidarHeight(spec: BuildingSpec, center: LngLat, lidar: Lidar): number | null {
  const proj = makeProjector(center);
  const c = centroid(spec.poly.outer);
  const ll = proj.toLngLat(c[0], c[1]);
  if (ll.lon < lidar.bbox[0] || ll.lon > lidar.bbox[2] || ll.lat < lidar.bbox[1] || ll.lat > lidar.bbox[3]) return null;
  const b = ringBounds(spec.poly.outer);
  const points: number[] = [];
  for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) {
    const pt: Pt = [b[0] + (b[2]-b[0]) * x / 6, b[1] + (b[3]-b[1]) * y / 6];
    if (!pointInRing(pt, spec.poly.outer) || spec.poly.holes.some(h => pointInRing(pt, h))) continue;
    const ll = proj.toLngLat(pt[0],pt[1]);
    const raster: Raster = { bbox: lidar.bbox, size: lidar.size, z: lidar.mnt };
    const ground = sampleRaster(raster, ll.lon, ll.lat);
    const top = sampleRaster(raster, ll.lon, ll.lat, lidar.mns);
    if (ground != null && top != null && top - ground > 2 && top - ground < 110) points.push(top-ground);
  }
  if (points.length < 6) return null;
  points.sort((a,b) => a-b);
  const median = points[points.length >> 1];
  if (median < 3 || median > 90) return null;
  const spread = points[Math.floor(points.length*.8)]-points[Math.floor(points.length*.2)];
  return spread > 14 ? null : Math.round(median*10)/10;
}

export function enrichBuildings(specs: BuildingSpec[], center: LngLat, details: MarseilleDetails | null, stats: DetailStats): BuildingSpec[] {
  if (!details) return specs;
  const index = buildIndex(center, details);
  return specs.map((spec) => {
    // First use the IGN BD TOPO height. The smaller LiDAR HD patch can supersede it.
    const ignHeight = matchIgn(spec,index);
    const measured = details.lidar ? lidarHeight(spec,center,details.lidar) : null;
    if (measured !== null) {
      stats.lidarMatched++;
      return { ...spec, height: Math.max(spec.minHeight + .5, measured), estimated: false, heightKnown: true };
    }
    if (ignHeight !== null) {
      stats.ignMatched++;
      return { ...spec, height: Math.max(spec.minHeight + .5, ignHeight), estimated: false, heightKnown: true };
    }
    return spec;
  });
}
