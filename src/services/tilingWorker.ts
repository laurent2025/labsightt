/**
 * Tiling worker.
 *
 * Runs in a background thread so the browser's main thread stays responsive
 * while a full microscopy field is decoded, cropped into overlapping tiles,
 * and re-encoded as JPEG. A 3024x4032 photograph is 63 tiles; doing that on
 * the UI thread blocks every click and repaint for the whole scan.
 *
 * The worker receives a data URL and a tiling config and returns the tiles.
 * It never touches the DOM, the React tree, or any shared state, so it is safe
 * to transfer in and out of the main thread by message.
 */

export interface WorkerTilingConfig {
  tileSize: number;
  overlap: number;
  maxTiles: number;
  quality: number;
}

export interface WorkerTile {
  dataUrl: string;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export interface WorkerRequest {
  id: string;
  dataUrl: string;
  config: WorkerTilingConfig;
}

export interface WorkerBitmapRequest {
  id: string;
  bitmap: ImageBitmap;
  config: WorkerTilingConfig;
}

export interface WorkerResponse {
  id: string;
  tiles: WorkerTile[] | null;
  error?: string;
}

const MIN_TILE_EDGE = 32;

export function tileCount(width: number, height: number, tileSize: number, stride: number): number {
  const columns = width <= tileSize ? 1 : Math.ceil(width / stride);
  const rows = height <= tileSize ? 1 : Math.ceil(height / stride);
  return columns * rows;
}

export function fitTileBudget(
  width: number,
  height: number,
  tileSize: number,
  overlap: number,
  maxTiles: number
): number {
  if (!maxTiles || maxTiles < 1) return tileSize;
  let size = tileSize;
  for (let guard = 0; guard < 32; guard += 1) {
    const stride = Math.max(1, Math.round(size * (1 - overlap)));
    if (tileCount(width, height, size, stride) <= maxTiles) return size;
    size = Math.round(size * 1.3);
  }
  return size;
}

function decodeImage(dataUrl: string): Promise<ImageBitmap> {
  return createImageBitmap(new Blob([dataUrl], { type: 'image/*' }));
}

/**
 * Crops a slide into overlapping tiles. Runs entirely off the main thread.
 *
 * Returns null when the slide already fits one tile, which is the common case
 * for a phone photograph and means no tiling is needed.
 */
export async function sliceImageTilesOffThread(
  dataUrl: string,
  config: WorkerTilingConfig
): Promise<WorkerTile[] | null> {
  const bitmap = await decodeImage(dataUrl);
  return sliceImageTilesFromBitmap(bitmap, config);
}

type AnyWorkerRequest = WorkerRequest | WorkerBitmapRequest;

function isBitmapRequest(req: AnyWorkerRequest): req is WorkerBitmapRequest {
  return 'bitmap' in req;
}

/**
 * Crops a slide into overlapping tiles using a pre-decoded bitmap.
 *
 * This avoids the second decode that `sliceImageTilesOffThread` would do for the
 * same image: `loadImageSource` already decoded once via `createImageBitmap`, so
 * the caller can pass that bitmap in with zero-copy Transferable semantics and
 * skip decoding the photograph a second time. A 3024x4032 image saves ~40ms of
 * decoder time plus an avoidable full-image JPEG re-encode on the main thread.
 */
export async function sliceImageTilesFromBitmap(
  bitmap: ImageBitmap,
  config: WorkerTilingConfig
): Promise<WorkerTile[] | null> {
  const requested = Math.max(64, Math.round(config.tileSize) || 640);
  const overlap = Math.min(0.5, Math.max(0, Number(config.overlap) || 0));
  const maxTiles = Math.max(1, Math.round(Number(config.maxTiles) || 160));

  const width = bitmap.width;
  const height = bitmap.height;
  if (!width || !height) {
    bitmap.close();
    return null;
  }

  const tileSize = fitTileBudget(width, height, requested, overlap, maxTiles);
  if (width <= tileSize && height <= tileSize) {
    bitmap.close();
    return null;
  }

  const step = Math.max(1, Math.round(tileSize * (1 - overlap)));
  const tiles: WorkerTile[] = [];

  for (let offsetY = 0; offsetY < height; offsetY += step) {
    for (let offsetX = 0; offsetX < width; offsetX += step) {
      const tileWidth = Math.min(tileSize, width - offsetX);
      const tileHeight = Math.min(tileSize, height - offsetY);
      if (tileWidth < MIN_TILE_EDGE || tileHeight < MIN_TILE_EDGE) continue;

      const canvas = new OffscreenCanvas(tileWidth, tileHeight);
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.drawImage(bitmap, offsetX, offsetY, tileWidth, tileHeight, 0, 0, tileWidth, tileHeight);

      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: config.quality });
      const dataUrlOut = await bitmapToDataURL(blob);
      tiles.push({
        dataUrl: dataUrlOut,
        offsetX,
        offsetY,
        width: tileWidth,
        height: tileHeight
      });

      if (offsetX + tileWidth >= width) break;
    }
    if (offsetY + Math.min(tileSize, height - offsetY) >= height) break;
  }

  bitmap.close();
  return tiles.length > 0 ? tiles : null;
}

async function bitmapToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to encode tile'));
    reader.readAsDataURL(blob);
  });
}

if (typeof self !== 'undefined') {
  const workerSelf = self as unknown as {
    onmessage: (ev: MessageEvent<AnyWorkerRequest>) => void;
    postMessage: (msg: WorkerResponse, transfer?: Transferable[]) => void;
  };

  workerSelf.onmessage = (event: MessageEvent<AnyWorkerRequest>) => {
    const req = event.data;
    const { id, config } = req;
    const bitmapPromise = isBitmapRequest(req)
      ? Promise.resolve(req.bitmap)
      : decodeImage(req.dataUrl);

    bitmapPromise
      .then(bitmap => sliceImageTilesFromBitmap(bitmap, config))
      .then(tiles => {
        const response: WorkerResponse = { id, tiles };
        workerSelf.postMessage(response);
      })
      .catch(() => {
        const response: WorkerResponse = {
          id,
          tiles: null,
          error: 'The slide could not be prepared for analysis. Please try again.'
        };
        workerSelf.postMessage(response);
      });
  };
}
