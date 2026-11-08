import { describe, expect, it } from 'vitest';
import { makeProjector } from '../src/geo/projection';
import { sampleRaster, patchTerrain, enrichBuildings, intersectsArea, EMPTY_STATS, type MarseilleDetails } from '../src/geo/marseilleDetail';
import type { BuildingSpec } from '../src/scene/buildingsMesh';
import type { HeightGrid } from '../src/geo/terrain';

const center = { lon: 5.3845, lat: 43.2935 };
const proj = makeProjector(center);
const ring: Array<[number,number]> = [[-8,-8],[8,-8],[8,8],[-8,8]];
const polygon = { outer: ring, holes: [] };
const spec: BuildingSpec = { poly: polygon, height: 5, minHeight: 0, estimated: true, heightKnown: false };
const bbox: [number,number,number,number] = [center.lon-.003,center.lat-.003,center.lon+.003,center.lat+.003];
const rect: [number,number,number,number] = [center.lon-.0002,center.lat-.0002,center.lon+.0002,center.lat+.0002];
const ign: MarseilleDetails = { zones:[{name:'Cours Julien',region:{
  buildings:[{ id:1,p:ring.map(([e,n])=>{const x=proj.toLngLat(e,n);return [x.lon,x.lat] as [number,number]}),h:24,ign:1 }],
  ignHeightMatches:1
},terrain:{bbox,size:[2,2],z:[40,40,40,40]}}],lidar:null };

describe('AFFLUE / IGN integration',()=>{
  it('uses the correct south-to-north raster orientation and respects coverage',()=>{
    const grid={bbox,size:[2,2] as [number,number],z:[10,20,30,40]};
    expect(sampleRaster(grid,center.lon,center.lat)).toBeCloseTo(25);
    expect(sampleRaster(grid,bbox[0],bbox[1])).toBe(10);
    expect(sampleRaster(grid,bbox[2],bbox[3])).toBeCloseTo(40,3);
    expect(sampleRaster(grid,5.0,42.5)).toBeNull();
  });
  it('enriches only matching buildings with real IGN BD TOPO heights',()=>{
    const stats=EMPTY_STATS();
    const matched=enrichBuildings([spec],center,ign,stats);
    expect(matched[0].height).toBe(24);
    expect(matched[0].estimated).toBe(false);
    expect(stats.ignMatched).toBe(1);
    expect(enrichBuildings([{...spec,poly:{outer:ring.map(([x,y])=>[x+60,y+60]),holes:[]}}],center,ign,EMPTY_STATS())[0].height).toBe(5);
  });
  it('feathers the official terrain patch and recomputes scene elevation range',()=>{
    const grid: HeightGrid = {sizeM:800,n:17,elev:new Float32Array(17*17).fill(10),min:10,max:10,zoom:13};
    const stats=patchTerrain(grid,center,ign);
    expect(grid.elev[8*17+8]).toBeCloseTo(40);
    expect(grid.min).toBe(10);
    expect(grid.max).toBeCloseTo(40);
    expect(stats.terrainPoints).toBeGreaterThan(0);
    expect(stats.lidarPoints).toBe(0);
  });
  it('uses actual LiDAR MNS–MNT elevation if consistent on an entire roof',()=>{
    const patch: MarseilleDetails={zones:[],lidar:{
      bbox:rect,size:[5,5],mnt:Array(25).fill(10),mns:Array(25).fill(35)
    }};
    const stats=EMPTY_STATS();
    const result=enrichBuildings([spec],center,patch,stats);
    expect(result[0].height).toBe(25);
    expect(result[0].estimated).toBe(false);
    expect(stats.lidarMatched).toBe(1);
  });
  it('loads only intersecting Marseille zones',()=>{
    expect(intersectsArea(center,1500,bbox)).toBe(true);
    expect(intersectsArea({lon:3,lat:48},1000,bbox)).toBe(false);
  });
});
