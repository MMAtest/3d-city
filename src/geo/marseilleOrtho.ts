/**
 * Optional georeferenced IGN BD ORTHO plates from the AFFLUE prototype.
 * The raster is a real aerial photograph, NOT a photogrammetric building mesh.
 * © IGN, Licence Ouverte Etalab 2.0; capture year not established.
 */
import { intersectsArea, type BBox } from './marseilleDetail';
import { makeProjector, type LngLat } from './projection';

export interface OrthoPatch {
  bounds: [number, number, number, number]; // local west,south,east,north metres
  image: CanvasImageSource;
}

const SOURCES = [
  { bbox: [5.364,43.2908,5.37695,43.2984] as BBox, file: 'vieux-port-base.webp' },
  { bbox: [5.378,43.2884,5.391,43.2963] as BBox, file: 'cours-julien-base.webp' },
  { bbox: [5.3708,43.2936,5.37695,43.29815] as BBox, file: 'vieux-port.webp' },
  { bbox: [5.38335,43.29075,5.38755,43.29475] as BBox, file: 'cours-julien.webp' },
] as const;

function featherImage(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  // Two orthogonal alpha gradients remove the rectangular photo edge.
  ctx.globalCompositeOperation = 'destination-in';
  const x = ctx.createLinearGradient(0, 0, c.width, 0);
  x.addColorStop(0, 'rgba(0,0,0,0)'); x.addColorStop(.07, '#000');
  x.addColorStop(.93, '#000'); x.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = x; ctx.fillRect(0, 0, c.width, c.height);
  const y = ctx.createLinearGradient(0, 0, 0, c.height);
  y.addColorStop(0, 'rgba(0,0,0,0)'); y.addColorStop(.07, '#000');
  y.addColorStop(.93, '#000'); y.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = y; ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

async function decodePhoto(file: string, signal?: AbortSignal): Promise<HTMLCanvasElement> {
  const url = import.meta.env.BASE_URL + 'ortho/marseille/' + file;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('IGN orthophoto HTTP ' + response.status);
  const blob = await response.blob();
  const tempUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = tempUrl;
    await img.decode();
    return featherImage(img);
  } finally {
    URL.revokeObjectURL(tempUrl);
  }
}

export async function loadMarseilleOrthos(center: LngLat, size: number, signal?: AbortSignal): Promise<OrthoPatch[]> {
  const proj = makeProjector(center);
  const patches = await Promise.all(SOURCES.filter((s) => intersectsArea(center, size, s.bbox)).map(async (s) => {
    const image = await decodePhoto(s.file, signal);
    const sw = proj.toLocal(s.bbox[0],s.bbox[1]);
    const ne = proj.toLocal(s.bbox[2],s.bbox[3]);
    return { bounds: [sw[0],sw[1],ne[0],ne[1]] as [number,number,number,number], image };
  }));
  return patches;
}
