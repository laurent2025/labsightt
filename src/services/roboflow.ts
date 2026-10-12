import { SampleType } from '../types';

export interface InferenceOptions {
  apiKey?: string;
  modelId?: string;
  version?: string | number;
  workspace?: string;
  workflowId?: string;
  endpoint?: string;
  isWorkflow?: boolean;
  confidenceThreshold?: number;
  iouThreshold?: number;
  sampleType?: SampleType;
}

/** A detection expressed in absolute image pixels, ready for canvas rendering. */
export interface PixelDetection {
  class: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One crop of a slide, with where it was taken from in whole-slide pixels. */
export interface ImageTile {
  dataUrl: string;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
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

/** Tiles a slide of this size needs at a given tile edge and stride. */
export function tileCount(width: number, height: number, tileSize: number, stride: number): number {
  const columns = width <= tileSize ? 1 : Math.ceil(width / stride);
  const rows = height <= tileSize ? 1 : Math.ceil(height / stride);
  return columns * rows;
}

/**
 * Grows the tile edge until the slide fits the tile budget.
 *
 * The tile is enlarged rather than the grid trimmed, so every part of the slide
 * is still read even when a slide is far larger than expected. A larger tile is
 * presented to the detector at a slightly smaller scale, which costs some
 * sensitivity on the smallest ova, but it never silently skips a region of the
 * specimen the way dropping tiles would.
 */
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

function drawImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new InferenceError('Slide image could not be decoded.'));
    img.src = url;
  });
}

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
 */
export async function sliceImageTiles(
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
 * Base64 bytes one batched scan request is allowed to carry.
 *
 * A batched scan reads a whole slide in one request so the server can read its
 * tiles in parallel, but a serverless deployment still refuses a request body
 * over ~4.5 MB, and the tiles of a full field do not fit in that. Tiles travel
 * in groups under this budget, which costs a handful of requests for a 63-tile
 * field — the per-request overhead was what made a scan take minutes, and a few
 * of them is a few of them.
 */
export const SCAN_BATCH_BYTE_BUDGET = 3 * 1024 * 1024;

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
  width: number;
  height: number;
}

/** Raised when no Roboflow credential is configured. Never auto-defaults. */
export class MissingApiKeyError extends Error {
  constructor() {
    super('No Roboflow API key is configured. Add one in the AI Models tab before running inference.');
    this.name = 'MissingApiKeyError';
  }
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
export async function downscaleImage(
  dataUrl: string,
  { maxEdge = STORED_SLIDE_MAX_EDGE, quality = 0.85 }: { maxEdge?: number; quality?: number } = {}
): Promise<string> {
  let image: HTMLImageElement;
  try {
    image = await drawImage(dataUrl);
  } catch {
    // An undecodable image is the caller's problem to report; silently sending
    // the original would only move the failure.
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

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new InferenceError('Failed to encode slide image.'));
    reader.readAsDataURL(blob);
  });

  const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const urlForDecode = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(urlForDecode);
    };
    img.onerror = () => {
      URL.revokeObjectURL(urlForDecode);
      reject(new InferenceError('Slide image could not be decoded.'));
    };
    img.src = urlForDecode;
  });

  return { base64, width: dimensions.width, height: dimensions.height };
}

/**
 * Roboflow serverless workflows nest their payload differently depending on
 * the graph, so walk the response for the first usable predictions array.
 */
function extractPredictionsFromWorkflowOutput(data: unknown): unknown[] {
  if (!data || typeof data !== 'object') return [];

  const record = data as Record<string, unknown>;

  if (Array.isArray(record.predictions)) return record.predictions;

  if (Array.isArray(data)) {
    for (const item of data) {
      const found = extractPredictionsFromWorkflowOutput(item);
      if (found.length > 0) return found;
    }
    return [];
  }

  if (record.outputs) {
    if (Array.isArray(record.outputs)) {
      for (const out of record.outputs) {
        const found = extractPredictionsFromWorkflowOutput(out);
        if (found.length > 0) return found;
      }
    } else if (typeof record.outputs === 'object') {
      for (const key of Object.keys(record.outputs as Record<string, unknown>)) {
        const found = extractPredictionsFromWorkflowOutput(
          (record.outputs as Record<string, unknown>)[key]
        );
        if (found.length > 0) return found;
      }
    }
  }

  for (const key of Object.keys(record)) {
    if (key === 'predictions' && Array.isArray(record[key])) {
      return record[key] as unknown[];
    }
    if (record[key] && typeof record[key] === 'object') {
      const found = extractPredictionsFromWorkflowOutput(record[key]);
      if (found.length > 0) return found;
    }
  }

  return [];
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Converts a provider prediction into pixel space.
 *
 * Roboflow returns centre-based x/y and width/height normalised to 0..1 for
 * hosted inference, but some workflow steps emit raw pixels. Detect which by
 * magnitude rather than trusting a flag, then clamp into the image.
 */
function toPixelDetection(
  raw: unknown,
  image: { width: number; height: number }
): PixelDetection | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;

  const className =
    (typeof p.class === 'string' && p.class) ||
    (typeof p.class_name === 'string' && p.class_name) ||
    (typeof p.label === 'string' && p.label) ||
    (typeof p.name === 'string' && p.name) ||
    'Unclassified Element';

  // Score is required; never invent a confidence for clinical output.
  const confidence = readNumber(p.confidence) ?? readNumber(p.score);
  if (confidence === null) return null;

  const rawX = readNumber(p.x);
  const rawY = readNumber(p.y);
  const rawW = readNumber(p.width);
  const rawH = readNumber(p.height);
  if (rawX === null || rawY === null || rawW === null || rawH === null) return null;

  const normalised = rawW <= 1 && rawH <= 1;
  const scaleX = normalised ? image.width : 1;
  const scaleY = normalised ? image.height : 1;

  const width = Math.max(1, Math.min(rawW * scaleX, image.width));
  const height = Math.max(1, Math.min(rawH * scaleY, image.height));

  let x = rawX * scaleX;
  let y = rawY * scaleY;

  // Providers disagree on whether x/y is the centre or the top-left corner.
  // Values landing exactly on the far edge are the tell-tale of top-left.
  if (x > image.width) x -= width;
  if (y > image.height) y -= height;
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x > image.width - width) x = Math.max(0, image.width - width);
  if (y > image.height - height) y = Math.max(0, image.height - height);

  return {
    class: className,
    confidence: Math.min(1, Math.max(0, confidence)),
    x: x + width / 2,
    y: y + height / 2,
    width,
    height,
  };
}

