// Turn a user-selected image File into a compressed, resized data: URI that we
// store directly in Postgres (cover_image / image_url are TEXT columns).
// No server upload, no /uploads path — so nothing to 404 and nothing ephemeral.

const DEFAULTS = {
  maxDim: 1600,        // longest edge, px
  maxBytes: 500 * 1024, // target ceiling for the encoded image (~500KB)
  maxInputBytes: 15 * 1024 * 1024, // reject inputs larger than 15MB up front
};

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('Could not read that file.'));
    fr.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file is not a valid image.'));
    img.src = src;
  });
}

// Rough byte size of a data: URL (base64 payload).
function dataUrlBytes(dataUrl) {
  const i = dataUrl.indexOf(',');
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return Math.floor(b64.length * 3 / 4);
}

/**
 * Compress an image File to a data URI.
 * Throws Error with a user-friendly message on invalid input.
 */
export async function fileToCompressedDataURL(file, opts = {}) {
  const { maxDim, maxBytes, maxInputBytes } = { ...DEFAULTS, ...opts };

  if (!file) throw new Error('No file selected.');
  if (!file.type || !file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (JPG, PNG, WebP, or GIF).');
  }
  if (file.size > maxInputBytes) {
    throw new Error(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB — please pick one under ${Math.round(maxInputBytes / 1024 / 1024)}MB.`);
  }

  const originalDataUrl = await readAsDataURL(file);
  const img = await loadImage(originalDataUrl);

  let { width, height } = img;
  if (Math.max(width, height) > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not process this image.');
  ctx.drawImage(img, 0, 0, width, height);

  // Prefer WebP; fall back to JPEG if unsupported. Step quality down until it
  // fits under maxBytes, then step dimensions down as a last resort.
  const mime = canvas.toDataURL('image/webp', 0.8).startsWith('data:image/webp')
    ? 'image/webp'
    : 'image/jpeg';

  let quality = 0.85;
  let out = canvas.toDataURL(mime, quality);
  while (dataUrlBytes(out) > maxBytes && quality > 0.4) {
    quality -= 0.12;
    out = canvas.toDataURL(mime, quality);
  }

  // Still too big (very detailed image): shrink dimensions and re-encode.
  while (dataUrlBytes(out) > maxBytes && Math.max(canvas.width, canvas.height) > 640) {
    canvas.width = Math.round(canvas.width * 0.8);
    canvas.height = Math.round(canvas.height * 0.8);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    out = canvas.toDataURL(mime, 0.75);
  }

  return out;
}
