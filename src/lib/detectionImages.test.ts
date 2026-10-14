/**
 * The crop that gets stored with a decision.
 *
 * The geometry is what decides whether the stored picture shows the organism or
 * a sliver of slide edge, so it is tested directly rather than through the UI
 * that draws it.
 */

import { describe, it, expect } from 'vitest';
import {
  cropDetectionRect,
  detectionImageSource,
  DETECTION_IMAGE_MAX_EDGE
} from './detectionImages';

const SLIDE = { width: 1920, height: 1080 };

describe('cropDetectionRect', () => {
  it('keeps the box with as much field again around it', () => {
    const rect = cropDetectionRect({ x: 960, y: 540, width: 40, height: 36 }, SLIDE);

    // Padding follows the box's longest side, so a wide box gets a square crop
    // rather than a wide one: the organism is what the crop is judged on.
    expect(rect).toEqual({ x: 900, y: 482, width: 120, height: 116 });
    // The box stays centred inside the crop.
    expect(rect!.x + rect!.width / 2).toBe(960);
    expect(rect!.y + rect!.height / 2).toBe(540);
  });

  it('clamps into the slide instead of reading outside it', () => {
    const rect = cropDetectionRect({ x: 20, y: 20, width: 30, height: 24 }, SLIDE);

    expect(rect!.x).toBe(0);
    expect(rect!.y).toBe(0);
    // Grown back to a legible size rather than left as a one-sided sliver.
    expect(rect!.width).toBeGreaterThanOrEqual(48);
    expect(rect!.height).toBeGreaterThanOrEqual(48);
  });

  it('shrinks a box near the far edge without leaving the slide', () => {
    const rect = cropDetectionRect({ x: 1900, y: 1060, width: 30, height: 30 }, SLIDE);

    expect(rect!.x + rect!.width).toBeLessThanOrEqual(SLIDE.width);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(SLIDE.height);
    expect(rect!.width).toBeGreaterThan(0);
    expect(rect!.height).toBeGreaterThan(0);
  });

  it('ignores extra context and keeps a plain box when context is zero', () => {
    const rect = cropDetectionRect({ x: 100, y: 100, width: 60, height: 60 }, SLIDE, 0);

    expect(rect).toEqual({ x: 70, y: 70, width: 60, height: 60 });
  });

  it('grows a small box back to a legible size', () => {
    const rect = cropDetectionRect({ x: 100, y: 100, width: 60, height: 20 }, SLIDE, 0);

    // Below the minimum edge the crop is grown around the centre, not left as
    // a sliver nobody can judge.
    expect(rect!.height).toBeGreaterThanOrEqual(48);
    expect(rect!.y + rect!.height / 2).toBe(100);
    expect(rect!.x + rect!.width / 2).toBe(100);
  });

  it('rejects a box that describes nothing', () => {
    expect(cropDetectionRect({ x: 10, y: 10, width: 0, height: 0 }, SLIDE)).toBeNull();
    expect(cropDetectionRect({ x: 10, y: 10, width: -5, height: 20 }, SLIDE)).toBeNull();
    expect(cropDetectionRect({ x: 10, y: 10, width: 10, height: 10 }, { width: 0, height: 0 })).toBeNull();
  });

  it('rejects a box with unusable coordinates rather than cropping NaN', () => {
    expect(cropDetectionRect({ x: Number.NaN, y: 10, width: 10, height: 10 }, SLIDE)).toBeNull();
  });
});

describe('detectionImageSource', () => {
  it('names the decision the crop evidences', () => {
    expect(detectionImageSource({ manual: true })).toBe('manual_label');
    expect(detectionImageSource({ confirmed: true })).toBe('confirmed');
    expect(detectionImageSource({ rejected: true })).toBe('rejected');
    expect(detectionImageSource({})).toBe('reset');
  });

  it('records a rejection over a confirmation when both are claimed', () => {
    // A client that sends both has already been refused upstream; the crop is
    // labelled with the decision that was actually taken.
    expect(detectionImageSource({ confirmed: true, rejected: true })).toBe('rejected');
  });
});

describe('crop size bound', () => {
  it('keeps stored crops small enough to travel with a decision', () => {
    expect(DETECTION_IMAGE_MAX_EDGE).toBeLessThanOrEqual(640);
  });
});
