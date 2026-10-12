/**
 * The detection model's configuration.
 *
 * The confidence floor is the single number that decides what a technologist is
 * shown, so it is asserted here rather than left to drift: a silent change to it
 * changes which parasites reach a human at all.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_AI_MODELS } from './constants';

describe('DEFAULT_AI_MODELS', () => {
  it('proposes candidates at the configured confidence floor', () => {
    for (const model of DEFAULT_AI_MODELS) {
      expect(model.confidenceThreshold).toBe(0.6);
    }
  });

  it('keeps the floor inside the documented 0.10-0.95 range', () => {
    for (const model of DEFAULT_AI_MODELS) {
      expect(model.confidenceThreshold).toBeGreaterThanOrEqual(0.1);
      expect(model.confidenceThreshold).toBeLessThanOrEqual(0.95);
    }
  });

  it('reads the slide as tiles at the detector input size', () => {
    // Tiling is what keeps a small ovum at its native resolution; without it a
    // full field is downscaled and the faintest targets vanish.
    for (const model of DEFAULT_AI_MODELS) {
      expect(model.tiling?.enabled).toBe(true);
      expect(model.tiling?.tileSize).toBe(640);
    }
  });

  it('suppresses duplicate boxes loosely enough to keep neighbouring ova', () => {
    // NMS folds two overlapping boxes of the same class into one. A tight
    // threshold merges neighbouring ova and under-counts the specimen.
    for (const model of DEFAULT_AI_MODELS) {
      expect(model.iouThreshold).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('declares only parasites the model is actually configured to report', () => {
    for (const model of DEFAULT_AI_MODELS) {
      expect(model.classes.length).toBeGreaterThan(0);
      for (const parasite of model.reportedParasites ?? []) {
        expect(model.classes).toContain(parasite);
      }
    }
  });

  it('states the not-clinically-validated disclaimer beside the detection targets', () => {
    // An accuracy claim on a clinical device would need validation data that
    // does not exist for this software, so the disclaimer is asserted where it
    // is written rather than as a field nothing renders.
    const source = readFileSync(new URL('./constants.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/not clinically validated/i);
    expect(source).toMatch(/technologist review/i);
  });
});
