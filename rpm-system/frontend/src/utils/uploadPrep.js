// Photos and screenshots are read by a vision model on the server (JPEG / PNG / WebP / GIF,
// ≤ 5 MB). iPhone photos arrive as HEIC and are often 5–12 MB, so every image is decoded
// here — the browser that can show it can convert it — and re-encoded as a JPEG no larger
// than it needs to be. Documents pass through untouched.

const IMG_EXT = /\.(jpe?g|jfif|png|webp|gif|heic|heif|avif|bmp|tiff?)$/i;
const MAX_EDGE = 2000;                    // px — plenty for printed/handwritten text
const KEEP_AS_IS = 3 * 1024 * 1024;       // a small web-safe image is sent byte-for-byte
const WEB_SAFE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_INPUT = 40 * 1024 * 1024;

export const isImageFile = (f) => !!f && ((f.type || '').startsWith('image/') || IMG_EXT.test(f.name || ''));

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('decode'));
      img.src = url;
    });
  } finally { setTimeout(() => URL.revokeObjectURL(url), 10_000); }
}

const toBlob = (canvas, type, q) => new Promise((resolve) => canvas.toBlob(resolve, type, q));

export async function prepareUpload(file) {
  if (!isImageFile(file)) return file;
  if (file.size > MAX_INPUT) throw new Error('That image is over 40 MB — pick a smaller one.');
  let img;
  try { img = await decode(file); }
  catch {
    throw new Error(/hei[cf]/i.test(`${file.type} ${file.name}`)
      ? 'This browser can’t open iPhone HEIC photos. Open RPM in Safari, or export the photo as JPG first.'
      : 'That image couldn’t be opened. Try a JPG or PNG.');
  }
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error('That image is empty.');

  const type = (file.type || '').toLowerCase();
  if (WEB_SAFE.has(type) && file.size <= KEEP_AS_IS && Math.max(w, h) <= MAX_EDGE * 1.25) { img.close?.(); return file; }

  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser couldn’t process this image.');
  ctx.fillStyle = '#fff';                                   // transparent PNGs would turn black as JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close?.();

  let blob = null;
  for (const q of [0.88, 0.78, 0.66]) {
    blob = await toBlob(canvas, 'image/jpeg', q);
    if (blob && blob.size <= 4.5 * 1024 * 1024) break;
  }
  if (!blob) throw new Error('Your browser couldn’t process this image.');
  const base = (file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
}
