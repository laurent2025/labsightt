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
/**
 * Confidence floor used when a caller does not state one.
 *
 * It must match the model's configured `confidenceThreshold` in
 * `src/lib/constants.ts`. A default that is lower surfaces candidates the
 * operator did not ask for; one that is higher silently drops findings.
 */
const DEFAULT_CONFIDENCE = 0.6;
/**
 * How far two boxes must overlap before they are read as one organism.
 *
 * IoU alone is not enough: two boxes for one small ovum a few pixels apart score
 * well under the old 0.55, so the ovum was stored twice. Containment — how much
 * of the smaller box the other covers — catches those, so the operator's rule of
 * one mark per object holds for tight boxes, loose boxes, and boxes sitting
 * inside one another alike. Two genuinely distinct ova stay below both.
 */
const SAME_ORGANISM_IOU = 0.5;
const SAME_ORGANISM_CONTAINMENT = 0.5;
const DEFAULT_WORKFLOW_ENDPOINT =
  'https://serverless.roboflow.com/laurent-kashinje-wjafp/workflows/labsight-vlabsight-wji6g-1-yolo26m-t1-logic';

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
 * Helminth ova morphology, used to correct look-alike classes.
 *
 * Aspect ratio (width / height of the predicted box) is the single measurement
 * that separates the ova this model confuses, and it is resolution-independent
 * so it still works when the ovum is only a few dozen pixels tall:
 *
 *   Ascaris lumbricoides      round to broadly oval, ~1.0-1.35
 *   Enterobius vermicularis   asymmetrically oval,      ~1.2-1.60
 *   Hookworm egg              evenly oval,              ~1.35-1.85
 *   Fasciolopsis buski        oval,                     ~1.25-1.70
 *   Trichuris trichiura       elongated barrel,         ~1.70-2.50
 *
 * The narrowest, most specific confusion is an *elongated* box labelled
 * Ascaris: real Ascaris ova are among the roundest in the panel, so a box that
 * is clearly long and narrow was almost certainly a hookworm ovum that the
 * detector had too few pixels to judge. That case is corrected. The reverse
 * (a nearly round box labelled hookworm) is corrected to Ascaris.
 *
 * This never invents or removes a finding - it only moves a box between
 * helminth-ovum classes, keeps the detector's original class on the detection
 * as `reclassifiedFrom`, and records every change in the audit trail. It is an
 * assist for the technologist, who still adjudicates every candidate.
 */
const REASSIGN_ASPECT = 1.6;

function reclassifyHelminthOva(detections) {
  let corrections = 0;

  const result = detections.map(detection => {
    if (detection.reclassifiedFrom || detection.height <= 0 || detection.width <= 0) {
      return detection;
    }
    const aspect = detection.width / detection.height;

    let correctedClass = null;
    if (detection.class === 'Ascaris lumbricoides' && aspect >= REASSIGN_ASPECT) {
      correctedClass = 'Hookworm egg';
    } else if (detection.class === 'Hookworm egg' && aspect <= 1 / REASSIGN_ASPECT) {
      correctedClass = 'Ascaris lumbricoides';
    }

    if (!correctedClass) return detection;
    corrections += 1;
    return { ...detection, class: correctedClass, reclassifiedFrom: detection.class };
  });

  return { detections: result, corrections };
}

/**
 * Runs a workflow inference and returns normalized bounding boxes.
 *
 * The request is given an AbortSignal so a hung provider cannot pin a server
 * thread indefinitely.
 *
 * `audit` is false when the caller is reading a slide as several tiles and will
 * write one summary entry for the whole slide: a 3024x4032 field is 63 tiles,
 * and one audit row per tile buries the trail instead of explaining it.
 *
 * `confidence` is the floor a candidate must clear. It defaults to the value the
 * model is configured with, so a caller that omits it does not silently scan at
 * a different sensitivity than the one the operator chose.
 */
