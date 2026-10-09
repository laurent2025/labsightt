/**
 * Server-side Roboflow inference proxy.
 *
 * The API key lives only in the server's environment. It is never returned by
 * any endpoint, never sent to the browser, and never written to the database.
 * This is the control that makes the client-side key exposure disappear.
 */
import { appendAudit } from './audit.js';

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 250;
const DEFAULT_WORKFLOW_ENDPOINT =
  'https://serverless.roboflow.com/laurent-kashinje/workflows/labsight-vlabsight-3-yolo26m-t1-logic';

/**
 * Reads the inference configuration from environment variables, falling back
 * to the bundled defaults. The API key is never included in any status payload
 * returned to clients.
 */
function envConfig() {
  return {
    endpoint: process.env.ROBOFLOW_ENDPOINT || DEFAULT_WORKFLOW_ENDPOINT,
    apiKey: process.env.ROBOFLOW_API_KEY || '',
    timeoutMs: Number(process.env.ROBOFLOW_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
  };
}

export function inferenceStatus() {
  const { endpoint, apiKey } = envConfig();
  return {
    // Report only whether a credential is configured. The value is never echoed.
    configured: Boolean(endpoint && apiKey),
    endpoint: endpoint || null,
    credentialSource: 'server environment'
  };
}

class InferenceError extends Error {
  constructor(message, status = 502, retryable = false) {
    super(message);
    this.name = 'InferenceError';
    this.status = status;
    this.retryable = retryable;
  }
}

/**
 * Runs a workflow inference and returns normalized bounding boxes.
 *
 * The request is given an AbortSignal so a hung provider cannot pin a server
 * thread indefinitely.
 */
export async function runInference(db, actor, imageBase64, { confidence = 0.3 } = {}) {
  const { endpoint, apiKey, timeoutMs } = envConfig();

  // Development mock mode: returns synthetic detections when explicitly
  // enabled via ROBOFLOW_MOCK=true, or automatically in non-production
  // environments when no API key is configured. This lets the system
  // work without a real Roboflow API key during development and testing.
  const mockMode = process.env.ROBOFLOW_MOCK === 'true' ||
    (process.env.NODE_ENV !== 'production' && !apiKey);
  if (mockMode) {
    return [
      { class: 'parasite', confidence: 0.92, x: 120, y: 80, width: 40, height: 35 },
      { class: 'ova', confidence: 0.87, x: 200, y: 150, width: 25, height: 20 },
      { class: 'leukocyte', confidence: 0.78, x: 300, y: 200, width: 15, height: 15 }
    ];
  }

  if (!endpoint || !apiKey) {
    throw new InferenceError(
      'Inference is not configured on the server. Set ROBOFLOW_API_KEY; set ROBOFLOW_ENDPOINT only to override the default workflow.',
      503
    );
  }
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    throw new InferenceError('No image was supplied for inference.', 400);
  }

  const providerImage = imageBase64.replace(/^data:[^,]*;base64,/i, '');
  const payload = await requestWorkflow(endpoint, apiKey, providerImage, timeoutMs);

  const predictions = extractPredictions(payload);
  const detections = predictions
    .map(p => toDetection(p))
    .filter(Boolean)
    .filter(d => d.confidence >= confidence);

  appendAudit(db, {
    actorId: actor.id,
    actorName: actor.display_name,
    action: 'INFERENCE_EXECUTED',
    entity: 'analysis',
    details: `proposed ${detections.length} candidate(s) above confidence ${confidence}`
  });

  return detections;
}

/**
 * Sends the workflow request to the provider with retry logic for transient
 * failures (408, 429, 5xx). Hung requests are aborted after the configured
 * timeout so server threads are not pinned indefinitely.
 */
async function requestWorkflow(endpoint, apiKey, imageBase64, timeoutMs) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let failure;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          inputs: { image: { type: 'base64', value: imageBase64 } }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        const message = response.status === 402
          ? ''
          : `Inference provider returned HTTP ${response.status}.`;
        throw new InferenceError(
          message,
          response.status === 402 ? 402 : 502,
          retryable
        );
      }

      try {
        return await response.json();
      } catch {
        throw new InferenceError('Inference provider returned invalid JSON.');
      }
    } catch (err) {
      if (err instanceof InferenceError) {
        failure = err;
      } else if (err?.name === 'AbortError') {
        failure = new InferenceError(`Inference timed out after ${timeoutMs}ms.`, 504, true);
      } else {
        failure = new InferenceError('Could not reach the inference provider.', 502, true);
      }
    } finally {
      clearTimeout(timer);
    }

    if (!failure.retryable || attempt === MAX_RETRIES) throw failure;
    await new Promise(resolve => setTimeout(resolve, RETRY_BASE_DELAY_MS * (2 ** attempt)));
  }

  throw new InferenceError('Inference request failed.', 502);
}

/**
 * Walks the provider's nested workflow output looking for anything shaped like
 * a prediction. The exact envelope varies by workflow, so this is tolerant by
 * design rather than pinned to one provider response shape.
 */
function extractPredictions(payload) {
  const found = [];

  const visit = (node, depth) => {
    if (!node || depth > 8) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;

    if (isPrediction(node)) {
      found.push(node);
      return;
    }
    for (const value of Object.values(node)) visit(value, depth + 1);
  };

  visit(payload, 0);
  return found;
}

/**
 * Determines whether a node looks like a prediction object by checking for
 * a class label and a confidence/score value.
 */
function isPrediction(node) {
  const hasClass =
    typeof node.class === 'string' ||
    typeof node.prediction === 'string' ||
    typeof node.label === 'string';
  const hasConfidence =
    typeof node.confidence === 'number' ||
    typeof node.confidence === 'string' ||
    typeof node.score === 'number';
  return hasClass && hasConfidence;
}

/**
 * Normalizes a provider prediction node into an internal detection object.
 * Returns null if required geometry fields are missing or non-finite.
 */
function toDetection(node) {
  const className = node.class ?? node.prediction ?? node.label;
  const rawConfidence = Number(node.confidence ?? node.score);
  if (!Number.isFinite(rawConfidence)) return null;

  // Center-based Roboflow geometry.
  const x = num(node.x);
  const y = num(node.y);
  const width = num(node.width);
  const height = num(node.height);
  if ([x, y, width, height].some(v => v === null)) return null;

  return {
    class: String(className),
    // Providers report 0-1; some report 0-100.
    confidence: rawConfidence > 1 ? rawConfidence / 100 : rawConfidence,
    x,
    y,
    width,
    height
  };
}

/**
 * Coerces a value to a finite number, returning null when it is not.
 */
function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export { InferenceError };
