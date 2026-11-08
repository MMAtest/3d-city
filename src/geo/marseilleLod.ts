/**
 * Overview LOD: on small touch devices, display a spatially balanced subset of
 * building volumes instead of exhausting memory with tens of thousands of wall
 * polygons in one mesh. Zooming into a district restores all source buildings.
 */
import { centroid, signedArea } from './polygon';
import type { BuildingSpec } from '../scene/buildingsMesh';

function stableHash(x: number, y: number): number {
  let n = (Math.floor(x * 8) * 73856093) ^ (Math.floor(y * 8) * 19349663);
  n = Math.imul(n ^ (n >>> 16), 2246822519);
  n = Math.imul(n ^ (n >>> 13), 3266489917);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

export function mobileOverviewLod(specs: BuildingSpec[], size: number, small: boolean): BuildingSpec[] {
  if (!small || size < 3000 || specs.length < 17000) return specs;
  const maxBuildings = size >= 5000 ? 17000 : 24000;
  if (specs.length <= maxBuildings) return specs;
  // Preserve urban coverage across the plate: budget each ~120m cell.
  const bins = new Map<string, Array<{ index: number; priority: number }>>();
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const c = centroid(spec.poly.outer);
    const bin = Math.floor(c[0] / 120) + ':' + Math.floor(c[1] / 120);
    const area = Math.max(0.1, Math.abs(signedArea(spec.poly.outer)));
    // Larger footprints and tall buildings should read well from afar.
    const score = stableHash(c[0], c[1]) * 2.1 + Math.min(2.3, Math.sqrt(area) / 19) + Math.min(1.2, spec.height / 90);
    const items = bins.get(bin) || [];
    items.push({ index: i, priority: score });
    bins.set(bin, items);
  }
  const ratio = maxBuildings / specs.length;
  const selected = new Set<number>();
  for (const items of bins.values()) {
    items.sort((a, b) => b.priority - a.priority);
    const count = Math.min(items.length, Math.max(1, Math.round(items.length * ratio)));
    for (let j = 0; j < count; j++) selected.add(items[j].index);
  }
  // Return source order for stable meshes/picking. Never modify source polygons.
  return specs.filter((_, i) => selected.has(i));
}