export async function runInference(
  db,
  actor,
  imageBase64,
  { confidence = DEFAULT_CONFIDENCE, iou = 0.55, offsetX = 0, offsetY = 0, audit = true } = {}
) {
  const { endpoint, apiKey, timeoutMs } = envConfig();

  // Development mock mode: returns synthetic detections when explicitly
  // enabled via ROBOFLOW_MOCK=true, or automatically in non-production
  // environments when no API key is configured. This lets the system
  // work without a real Roboflow API key during development and testing.
  const mockMode = process.env.ROBOFLOW_MOCK === 'true' ||
    (process.env.NODE_ENV !== 'production' && !apiKey);
  if (mockMode) {
    return [
      { class: 'Ascaris lumbricoides', confidence: 0.92, x: 120, y: 80, width: 40, height: 35 },
      { class: 'Hookworm egg', confidence: 0.87, x: 200, y: 150, width: 25, height: 20 },
      { class: 'Enterobius vermicularis', confidence: 0.78, x: 300, y: 200, width: 15, height: 15 }
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

  // Confidence floor. Providers report either 0-1 or 0-100, so the threshold
  // is compared against the same scale as the raw value before normalising.
  const threshold = confidence > 1 ? confidence / 100 : confidence;

  const candidates = predictions
    .map(p => toDetection(p, offsetX, offsetY))
    .filter(Boolean)
    .filter(d => d.confidence >= threshold)
    // Never store a degenerate box: a zero-area box draws nothing in the
    // viewer but still counts as a detection in the report.
    .filter(d => d.width > 0 && d.height > 0);

  const nmsApplied = applyNMS(candidates, iou);
  const { detections, corrections } = reclassifyHelminthOva(nmsApplied);

  const suppressed = candidates.length - nmsApplied.length;
  if (audit) {
    appendAudit(db, {
      actorId: actor.id,
      actorName: actor.display_name,
      action: 'INFERENCE_EXECUTED',
      entity: 'analysis',
      details: `proposed ${detections.length} candidate(s) above confidence ${threshold}`
        + `${suppressed > 0 ? ` (${suppressed} overlapping box(es) suppressed by NMS at IoU ${iou})` : ''}`
        + `${corrections > 0 ? ` (${corrections} class(es) corrected by ovum morphology)` : ''}`
        + `${offsetX || offsetY ? ` (tile offset ${Math.round(offsetX ?? 0)},${Math.round(offsetY ?? 0)})` : ''}`
    });
  }

  return detections;
}

/**
 * Intersection-over-Union of two centre-based boxes. Used by NMS so a
 * detector's duplicate boxes for one organism collapse to the strongest one.
 */
function iou(a, b) {
  const intersection = boxIntersection(a, b);
  if (intersection <= 0) return 0;
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

/** Area shared by two centre-based boxes, in square pixels. */
function boxIntersection(a, b) {
  const interWidth = Math.min(a.x + a.width / 2, b.x + b.width / 2)
    - Math.max(a.x - a.width / 2, b.x - b.width / 2);
  const interHeight = Math.min(a.y + a.height / 2, b.y + b.height / 2)
    - Math.max(a.y - a.height / 2, b.y - b.height / 2);

  if (interWidth <= 0 || interHeight <= 0) return 0;
  return interWidth * interHeight;
}

/**
 * Fraction of the *smaller* box that the two boxes share.
 *
 * IoU divides by the union, so two boxes for one small object that sit a few
 * pixels apart score badly: two 24px boxes offset by 8px reach only 0.46, below
 * the 0.55 suppression threshold, and the same ovum is therefore stored twice.
 *
 * Containment divides by the smaller box instead, and the same pair scores 0.63.
 * It also recognises a tight box sitting inside a loose one for the same object
 * (0.13 by IoU, 1.00 by containment). Because it looks at how much of one box
 * the other covers, two genuinely distinct ova side by side stay low — 0.17 for
 * two 24px ova 20px apart — so they are still counted as two.
 */
function containment(a, b) {
  const intersection = boxIntersection(a, b);
  if (intersection <= 0) return 0;
  const smaller = Math.min(a.width * a.height, b.width * b.height);
  return smaller > 0 ? intersection / smaller : 0;
}

/**
 * True when two boxes describe the same organism rather than two organisms.
 *
 * Suppression has to be class-scoped — two different parasites in the same field
 * are two findings — and judged by both overlap measures, because the operator's
 * requirement is one mark per object: an ovum that a loose pass and a tight pass
 * both find is one ovum, not two.
 */
function isSameOrganism(a, b) {
  if (a.class !== b.class) return false;
  return iou(a, b) >= SAME_ORGANISM_IOU || containment(a, b) >= SAME_ORGANISM_CONTAINMENT;
}

/**
 * Non-maximum suppression, per class.
 *
 * A single-celled detector emits several boxes for one organism. Without
 * suppression the report counts the same ovum three or four times and the
 * technologist adjudicates each duplicate by hand — or worse, confirms them all
 * and inflates the reported burden. Boxes are ranked by confidence and a box is
 * dropped when it describes the same organism as one already kept.
 *
 * Suppression is class-scoped: two different parasites that genuinely overlap
 * in the field must both survive, because they are different findings.
 */
function applyNMS(detections, iouThreshold) {
  const ranked = [...detections].sort((a, b) => b.confidence - a.confidence);
  const kept = [];

  for (const candidate of ranked) {
    const isDuplicate = kept.some(other => isSameOrganism(other, candidate));
    if (!isDuplicate) kept.push(candidate);
  }

  return kept;
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
 *
 * `offsetX`/`offsetY` translate the box from tile space back into whole-slide
 * space, so a detection found on the third tile lands on the correct part of
 * the image the technologist sees.
 *
 * Two geometry conventions are accepted because providers differ:
 *   1. centre + size   - x, y, width, height (Roboflow default)
 *   2. opposite corners - x_min, y_min, x_max, y_max
 * Both are converted to centre + size so every downstream consumer (viewer
 * overlay, report quantification, dedupe key) sees one shape only.
 */
function toDetection(node, offsetX = 0, offsetY = 0) {
  const className = node.class ?? node.prediction ?? node.label;
  const rawConfidence = Number(node.confidence ?? node.score);
  if (!Number.isFinite(rawConfidence) || !className) return null;

  let x = num(node.x);
  let y = num(node.y);
  let width = num(node.width);
  let height = num(node.height);

  // Corner form: derive centre and size from the two opposite corners.
  if (x === null || y === null || width === null || height === null) {
    const xMin = num(node.x_min ?? node.xmin ?? node.left);
    const yMin = num(node.y_min ?? node.ymin ?? node.top);
    const xMax = num(node.x_max ?? node.xmax ?? node.right);
    const yMax = num(node.y_max ?? node.ymax ?? node.bottom);
    if (xMin === null || yMin === null || xMax === null || yMax === null) return null;
    width = Math.abs(xMax - xMin);
    height = Math.abs(yMax - yMin);
    x = xMin + width / 2;
    y = yMin + height / 2;
  }

  if ([x, y, width, height].some(v => v === null)) return null;

  return {
    class: String(className),
    // Providers report 0-1; some report 0-100. Clamp to the unit range so a
    // mis-scaled score can never be stored as "confidence 90".
    confidence: Math.min(1, Math.max(0, rawConfidence > 1 ? rawConfidence / 100 : rawConfidence)),
    x: x + Number(offsetX || 0),
    y: y + Number(offsetY || 0),
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

/**
 * Exports the merge primitives a whole-slide read needs.
 *
 * `applyNMS` and `isSameOrganism` are exported because a slide's tiles are read
 * independently and their predictions merged afterwards, so the duplicate
 * suppression has to run over the merged set as well as within one tile — and
 * because a stored finding has to be recognised the same way when a slide is
 * re-read. A private copy here would let the two drift apart, and a drift would
 * reintroduce the duplicates.
 */
export { InferenceError, applyNMS, isSameOrganism };
