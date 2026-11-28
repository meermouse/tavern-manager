/** Pictures a post can have (matches the API's MAX_POST_IMAGES). */
export const MAX_POST_IMAGES = 4;
/**
 * Largest picture we send, in bytes: four of these, base64-encoded, fit in a Netlify function's 6 MB request limit
 * (the API's own per-picture limit, MAX_POST_IMAGE_BYTES, is a little looser).
 */
export const MAX_IMAGE_BYTES = 1_000_000;
/** Photos are shrunk to fit this many pixels on their longest side. */
const MAX_DIMENSION = 1600;
const KEEP_AS_IS = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read that picture'));
    reader.readAsDataURL(blob);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} isn't a picture this browser can open`));
    };
    img.src = url;
  });
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not shrink that picture'))), 'image/jpeg', quality),
  );
}

/**
 * A picture ready to post, as a data URL: small ones are sent as they are; big photos are scaled down to fit
 * MAX_DIMENSION and re-saved as JPEG so they fit the upload limit. Animated GIFs can't be shrunk without losing the
 * animation, so a GIF that's too big is turned down.
 */
export async function prepareImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} isn't a picture`);
  if (file.type === 'image/gif') {
    if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name} is too big — GIFs can be at most 1 MB`);
    return readAsDataUrl(file);
  }
  const img = await loadImage(file);
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  if (KEEP_AS_IS.has(file.type) && file.size <= MAX_IMAGE_BYTES && longest <= MAX_DIMENSION) return readAsDataUrl(file);

  let scale = Math.min(1, MAX_DIMENSION / longest);
  for (let attempt = 0; attempt < 4; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not shrink that picture');
    // JPEG has no transparency: put see-through PNGs on the feed's dark background rather than black.
    ctx.fillStyle = '#221911';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await toJpeg(canvas, 0.85);
    if (blob.size <= MAX_IMAGE_BYTES) return readAsDataUrl(blob);
    scale *= 0.75;
  }
  throw new Error(`${file.name} is too big to post`);
}
