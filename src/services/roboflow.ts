import {
  WorkerTilingConfig,
  WorkerResponse,
  fitTileBudget,
  tileCount
} from './tilingWorker';

export { fitTileBudget, tileCount };

/** One crop of a slide, with where it was taken from in whole-slide pixels. */
export interface ImageTile {
  dataUrl: string;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

/** Raised when the inference provider returns an error or an unusable response. */
export class InferenceError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'InferenceError';
    this.status = status;
  }
}

export interface TilingConfig {
  /** Tile edge length in pixels. Matched to the detector's input size. */
  tileSize: number;
  /** Fraction each tile overlaps its neighbour, 0 to 0.5. */
  overlap: number;
  /**
   * Upper bound on the tiles read for one slide. A slide that would need more
   * is read with larger tiles rather than more of them, so a very large
   * photograph cannot turn into hundreds of provider calls.
   */
  maxTiles?: number;
}

const MIN_TILE_EDGE = 32;

function drawImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new InferenceError('Slide image could not be decoded.'));
    img.src = url;
  });
}

const HAS_WORKER = typeof Worker !== 'undefined';

/**
 * Crops a slide into overlapping tiles so each one reaches the detector at its
 * own input size instead of being downscaled away.
 *
 * A microscopy field is far larger than the detector's input, so sending the
 * whole slide forces the provider to shrink it and an ovum a few dozen pixels
 * tall becomes a couple of pixels - below anything the model can recognise.
 * Reading the slide as tiles of `tileSize` keeps that ovum at full detector
 * resolution in at least one tile.
 *
 * Returns null when the slide is already smaller than one tile, which is the
 * common case for a phone photograph and means no tiling is needed.
 *
 * The decode-and-crop work runs in a Web Worker when one is available, so a
 * 63-tile scan no longer blocks the UI thread for the whole of it. The worker
 * is fire-and-forget: a failure to spawn one drops back to the synchronous
 * path rather than failing the scan.
 */
/**
 * Crops a slide into overlapping tiles so each one reaches the detector at its
 * own input size instead of being downscaled away.
 *
 * A microscopy field is far larger than the detector's input, so sending the
 * whole slide forces the provider to shrink it and an ovum a few dozen pixels
 * tall becomes a couple of pixels - below anything the model can recognise.
 * Reading the slide as tiles of `tileSize` keeps that ovum at full detector
 * resolution in at least one tile.
 *
 * Returns null when the slide is already smaller than one tile, which is the
 * common case for a phone photograph and means no tiling is needed.
 *
 * When `source` is supplied with a decoded `bitmap`, that bitmap is transferred
 * to the worker with zero-copy semantics, skipping the second image decode that
 * a plain `url` path would require. This is the hot path in the scan loop.
 */
export async function sliceImageTiles(
  url: string,
  config: TilingConfig,
  source?: SourceImage
): Promise<ImageTile[] | null> {
  if (source?.bitmap && HAS_WORKER) {
    try {
      return await sliceImageTilesViaWorkerFromBitmap(source.bitmap, config);
    } catch {
      // Fall through to the url path.
    }
  }

  if (HAS_WORKER) {
    try {
      return await sliceImageTilesViaWorker(url, config);
    } catch {
      // Fall through to the synchronous path rather than failing the scan.
    }
  }

  return sliceImageTilesSync(url, config);
}

/** Synchronous fallback, used when no worker is available. */
async function sliceImageTilesSync(
  url: string,
  config: TilingConfig
): Promise<ImageTile[] | null> {
  const requested = Math.max(64, Math.round(config.tileSize) || 640);
  const overlap = Math.min(0.5, Math.max(0, Number(config.overlap) || 0));
  const maxTiles = Math.max(1, Math.round(Number(config.maxTiles) || 160));

  const image = await drawImage(url);
  const { naturalWidth: width, naturalHeight: height } = image;
  if (!width || !height) return null;

  // A slide bigger than the budget is read with larger tiles so the grid stays
  // bounded; a slide that fits is read at the detector's own input size.
  const tileSize = fitTileBudget(width, height, requested, overlap, maxTiles);
  if (width <= tileSize && height <= tileSize) return null;

  const step = Math.max(1, Math.round(tileSize * (1 - overlap)));
  const tiles: ImageTile[] = [];

  for (let offsetY = 0; offsetY < height; offsetY += step) {
    for (let offsetX = 0; offsetX < width; offsetX += step) {
      const tileWidth = Math.min(tileSize, width - offsetX);
      const tileHeight = Math.min(tileSize, height - offsetY);
      if (tileWidth < MIN_TILE_EDGE || tileHeight < MIN_TILE_EDGE) continue;

      const canvas = document.createElement('canvas');
      canvas.width = tileWidth;
      canvas.height = tileHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(image, offsetX, offsetY, tileWidth, tileHeight, 0, 0, tileWidth, tileHeight);

      tiles.push({
        dataUrl: canvas.toDataURL('image/jpeg', 0.92),
        offsetX,
        offsetY,
        width: tileWidth,
        height: tileHeight
      });

      if (offsetX + tileWidth >= width) break;
    }
    if (offsetY + Math.min(tileSize, height - offsetY) >= height) break;
  }

  return tiles.length > 0 ? tiles : null;
}

