/**
 * The picture a technologist was looking at when they made a decision.
 *
 * A finding records a class and a box; it does not record what was inside the
 * box. Every mark made by hand and every confirm/reject therefore crops the box
 * out of the slide it was drawn on and stores that crop, so the decision can be
 * reviewed later against the same evidence, and the confirmed crops can be
 * re-read as labelled examples.
 *
 * Only the crop travels: a full microscopy field is a few megabytes of base64,
 * and the platform refuses a request body that size. The organism and the field
 * around it are what a reviewer or a future detector needs, so that is what is
 * sent.
 *
 * The geometry is a pure function so it can be tested without a canvas.
 */

/** A box in whole-slide pixels, centred on x/y as the viewer stores it. */
export interface DetectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The crop rectangle, in the same whole-slide pixel space, top-left origin. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * What decision a crop evidences.
 *
 * Rejected crops matter as much as confirmed ones — they are the examples a
 * future detector has to learn not to predict. Releasing a confirmation is
 * recorded too, because undoing a decision is itself a decision.
 */
export type DetectionImageSource = 'manual_label' | 'confirmed' | 'rejected' | 'reset';

/** Longest edge a stored crop is kept at, in pixels. */
export const DETECTION_IMAGE_MAX_EDGE = 320;

/** How much field around the box is kept, as a multiple of the box's own size. */
export const DETECTION_IMAGE_CONTEXT = 1;

/** A crop smaller than this on either axis is grown back up to it. */
const MIN_CROP_EDGE = 48;

/**
 * The crop that shows a box with the field around it.
 *
 * The organisms a technologist marks are a few dozen pixels across, which is too
 * small to judge on its own, so the crop keeps as much field again on every
 * side. The result is clamped into the slide and grown back to a legible size
 * when the box sits against an edge.
 *
 * Returns null for a box that cannot be cropped — zero or negative dimensions
 * describe nothing, and a slide with no pixels has nothing to crop from.
 */
export function cropDetectionRect(
  box: DetectionBox,
  image: { width: number; height: number },
  context: number = DETECTION_IMAGE_CONTEXT,
  minEdge: number = MIN_CROP_EDGE
): CropRect | null {
  const imageWidth = Number(image?.width);
  const imageHeight = Number(image?.height);
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight)) return null;
  if (imageWidth <= 0 || imageHeight <= 0) return null;

  const boxWidth = Number(box?.width);
  const boxHeight = Number(box?.height);
  const centreX = Number(box?.x);
  const centreY = Number(box?.y);
  if (![boxWidth, boxHeight, centreX, centreY].every(value => Number.isFinite(value))) return null;
  if (boxWidth <= 0 || boxHeight <= 0) return null;

  const padding = Math.max(boxWidth, boxHeight) * Math.max(0, context);

  const clamp = (value: number, limit: number) => Math.min(Math.max(value, 0), limit);

  // Grow around the centre first, then clamp, so the organism stays centred
  // whenever the slide has room for it.
  let left = clamp(centreX - boxWidth / 2 - padding, imageWidth);
  let right = clamp(centreX + boxWidth / 2 + padding, imageWidth);
  let top = clamp(centreY - boxHeight / 2 - padding, imageHeight);
  let bottom = clamp(centreY + boxHeight / 2 + padding, imageHeight);

  // A box at the very edge leaves a one-sided crop; grow the other way instead
  // of storing a sliver nobody can judge.
  const grow = (low: number, high: number, limit: number): [number, number] => {
    let nextLow = low;
    let nextHigh = high;
    const shortfall = minEdge - (nextHigh - nextLow);
    if (shortfall > 0) {
      const takeLeft = Math.min(nextLow, shortfall / 2);
      nextLow -= takeLeft;
      nextHigh = Math.min(limit, nextHigh + (shortfall - takeLeft));
      const stillShort = minEdge - (nextHigh - nextLow);
      if (stillShort > 0) nextLow = Math.max(0, nextLow - stillShort);
    }
    return [nextLow, nextHigh];
  };

  [left, right] = grow(left, right, imageWidth);
  [top, bottom] = grow(top, bottom, imageHeight);

  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return null;

  return { x: left, y: top, width, height };
}

/** What decision a crop is being stored for, from the decision it travels with. */
export function detectionImageSource(decision: {
  manual?: boolean;
  confirmed?: boolean;
  rejected?: boolean;
}): DetectionImageSource {
  if (decision.manual) return 'manual_label';
  if (decision.rejected) return 'rejected';
  if (decision.confirmed) return 'confirmed';
  return 'reset';
}

/**
 * Crops a box out of a slide and returns it as a JPEG data URL.
 *
 * Resolves to null when the slide cannot be decoded or the box cannot be
 * cropped: a missing picture must never fail the decision it belongs to, so the
 * caller sends the ruling without it rather than losing the ruling.
 */
export async function captureDetectionImage(
  imageUrl: string,
  box: DetectionBox,
  options: { maxEdge?: number; context?: number; quality?: number } = {}
): Promise<string | null> {
  if (typeof imageUrl !== 'string' || !imageUrl.trim()) return null;

  const maxEdge = Math.max(64, Math.round(Number(options.maxEdge) || DETECTION_IMAGE_MAX_EDGE));
  const context = options.context ?? DETECTION_IMAGE_CONTEXT;
  const quality = Math.min(1, Math.max(0.4, Number(options.quality) || 0.85));

  let image: HTMLImageElement;
  try {
    image = await loadImage(imageUrl);
  } catch {
    return null;
  }

  const rect = cropDetectionRect(box, {
    width: image.naturalWidth,
    height: image.naturalHeight
  }, context);
  if (!rect) return null;

  // Scaled down, never up: a crop is evidence of what the box was drawn
  // around, not a replacement for the slide.
  const longest = Math.max(rect.width, rect.height);
  const scale = Math.min(1, maxEdge / longest);
  const targetWidth = Math.max(1, Math.round(rect.width * scale));
  const targetHeight = Math.max(1, Math.round(rect.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, targetWidth, targetHeight);

  return canvas.toDataURL('image/jpeg', quality);
}

/** Decodes a data URL, or rejects when the browser cannot read it. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Slide image could not be decoded.'));
    img.src = url;
  });
}
