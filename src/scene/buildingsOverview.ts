/**
 * All-building low-poly overview. Every IGN/OSM footprint is represented by a
 * single oriented box *instance*, avoiding the old mobile omission of 75%.
 * Zoom in to a district for precise polygon outlines. NOT survey geometry.
 */
import { BoxGeometry, Color, InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import { pointInRing, ringBounds, type Pt } from '../geo/polygon';
import { BUILDING_COLOURS, rampColor, type BuildingSpec } from './buildingsMesh';
import { sampleGrid, type HeightGrid } from '../geo/terrain';
import type { BuildingStyle } from '../state';

const tmp = new Object3D();
const tmpColor = new Color();

function orientedBox(ring: Pt[]): { e: number; n: number; w: number; d: number; angle: number } {
  // Rotate bounding box to the longest wall edge, not the cardinal axes.
  let len2 = -1, ux = 1, uy = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const dx = b[0]-a[0], dy = b[1]-a[1], l = dx*dx+dy*dy;
    if (l > len2) {len2 = l; const len = Math.sqrt(l)||1; ux=dx/len; uy=dy/len;}
  }
  let loU=Infinity, hiU=-Infinity, loV=Infinity, hiV=-Infinity;
  for (const [e,n] of ring) {
    const u=e*ux+n*uy, v=-e*uy+n*ux;
    loU=Math.min(loU,u);hiU=Math.max(hiU,u);loV=Math.min(loV,v);hiV=Math.max(hiV,v);
  }
  const u=(loU+hiU)/2,v=(loV+hiV)/2;
  return {e:u*ux-v*uy,n:u*uy+v*ux,w:Math.max(.6,hiU-loU),d:Math.max(.6,hiV-loV),angle:Math.atan2(uy,ux)};
}

export class OverviewBuildings {
  readonly mesh: InstancedMesh<BoxGeometry, MeshStandardMaterial>;
  readonly ground: Float32Array;
  readonly bounds: Float32Array;
  readonly maxHeight: number;
  readonly estimatedCount: number;
  readonly boxes: Array<{e:number;n:number;w:number;d:number;angle:number}>;
  private ex = 1;
  private style: BuildingStyle='white';
  constructor(readonly specs: BuildingSpec[], readonly grid: HeightGrid, ex:number) {
    this.ground=new Float32Array(specs.length);
    this.bounds=new Float32Array(specs.length*4);
    this.boxes=[];
    let maxHeight=0,estimated=0;
    for(let i=0;i<specs.length;i++){
      const s=specs[i];
      const box=orientedBox(s.poly.outer);
      this.boxes.push(box);
      let lowest=Infinity;
      for(const [e,n] of s.poly.outer) lowest=Math.min(lowest,sampleGrid(grid,e,n));
      this.ground[i]=lowest;
      this.bounds.set(ringBounds(s.poly.outer),i*4);
      maxHeight=Math.max(maxHeight,s.height);
      if(s.estimated)estimated++;
    }
    this.maxHeight=maxHeight;this.estimatedCount=estimated;
    const material=new MeshStandardMaterial({color:0xffffff,roughness:.84,metalness:0});
    this.mesh=new InstancedMesh(new BoxGeometry(1,1,1),material,specs.length);
    this.mesh.name='all-buildings-overview';
    this.mesh.frustumCulled=false;
    this.mesh.castShadow=false;
    this.mesh.receiveShadow=false;
    this.setExaggeration(ex);
    this.paint([]);
  }
  setExaggeration(ex:number):void{
    this.ex=ex;
    for(let i=0;i<this.specs.length;i++){
      const s=this.specs[i],b=this.boxes[i];
      const height=Math.max(.8,s.height-s.minHeight);
      const bottom=(this.ground[i]-this.grid.min)*ex+s.minHeight;
      tmp.position.set(b.e,bottom+height/2,-b.n);
      tmp.rotation.set(0,b.angle,0);
      tmp.scale.set(b.w,height,b.d);
      tmp.updateMatrix();
      this.mesh.setMatrixAt(i,tmp.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate=true;
  }
  paint(marked:number[],color:Color=new Color('#c8431a')):void{
    const selected=new Set(marked);
    const solid=this.style==='ramp'?null:new Color(BUILDING_COLOURS[this.style]);
    for(let i=0;i<this.specs.length;i++){
      if(selected.has(i))tmpColor.copy(color);
      else if(solid)tmpColor.copy(solid);
      else rampColor(this.specs[i].height,tmpColor);
      this.mesh.setColorAt(i,tmpColor);
    }
    if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
  }
  setStyle(style:BuildingStyle):void{this.style=style;}
  buildingsAt(p:Pt):number[]{
    const out:number[]=[];
    for(let i=0;i<this.specs.length;i++){
      const k=i*4,b=this.bounds;
      if(p[0]<b[k]||p[0]>b[k+2]||p[1]<b[k+1]||p[1]>b[k+3])continue;
      const poly=this.specs[i].poly;
      if(pointInRing(p,poly.outer)&&!poly.holes.some(h=>pointInRing(p,h)))out.push(i);
    }
    return out;
  }
  roof(i:number):number{return (this.ground[i]-this.grid.min)*this.ex+this.specs[i].height;}
  dispose():void{this.mesh.geometry.dispose();this.mesh.material.dispose();}
}
