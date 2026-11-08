#!/usr/bin/env python3
"""IGN BD TOPO building geometries; snapshot in 1.5 km city tiles. © IGN Open Licence 2.0."""
import concurrent.futures as cf, json, math, subprocess, time, urllib.parse, sys, gzip
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'data'/'ign-bdtopo-full-raw'; OUT=ROOT/'public'/'ign-buildings'
RAW.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
LON,LAT=5.37,43.293; phi=math.radians(LAT)
MLAT=111132.92-559.82*math.cos(2*phi)+1.175*math.cos(4*phi)
MLON=111412.84*math.cos(phi)-93.5*math.cos(3*phi)
def loc(x,y):return [LON+(x*1500-3000)/MLON,LAT+(y*1500-3000)/MLAT]
def fetch(x,y,page,bbox):
 p=RAW/('%s-%s-%s.json'%(x,y,page))
 if p.exists():return json.loads(p.read_text())
 q=urllib.parse.urlencode(dict(SERVICE='WFS',VERSION='2.0.0',REQUEST='GetFeature',TYPENAMES='BDTOPO_V3:batiment',
   BBOX='%.7f,%.7f,%.7f,%.7f,EPSG:4326'%tuple(bbox),OUTPUTFORMAT='application/json',COUNT='1250',STARTINDEX=str(page*1250)))
 url='https://data.geopf.fr/wfs/ows?'+q
 for attempt in range(4):
  r=subprocess.run(['curl','-sSL','--compressed','--fail','--connect-timeout','10','--max-time','55',url],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  if r.returncode==0:
   try:
    v=json.loads(r.stdout)
    if isinstance(v.get('features'),list):p.write_bytes(r.stdout);return v
   except Exception:pass
  time.sleep(1+attempt)
 raise RuntimeError('WFS failed tile %s %s page %s'%(x,y,page))
def ring(points):
 pts=[]
 for v in points:
  p=[round(v[0],7),round(v[1],7)]
  if not pts or p!=pts[-1]:pts.append(p)
 if len(pts)>1 and pts[0]==pts[-1]:pts.pop()
 if len(pts)<3:return []
 # Eliminate near-collinear vertices, never remove a bend > 0.20 m.
 def xy(q):return [(q[0]-LON)*MLON,(q[1]-LAT)*MLAT]
 out=[]
 for i,p in enumerate(pts):
  a=xy(pts[i-1]); b=xy(p); c=xy(pts[(i+1)%len(pts)])
  dx=c[0]-a[0];dy=c[1]-a[1]
  h=abs((b[0]-a[0])*dy-(b[1]-a[1])*dx)/max(1e-6,math.hypot(dx,dy))
  if h>.20:out.append(p)
 return out if len(out)>=3 else pts
def compact(f):
 props=f.get('properties') or {}
 if props.get('etat_de_l_objet') not in (None,'En service'):return []
 h=props.get('hauteur')
 try:h=float(h) if h is not None else None
 except (ValueError,TypeError):h=None
 if h is None or not 2<=h<=185:
  levels=props.get('nombre_d_etages')
  h=round(float(levels)*3,1) if isinstance(levels,(int,float)) and 1<=levels<=30 else None
 polys=f.get('geometry') or {}
 g=polys.get('coordinates',[])
 if polys.get('type')=='Polygon':g=[g]
 if polys.get('type') not in ('Polygon','MultiPolygon'):return []
 out=[]
 for ix,rings in enumerate(g):
  cleaned=[ring(r) for r in rings]
  cleaned=[r for r in cleaned if r]
  if cleaned:
   out.append({'id':str(f.get('id') or props.get('cleabs'))+(('-'+str(ix)) if ix else ''),
    'h':round(h,2) if h is not None else None,'p':cleaned})
 return out
def task(x,y):
 bbox=loc(x,y)+loc(x+1,y+1); allf={}
 for page in range(40):
  data=fetch(x,y,page,bbox);fs=data['features']
  for f in fs:
   id=f.get('id') or (f.get('properties') or {}).get('cleabs')
   if id:allf[id]=f
  if len(fs)<1250 or page*1250+len(fs)>=data.get('numberMatched',1e20):break
 else:raise RuntimeError('pagination overflow')
 buildings=[]
 for f in allf.values():buildings.extend(compact(f))
 dest=OUT/('%s-%s.json'%(x,y))
 payload=json.dumps({'bbox':bbox,'tile':[x,y],'source':'© IGN BD TOPO, Licence Ouverte 2.0','buildings':buildings},separators=(',',':')).encode('utf-8')
 dest.write_bytes(payload)
 (OUT/('%s-%s.json.gz'%(x,y))).write_bytes(gzip.compress(payload,compresslevel=8))
 print('tile',x,y,'pages',page+1,'raw',len(allf),'shapes',len(buildings),'kb',round(dest.stat().st_size/1024),flush=True)
 return len(buildings)
def main():
 jobs=[(2,1)] if '--single' in sys.argv else [(x,y) for y in range(4) for x in range(4)]
 with cf.ThreadPoolExecutor(max_workers=3) as pool:
  futures={pool.submit(task,*job):job for job in jobs}
  n=0
  for future in cf.as_completed(futures):
   try:n+=future.result()
   except Exception as e:print('FAIL',futures[future],str(e),flush=True);raise
 if len(jobs)==16:
  (OUT/'manifest.json').write_text(json.dumps({'source':'© IGN BD TOPO, Licence Ouverte 2.0',
   'origin':[LON,LAT],'tileSizeM':1500,'count':4,'bounds':[loc(0,0),loc(4,4)]},separators=(',',':')))
 print('TOTAL with duplicates across WFS tiles',n,flush=True)
if __name__=='__main__':main()
