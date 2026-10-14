/**
 * The rule that decides whether two boxes are one object or two.
 *
 * The operator's requirement is one mark per physical organism: a single ovum the
 * model labels two ways, or reports twice with a few pixels of drift, is one
 * finding. Two ova side by side are two findings, and folding them would
 * under-count the specimen — which on a stool field is the more dangerous error.
 */
import { describe, it, expect } from 'vitest';
import { applyNMS, isSameOrganism } from './inference.js';

const box = (overrides = {}) => ({
  class: 'Hookworm egg',
  confidence: 0.9,
  x: 100,
  y: 100,
  width: 24,
  height: 20,
  ...overrides
});

/** How much of the smaller box the two boxes share. */
function containment(a, b) {
  const w = Math.min(a.x + a.width / 2, b.x + b.width / 2) - Math.max(a.x - a.width / 2, b.x - b.width / 2);
  const h = Math.min(a.y + a.height / 2, b.y + b.height / 2) - Math.max(a.y - a.height / 2, b.y - b.height / 2);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(a.width * a.height, b.width * b.height);
}

describe('isSameOrganism', () => {
  it('folds one ovum the model reported twice with a few pixels of drift', () => {
    // Wedge 8px apart: 0.36 by IoU, which the old rule missed entirely, and
    // 0.53 by containment, which catches it.
    expect(isSameOrganism(box(), box({ x: 108, y: 101 }))).toBe(true);
  });

  it('folds a tight box sitting inside a loose one for the same ovum', () => {
    // 0.13 by IoU — the same ovum found once tightly and once loosely.
    expect(isSameOrganism(
      box({ width: 16, height: 14 }),
      box({ width: 44, height: 40 })
    )).toBe(true);
  });

  it('folds one object that received two different names', () => {
    // One ovum labelled both ways. The strongest prediction is kept, so this is
    // one finding rather than two different parasites.
    expect(isSameOrganism(
      box({ class: 'Hookworm egg', confidence: 0.88 }),
      box({ class: 'Ascaris lumbricoides', confidence: 0.81, x: 106, y: 102 })
    )).toBe(true);
  });

  it('keeps two ova that merely touch', () => {
    // Touching ova share nothing, so containment is 0 and they must both count.
    expect(isSameOrganism(box({ x: 300 }), box({ x: 324 }))).toBe(false);
  });

  it('keeps two ova that overlap slightly', () => {
    // A 4px overlap between separate ova: 0.17 by containment, well below the
    // merge threshold. Dense clusters of eggs are the common case on a field.
    expect(containment(box({ x: 300 }), box({ x: 320 }))).toBeCloseTo(0.17, 2);
    expect(isSameOrganism(box({ x: 300 }), box({ x: 320 }))).toBe(false);
  });

  it('keeps a different parasite elsewhere in the field', () => {
    expect(isSameOrganism(
      box({ class: 'Hookworm egg' }),
      box({ class: 'Ascaris lumbricoides', x: 420, y: 360 })
    )).toBe(false);
  });
});

describe('applyNMS', () => {
  it('keeps one mark per physical object and drops the rest', () => {
    const detections = [
      box({ confidence: 0.88, class: 'Hookworm egg', x: 300, y: 200 }),
      box({ confidence: 0.81, class: 'Ascaris lumbricoides', x: 306, y: 202 }),
      box({ confidence: 0.77, class: 'Hookworm egg', x: 312, y: 204 }),
      // A separate ovum, far enough away to survive.
      box({ confidence: 0.72, class: 'Hookworm egg', x: 560, y: 480 })
    ];

    const kept = applyNMS(detections);

    expect(kept).toHaveLength(2);
    // The strongest reading of each object is the one kept.
    expect(kept[0].confidence).toBe(0.88);
    expect(kept[1].confidence).toBe(0.72);
  });

  it('returns the input untouched when nothing overlaps', () => {
    const detections = [
      box({ x: 100, y: 100 }),
      box({ x: 300, y: 100 }),
      box({ x: 500, y: 100 })
    ];
    expect(applyNMS(detections)).toHaveLength(3);
  });

  it('handles an empty candidate list', () => {
    expect(applyNMS([])).toEqual([]);
  });
});
