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
