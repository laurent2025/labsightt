/**
 * Server-side Roboflow inference proxy.
 *
 * The API key lives only in the server's environment. It is never returned by
 * any endpoint, never sent to the browser, and never written to the database.
 * This is the control that makes the client-side key exposure disappear.
 */
import { appendAudit } from './audit.js';

const DEFAULT_TIMEOUT_MS = 60_000;

function envConfig() {
  return {
    endpoint: process.env.ROBOFLOW_ENDPOINT || '',
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
  constructor(message, status = 502) {
    super(message);
    this.name = 'InferenceError';
    this.status = status;
  }
}

/**
 * Runs a workflow inference and returns normalized bounding boxes.
 *
 * The request is given an AbortSignal so a hung provider cannot pin a server
 * thread indefinitely.
 */
export async function runInference(db, actor, imageBase64, { confidence = 0.5 } = {}) {
  const { endpoint, apiKey, timeoutMs } = envConfig();

  if (!endpoint || !apiKey) {
    throw new InferenceError(
      'Inference is not configured on the server. Set ROBOFLOW_ENDPOINT and ROBOFLOW_API_KEY.',
      503
    );
  }
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    throw new InferenceError('No image was supplied for inference.', 400);
  }

  const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let payload;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        inputs: { image: { type: 'base64', value: imageBase64 } }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      // Never echo provider text verbatim: it can contain the key in a URL echo.
      throw new InferenceError(
        `Inference provider returned HTTP ${response.status}.`,
        response.status === 401 || response.status === 403 ? 502 : 502
      );
    }
    payload = await response.json();
  } catch (err) {
    if (err instanceof InferenceError) throw err;
    if (err.name === 'AbortError') {
      throw new InferenceError(`Inference timed out after ${timeoutMs}ms.`, 504);
    }
    throw new InferenceError('Could not reach the inference provider.', 502);
  } finally {
    clearTimeout(timer);
  }

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

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export { InferenceError };