/**
 * Runs tiling in a Web Worker so the main thread stays responsive.
 *
 * The worker is created once and reused; a message round-trip is cheaper than
 * decoding the slide again. The response carries the request id so a caller
 * that fires several tiles at once can match replies to requests.
 */
let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./tilingWorker.ts', import.meta.url), {
      type: 'module'
    });
  }
  return worker;
}

function toWorkerConfig(config: TilingConfig): WorkerTilingConfig {
  return {
    tileSize: Math.max(64, Math.round(config.tileSize) || 640),
    overlap: Math.min(0.5, Math.max(0, Number(config.overlap) || 0)),
    maxTiles: Math.max(1, Math.round(Number(config.maxTiles) || 160)),
    quality: 0.92
  };
}

function sliceImageTilesViaWorker(
  url: string,
  config: TilingConfig
): Promise<ImageTile[] | null> {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const w = getWorker();

    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) return;
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      if (event.data.error) {
        reject(new Error(event.data.error));
        return;
      }
      resolve(event.data.tiles);
    };
    const onError = (err: Event) => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      reject(err);
    };

    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({
      id,
      dataUrl: url,
      config: toWorkerConfig(config)
    });
  });
}

/**
 * Tiles a slide from a pre-decoded ImageBitmap, transferring it to the worker
 * with zero-copy semantics so the worker never decodes the image itself.
 */
function sliceImageTilesViaWorkerFromBitmap(
  bitmap: ImageBitmap,
  config: TilingConfig
): Promise<ImageTile[] | null> {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const w = getWorker();

    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) return;
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      if (event.data.error) {
        reject(new Error(event.data.error));
        return;
      }
      resolve(event.data.tiles);
    };
    const onError = (err: Event) => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      reject(err);
    };

    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage(
      {
        id,
        bitmap,
        config: toWorkerConfig(config)
      },
      [bitmap]
    );
  });
}

/**
 * Base64 bytes one batched scan request is allowed to carry.
 *
 * A batched scan reads a whole slide in one request so the server can read its
 * tiles in parallel, but a serverless deployment still refuses a request body
 * over ~4.5 MB, and the tiles of a full field do not fit in that. Tiles travel
 * in groups under this budget, which costs a handful of requests for a 63-tile
 * field — the per-request overhead was what made a scan take minutes, and a few
 * of them is a few of them.
 */
export const SCAN_BATCH_BYTE_BUDGET = 3.75 * 1024 * 1024;

/**
 * Packs tiles into groups whose combined base64 stays under the budget.
 *
 * Tiles are never dropped to make a group fit: an oversized tile goes in a group
 * of its own, so the caller sees it fail on its own rather than silently losing
 * a region of the specimen.
 */
export function chunkTilesByBytes<T extends { dataUrl: string }>(
  tiles: T[],
  budget: number = SCAN_BATCH_BYTE_BUDGET
): T[][] {
  const groups: T[][] = [];
  let group: T[] = [];
  let bytes = 0;

  for (const tile of tiles) {
    const size = tile.dataUrl.length;
    if (group.length > 0 && bytes + size > budget) {
      groups.push(group);
      group = [];
      bytes = 0;
    }
    group.push(tile);
    bytes += size;
  }

  if (group.length > 0) groups.push(group);
  return groups;
}