function isWorkflowRequest(options: InferenceOptions): boolean {
  return Boolean(
    options.isWorkflow ||
      options.workflowId ||
      options.endpoint?.includes('serverless.roboflow.com') ||
      options.modelId?.includes('workflow')
  );
}

async function runRoboflowWorkflow(
  image: SourceImage,
  options: InferenceOptions,
  apiKey: string
): Promise<PixelDetection[]> {
  const {
    workspace = 'laurent-kashinje',
    workflowId = 'labsight-vlabsight-3-yolo26m-t1-logic',
    endpoint = `https://serverless.roboflow.com/${workspace}/workflows/${workflowId}`
  } = options;

  const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(apiKey)}`;

  let resultData: unknown;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        inputs: { image: { type: 'base64', value: image.base64 } }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let msg = errorText;
      try {
        const parsed = JSON.parse(errorText) as { message?: string; error?: string };
        msg = parsed.message || parsed.error || errorText;
      } catch {
        // keep raw text
      }
      throw new InferenceError(
        `Roboflow workflow returned HTTP ${response.status}: ${msg}`,
        response.status
      );
    }
    resultData = await response.json();
  } catch (err) {
    if (err instanceof InferenceError) throw err;
    throw new InferenceError(
      `Could not reach the Roboflow workflow: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return extractPredictionsFromWorkflowOutput(resultData)
    .map(raw => toPixelDetection(raw, image))
    .filter((d): d is PixelDetection => d !== null);
}

async function runHostedInference(
  image: SourceImage,
  options: InferenceOptions,
  apiKey: string
): Promise<PixelDetection[]> {
  const { modelId, version, confidenceThreshold = 0.3, iouThreshold = 0.4 } = options;

  if (!modelId || !version) {
    throw new InferenceError('This model is missing a Roboflow model ID or version.');
  }

  const endpoint =
    `https://detect.roboflow.com/${encodeURIComponent(modelId)}/${encodeURIComponent(String(version))}` +
    `?api_key=${encodeURIComponent(apiKey)}` +
    `&confidence=${Math.round(confidenceThreshold * 100)}` +
    `&overlap=${Math.round(iouThreshold * 100)}&format=json`;

  let payload: unknown;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: image.base64
    });

    if (!response.ok) {
      const errorText = await response.text();
      let msg = errorText;
      try {
        const parsed = JSON.parse(errorText) as { message?: string; error?: string };
        msg = parsed.message || parsed.error || errorText;
      } catch {
        // keep raw text
      }
      throw new InferenceError(
        `Roboflow inference returned HTTP ${response.status}: ${msg}`,
        response.status
      );
    }
    payload = await response.json();
  } catch (err) {
    if (err instanceof InferenceError) throw err;
    throw new InferenceError(
      `Could not reach Roboflow inference: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const raw = (payload as { predictions?: unknown })?.predictions;
  if (!Array.isArray(raw)) {
    throw new InferenceError('Roboflow returned a response with no predictions array.');
  }

  return raw
    .map(item => toPixelDetection(item, image))
    .filter((d): d is PixelDetection => d !== null);
}

/**
 * Runs object detection and returns detections in absolute image pixels.
 *
 * Throws MissingApiKeyError or InferenceError on any failure. There is
 * deliberately no simulated fallback: a fabricated detection on a clinical
 * specimen is worse than a visible error.
 */
export async function runRoboflowInference(
  image: SourceImage,
  options: InferenceOptions
): Promise<PixelDetection[]> {
  const apiKey = (options.apiKey ?? '').trim();
  if (!apiKey) throw new MissingApiKeyError();

  const threshold = options.confidenceThreshold ?? 0.3;

  const detections = isWorkflowRequest(options)
    ? await runRoboflowWorkflow(image, options, apiKey)
    : await runHostedInference(image, options, apiKey);

  return detections.filter(d => d.confidence >= threshold);
}
