import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { mergeIgnFootprints, tileBounds } from '../src/geo/ignFootprints';
import { makeProjector } from '../src/geo/projection';
import { OverviewBuildings } from '../src/scene/buildingsOverview';
import type { BuildingSpec } from '../src/scene/buildingsMesh';

const center={lon:5.370,lat:43.293};
const projector=makeProjector(center);
const makeBuilding=(e:number,n:number,h=13):BuildingSpec=>({
 poly:{outer:[[e-5,n-5],[e+5,n-5],[e+5,n+5],[e-5,n+5]],holes:[]},
 height:h,minHeight:0,estimated:false,heightKnown:true
});
function makeOfficial(e:number,n:number,id='x',h=18){
 const coords=makeBuilding(e,n).poly.outer.map(([x,y])=>{
  const ll=projector.toLngLat(x,y);return [ll.lon,ll.lat];
 });
 return {id,h,p:[coords]};
}
describe('complete Marseille building inventory',()=>{
 it('replaces OSM inside covered tiles with authoritative IGN footprints without duplicating it',()=>{
  const near=makeBuilding(250,-650);
  const outside=makeBuilding(-2400,-2400);
  const tile={tile:[2,1] as [number,number],bbox:tileBounds(2,1),buildings:[makeOfficial(250,-650)]};
  const merged=mergeIgnFootprints([near,outside],[tile],center,6000);
  expect(merged.stats.loadedTiles).toBe(1);
  expect(merged.stats.ignCount).toBe(1);
  expect(merged.stats.ignoredOsm).toBe(1);
  expect(merged.specs.length).toBe(2);
  expect(merged.specs.some(x=>x.height===18)).toBe(true);
  expect(merged.specs.some(x=>x.height===13)).toBe(true);
 });
 it('preserves genuine OSM-only buildings inside an IGN-covered district',()=>{
  const officialTile={tile:[2,1] as [number,number],bbox:tileBounds(2,1),buildings:[makeOfficial(250,-650)]};
  const old=[makeBuilding(250,-650),makeBuilding(650,-750)];
  const result=mergeIgnFootprints(old,[officialTile],center,6000);
  expect(result.stats.ignCount).toBe(1);
  expect(result.stats.ignoredOsm).toBe(1);
  expect(result.stats.osmRestored).toBe(1);
  expect(result.specs).toHaveLength(2);
  expect(result.specs.some(s=>s.height===13)).toBe(true);
 });
 it('does not double-count official geometries repeated at tile boundaries',()=>{
  const a={tile:[2,1] as [number,number],bbox:tileBounds(2,1),buildings:[makeOfficial(250,-650,'repeat')]};
  const b={tile:[3,1] as [number,number],bbox:tileBounds(3,1),buildings:[makeOfficial(250,-650,'repeat')]};
  const merged=mergeIgnFootprints([],[a,b],center,6000);
  expect(merged.specs).toHaveLength(1);
  expect(merged.stats.ignoredDuplicate).toBe(1);
 });
 it('uses original OSM buildings when no IGN tiles were retrieved',()=>{
  const old=[makeBuilding(0,0)];
  const merged=mergeIgnFootprints(old,[],center,6000);
  expect(merged.specs).toBe(old);
  expect(merged.stats.loadedTiles).toBe(0);
 });
 it('keeps all building shapes even in the overview by using GPU instances',()=>{
  const specs=Array.from({length:1000},(_,i)=>makeBuilding(i%40*14-280,Math.floor(i/40)*14-180));
  const elev=new Float32Array(5*5).fill(10);
  const grid={n:5,sizeM:2000,elev,min:10,max:10,zoom:13};
  const overview=new OverviewBuildings(specs,grid,1.5);
  expect(overview.mesh.count).toBe(specs.length);
  expect(overview.estimatedCount).toBe(0);
  const matrix=new Matrix4(),pos=new Vector3();
  overview.mesh.getMatrixAt(0,matrix);
  pos.setFromMatrixPosition(matrix);
  expect(Number.isFinite(pos.x)).toBe(true);
  expect(overview.buildingsAt([-278,-176])).toEqual([0]);
  overview.setExaggeration(2);
  expect(overview.mesh.count).toBe(1000);
  overview.dispose();
 });
});
