import type { Photo } from './types';

export interface ProcessedPhoto extends Photo { hadExif: boolean; hadGps: boolean; originalBytes: number }

/** Reads the JPEG APP1/EXIF block and reports whether a GPS IFD (tag 0x8825) is present. */
export function scanExif(buf: ArrayBuffer): { exif: boolean; gps: boolean } {
  const b = new Uint8Array(buf);
  try {
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 10 < b.length && b[i] === 0xff) {
        const marker = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
        if (marker === 0xda) break;
        if (marker === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
          const t = i + 10, le = b[t] === 0x49;
          const u16 = (o: number) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
          const u32 = (o: number) => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
          const ifd = t + u32(t + 4), n = ifd + 2 < b.length ? u16(ifd) : 0;
          let gps = false;
          for (let k = 0; k < n && ifd + 2 + k * 12 + 2 < b.length; k++) if (u16(ifd + 2 + k * 12) === 0x8825) gps = true;
          return { exif: true, gps };
        }
        i += 2 + len;
      }
      return { exif: false, gps: false };
    }
    const head = new TextDecoder('latin1').decode(b.subarray(0, Math.min(b.length, 131_072)));
    return { exif: head.includes('Exif'), gps: false };
  } catch {
    return { exif: false, gps: false };
  }
}

async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall back to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Re-encodes the image through a canvas: every metadata block (EXIF, GPS, maker notes) is dropped. */
export async function processPhoto(file: File, max = 1024, quality = 0.8): Promise<ProcessedPhoto> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > 25 * 1024 * 1024) throw new Error('That photo is larger than 25 MB.');
  const meta = scanExif(await file.arrayBuffer());
  let img: CanvasImageSource & { width: number; height: number };
  try { img = await decode(file); } catch { throw new Error('This photo format isn’t supported by your browser. Try a JPEG or PNG.'); }
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the photo on this device.');
  ctx.drawImage(img, 0, 0, w, h);
  if ('close' in img && typeof img.close === 'function') img.close();
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const bytes = Math.round(((dataUrl.length - 23) * 3) / 4);
  return { dataUrl, name: 'sighting.jpg', width: w, height: h, bytes, hadExif: meta.exif, hadGps: meta.gps, originalBytes: file.size };
}

export const toPhoto = (p: ProcessedPhoto): Photo => ({ dataUrl: p.dataUrl, name: p.name, width: p.width, height: p.height, bytes: p.bytes });
export const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1_048_576 ? `${Math.round(n / 1024)} KB` : `${(n / 1_048_576).toFixed(1)} MB`);
