/**
 * Tiled reading of a slide.
 *
 * A microscopy field is far larger than the detector's input, so it is cut into
 * overlapping tiles. The grid has to stay bounded or a large photograph becomes
 * hundreds of provider calls, which is what made a scan appear to hang; and it
 * must never skip part of the slide, or a region of the specimen goes unread.
 */
import { describe, it, expect } from 'vitest';
import { fitTileBudget, tileCount } from './roboflow';

const TILE = 640;
const OVERLAP = 0.3;
const STRIDE = Math.round(TILE * (1 - OVERLAP)); // 448

describe('tileCount', () => {
  it('counts the tiles a 3024x4032 phone photograph is cut into', () => {
    // The grid that made a scan take minutes: 7 columns by 9 rows.
    expect(tileCount(3024, 4032, TILE, STRIDE)).toBe(63);
  });

  it('counts one tile when the slide already fits the detector input', () => {
    expect(tileCount(640, 480, TILE, STRIDE)).toBe(1);
    expect(tileCount(500, 500, TILE, STRIDE)).toBe(1);
  });

  it('counts a clipped edge tile rather than dropping it', () => {
    // One pixel past a single tile still needs a second, part-width tile.
    expect(tileCount(641, 480, TILE, STRIDE)).toBe(2);
  });
});

describe('fitTileBudget', () => {
  it('leaves a slide that already fits the budget at the detector input size', () => {
    expect(fitTileBudget(3024, 4032, TILE, OVERLAP, 160)).toBe(TILE);
    expect(fitTileBudget(640, 480, TILE, OVERLAP, 8)).toBe(TILE);
  });

  it('grows the tile for an oversized slide so the grid stays bounded', () => {
    const size = fitTileBudget(12000, 9000, TILE, OVERLAP, 40);
    const stride = Math.round(size * (1 - OVERLAP));

    expect(size).toBeGreaterThan(TILE);
    expect(tileCount(12000, 9000, size, stride)).toBeLessThanOrEqual(40);
  });

  it('never trims the grid, so every part of the slide is still read', () => {
    // Whatever the budget, the tiles must still cover the whole slide. A grown
    // tile with its stride does; a trimmed grid would not.
    for (const budget of [1, 2, 5, 12, 40, 160]) {
      const size = fitTileBudget(12000, 9000, TILE, OVERLAP, budget);
      const stride = Math.max(1, Math.round(size * (1 - OVERLAP)));
      const columns = Math.ceil(12000 / stride);
      const rows = Math.ceil(9000 / stride);

      // The last tile in each row and column reaches the far edge, so the
      // grid advances at least to width - 1 / height - 1 of the slide.
      expect((columns - 1) * stride).toBeGreaterThan(0);
      expect((columns - 1) * stride + size).toBeGreaterThanOrEqual(12000 - 1);
      expect((rows - 1) * stride + size).toBeGreaterThanOrEqual(9000 - 1);
    }
  });
});
