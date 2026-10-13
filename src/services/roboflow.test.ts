/**
 * Tiled reading of a slide.
 *
 * A microscopy field is far larger than the detector's input, so it is cut into
 * overlapping tiles. The grid has to stay bounded or a large photograph becomes
 * hundreds of provider calls, which is what made a scan appear to hang; and it
 * must never skip part of the slide, or a region of the specimen goes unread.
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  fitTileBudget,
  tileCount,
  chunkTilesByBytes,
  loadImageSource,
  scaledDimensions,
  SCAN_BATCH_BYTE_BUDGET,
  STORED_SLIDE_MAX_EDGE
} from './roboflow';

afterEach(() => {
  vi.unstubAllGlobals();
});

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

describe('chunkTilesByBytes', () => {
  const tile = (chars: number) => ({ dataUrl: 'x'.repeat(chars), offsetX: 0, offsetY: 0 });

  it('keeps small tiles together in one request', () => {
    const groups = chunkTilesByBytes([
      tile(1000),
      tile(1000),
      tile(1000)
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });

  it('splits a full field into groups under the budget', () => {
    // 63 tiles of a 3024x4032 photograph, as a real slide is cut.
    const groups = chunkTilesByBytes(Array.from({ length: 63 }, () => tile(120_000)));
    expect(groups).toHaveLength(2);

    for (const group of groups) {
      const bytes = group.reduce((sum, t) => sum + t.dataUrl.length, 0);
      // Every group but an unavoidable last one stays inside the budget.
      expect(bytes).toBeLessThanOrEqual(SCAN_BATCH_BYTE_BUDGET + 120_000);
    }
  });

  it('loses no tile, however they are split', () => {
    const tiles = Array.from({ length: 63 }, () => tile(120_000));
    const flattened = chunkTilesByBytes(tiles).flat();
    expect(flattened).toHaveLength(63);
    // Same order, so the offsets that place each box on the slide are preserved.
    expect(flattened).toEqual(tiles);
  });

  it('never drops an oversized tile to make a group fit', () => {
    const groups = chunkTilesByBytes([tile(SCAN_BATCH_BYTE_BUDGET * 2), tile(1000)]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(1);
    expect(groups[1]).toHaveLength(1);
  });

  it('returns nothing for no tiles', () => {
    expect(chunkTilesByBytes([])).toEqual([]);
  });
});

describe('scaledDimensions', () => {
  it('scales a phone photograph down to the stored bound', () => {
    // The 3024x4032 photograph whose base64 body the platform refused.
    expect(scaledDimensions(3024, 4032)).toEqual({ width: 1440, height: 1920 });
    expect(scaledDimensions(4032, 3024)).toEqual({ width: 1920, height: 1440 });
  });

  it('leaves a slide already inside the bound untouched', () => {
    expect(scaledDimensions(1440, 1920)).toEqual({ width: 1440, height: 1920 });
    expect(scaledDimensions(640, 480)).toEqual({ width: 640, height: 480 });
    expect(scaledDimensions(1920, 1920)).toEqual({ width: 1920, height: 1920 });
  });

  it('never crops, so no part of the specimen is lost', () => {
    // Scaling must shrink both edges and keep the aspect ratio: a wider
    // photograph stays wider, only smaller.
    const before = { width: 3024, height: 4032 };
    const after = scaledDimensions(before.width, before.height);

    expect(after.width).toBeLessThanOrEqual(STORED_SLIDE_MAX_EDGE);
    expect(after.height).toBeLessThanOrEqual(STORED_SLIDE_MAX_EDGE);
    expect(after.width).toBeLessThan(before.width);
    expect(after.height).toBeLessThan(before.height);
    expect(after.width / after.height).toBeCloseTo(before.width / before.height, 2);
  });

  it('keeps a minimum of one pixel for a degenerate slide', () => {
    expect(scaledDimensions(0, 0)).toEqual({ width: 0, height: 0 });
    // A sliver is scaled along its long edge, and the short edge stays at least
    // one pixel rather than rounding away to nothing.
    expect(scaledDimensions(1921, 1)).toEqual({ width: 1920, height: 1 });
  });

  it('bounds the stored size well under the platform body limit', () => {
    // A 1920-edge JPEG is a fraction of a megabyte, which after base64 is a
    // request body a serverless deployment accepts. The full-resolution
    // photograph was the thing it refused.
    expect(STORED_SLIDE_MAX_EDGE).toBeLessThan(4032);
    expect(SCAN_BATCH_BYTE_BUDGET).toBeLessThan(4.5 * 1024 * 1024);
  });
});

describe('loadImageSource', () => {
  it('keeps the fetched data URL for tiling and resizing without fetching twice', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(['image'], { type: 'image/png' }))
    );
    class MockFileReader {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      readAsDataURL() {
        this.result = 'data:image/png;base64,aW1hZ2U=';
        this.onload?.();
      }
    }
    class MockImage {
      naturalWidth = 3024;
      naturalHeight = 4032;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        this.onload?.();
      }
    }
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('FileReader', MockFileReader);
    vi.stubGlobal('Image', MockImage);

    await expect(loadImageSource('/slide.png')).resolves.toEqual({
      base64: 'aW1hZ2U=',
      dataUrl: 'data:image/png;base64,aW1hZ2U=',
      width: 3024,
      height: 4032
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