export interface SourceImage {
  base64: string;
  dataUrl: string;
  width: number;
  height: number;
  bitmap?: ImageBitmap;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Longest edge, in pixels, a stored slide is kept at. */
export const STORED_SLIDE_MAX_EDGE = 1920;

/**
 * The pixel size a slide is stored at once its longest edge is bounded.
 *
 * A photograph is scaled, never cropped, so no part of the specimen is lost —
 * only the resolution the whole workflow discards anyway. A slide already
 * inside the bound is returned unchanged rather than re-compressed for no gain.
 */
export function scaledDimensions(
  width: number,
  height: number,
  maxEdge: number = STORED_SLIDE_MAX_EDGE
): { width: number; height: number } {
  if (!width || !height) return { width: 0, height: 0 };

  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };

  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

/**
 * Re-encodes a slide at a size an upload can actually carry.
 *
 * A phone photograph of a microscopy field is a 3024x4032 JPEG of a few
 * megabytes. Sent unchanged it is base64 (×1.33) and then encrypted at rest
 * (×1.33 again), so one photograph becomes a ~5 MB request body. The serverless
 * platform this deploys to rejects a body over 4.5 MB outright, which is what
 * "Request Entity Too Large" was: not a bug in the upload, a photograph too
 * large to transport.
 *
 * Nothing in the workflow needs that resolution. The detector reads the slide
 * as 640px tiles, and the technologist reviews it on a screen far smaller than
 * 4032px, so the slide is scaled to `maxEdge` and re-encoded as JPEG. A
 * photograph already inside the bound is returned untouched rather than being
 * re-compressed for no gain.
 */
/**
 * Scales a data URL to `maxEdge` on the longest edge.
 *
 * When a pre-decoded `bitmap` is supplied, it is reused so the image is never
 * decoded a second time — the caller already paid that cost in `loadImageSource`.
 */
export async function downscaleImage(
  dataUrl: string,
  { maxEdge = STORED_SLIDE_MAX_EDGE, quality = 0.85, bitmap }: { maxEdge?: number; quality?: number; bitmap?: ImageBitmap } = {}
): Promise<string> {
  let image: HTMLImageElement;
  if (bitmap) {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return dataUrl;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    image = { naturalWidth: bitmap.width, naturalHeight: bitmap.height, src: '' } as unknown as HTMLImageElement;
    const src = canvas.toDataURL('image/jpeg', quality);
    const { width, height } = scaledDimensions(bitmap.width, bitmap.height, maxEdge);
    if (width === bitmap.width && height === bitmap.height) return src;
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const outCtx = out.getContext('2d');
    if (!outCtx) return src;
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';
    outCtx.drawImage(canvas, 0, 0, width, height);
    return out.toDataURL('image/jpeg', quality);
  }

  try {
    image = await drawImage(dataUrl);
  } catch {
    return dataUrl;
  }

  const { naturalWidth: width, naturalHeight: height } = image;
  if (!width || !height) return dataUrl;

  const longest = Math.max(width, height);
  if (longest <= maxEdge) return dataUrl;

  const { width: targetWidth, height: targetHeight } = scaledDimensions(width, height, maxEdge);
  if (targetWidth === width && targetHeight === height) return dataUrl;

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Reads a chosen file as a data URL scaled for storage.
 *
 * Uploading goes through here so every path that adds a photograph — the file
 * picker, the microscope camera — pays the same once and none of them can
 * reintroduce the oversized body.
 */
export async function prepareImageForUpload(
  file: File,
  options?: { maxEdge?: number; quality?: number }
): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
  return downscaleImage(dataUrl, options);
}

/**
 * Loads a slide into base64 together with its true pixel dimensions.
 * Dimensions are required to translate provider-normalised coordinates into
 * pixel space, and fetching once avoids decoding the image twice.
 *
 * The blob is decoded exactly once, into an ImageBitmap that carries both the
 * dimensions and the pixels. The caller may pass that bitmap to
 * `sliceImageTiles` so tiling reuses the same decode instead of decoding the
 * slide a second time - a 3024x4032 photograph was being decoded once for its
 * size and again for every one of its 63 tiles.
 */
export async function loadImageSource(url: string): Promise<SourceImage> {
  let blob: Blob;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new InferenceError(`Could not load slide image (HTTP ${res.status}).`, res.status);
    }
    blob = await res.blob();
  } catch (err) {
    if (err instanceof InferenceError) throw err;
    throw new InferenceError(
      `Could not load slide image: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = () => reject(new InferenceError('Failed to encode slide image.'));
    reader.readAsDataURL(blob);
  });
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;

  const dimensions = await decodeDimensions(blob);

  return { base64, dataUrl, width: dimensions.width, height: dimensions.height, bitmap: dimensions.bitmap };
}

/**
 * The pixel size of a blob, decoded once.
 *
 * When `createImageBitmap` is available the bitmap is returned (not closed) so
 * the caller can hand it to the tiling worker with zero-copy Transfer semantics
 * and skip a second decode. When it is not available (e.g. jsdom in tests), the
 * `<img>` fallback is used and `bitmap` is undefined.
 */
async function decodeDimensions(blob: Blob): Promise<{ width: number; height: number; bitmap?: ImageBitmap }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      const size = { width: bitmap.width, height: bitmap.height, bitmap };
      return size;
    } catch {
      // Fall through to the <img> path.
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new InferenceError('Slide image could not be decoded.'));
    img.src = URL.createObjectURL(blob);
  });
}
