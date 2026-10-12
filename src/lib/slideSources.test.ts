/**
 * How a specimen's scanned images are described.
 *
 * A specimen may be uploaded as one photograph or several. Every finding names
 * the image it came from, and the headings state how many images were scanned
 * alongside how many examined fields — so a four-image read across ten fields
 * cannot be mistaken for one image across ten fields.
 */
import { describe, it, expect } from 'vitest';
import {
  orderImageRefs,
  imageRefLabel,
  quantificationHeading,
  targetsHeading,
  allSourcesOptionLabel,
  PRIMARY_IMAGE_REF
} from './slideSources';

describe('orderImageRefs', () => {
  it('puts the specimen image first, then orders the rest', () => {
    expect(orderImageRefs(['slide-b', PRIMARY_IMAGE_REF, 'slide-a'])).toEqual([
      PRIMARY_IMAGE_REF,
      'slide-a',
      'slide-b'
    ]);
  });

  it('collapses repeats and is stable for the same set', () => {
    const refs = ['slide-a', PRIMARY_IMAGE_REF, 'slide-a', 'slide-b'];
    const first = orderImageRefs(refs);
    // The ordinal fallback names depend on this order, so it must not depend on
    // input order or on how many times a ref appears.
    expect(first).toEqual(orderImageRefs(['slide-b', 'slide-b', 'slide-a', PRIMARY_IMAGE_REF]));
    expect(first).toHaveLength(3);
  });

  it('handles a single image and an empty list', () => {
    expect(orderImageRefs([PRIMARY_IMAGE_REF])).toEqual([PRIMARY_IMAGE_REF]);
    expect(orderImageRefs([])).toEqual([]);
  });
});

describe('imageRefLabel', () => {
  const ordered = orderImageRefs([PRIMARY_IMAGE_REF, 'slide-a', 'slide-b']);

  it('prefers the name the image was uploaded under', () => {
    expect(imageRefLabel('slide-a', { 'slide-a': 'Field 4, right upper quadrant' }, ordered))
      .toBe('Field 4, right upper quadrant');
  });

  it('names the specimen image and never shows a raw id', () => {
    expect(imageRefLabel(PRIMARY_IMAGE_REF, {}, ordered)).toBe('Specimen image');
    // An uploaded image the panel has no name for gets an ordinal, not the
    // opaque id a technologist cannot act on.
    expect(imageRefLabel('slide-b', {}, ordered)).toBe('Source image 3');
  });

  it('names a blank ref rather than leaving the label empty', () => {
    expect(imageRefLabel('', {}, ordered)).toBe('Unnamed image');
  });

  it('ignores a name that is only whitespace', () => {
    expect(imageRefLabel('slide-a', { 'slide-a': '   ' }, ordered)).toBe('Source image 2');
  });

  it('falls back to the ref when it is not in the ordered set', () => {
    expect(imageRefLabel('unknown-slide', {}, ordered)).toBe('unknown-slide');
  });
});

describe('quantificationHeading', () => {
  it('names both the images scanned and the examined fields', () => {
    expect(quantificationHeading(4, 10)).toBe('4 Images Scanned · 10 Examined Fields');
    expect(quantificationHeading(1, 10)).toBe('1 Image Scanned · 10 Examined Fields');
  });

  it('singularises a single examined field', () => {
    expect(quantificationHeading(2, 1)).toBe('2 Images Scanned · 1 Examined Field');
  });

  it('omits the image count when nothing was scanned', () => {
    expect(quantificationHeading(0, 10)).toBe('10 Examined Fields');
    expect(quantificationHeading(0, 1)).toBe('1 Examined Field');
  });
});

describe('targetsHeading', () => {
  it('shows a filtered view as visible of total', () => {
    expect(targetsHeading(3, 12, true)).toBe('3 of 12');
  });

  it('shows an unfiltered view as a bare count', () => {
    // A bare number when unfiltered, or the count reads as a filtered subset.
    expect(targetsHeading(12, 12, false)).toBe('12');
  });
});

describe('allSourcesOptionLabel', () => {
  const ordered = orderImageRefs([PRIMARY_IMAGE_REF, 'slide-a']);

  it('summarises every image when there is more than one', () => {
    expect(allSourcesOptionLabel(2, 9, PRIMARY_IMAGE_REF, {}, ordered)).toBe('All images (9)');
  });

  it('names the single image when the specimen was scanned once', () => {
    // "All images" when there is only one image invites the operator to wonder
    // where the others are.
    expect(allSourcesOptionLabel(1, 9, PRIMARY_IMAGE_REF, {}, ordered)).toBe('Specimen image (9)');
    expect(allSourcesOptionLabel(1, 9, 'slide-a', { 'slide-a': 'Field 2' }, ordered)).toBe('Field 2 (9)');
  });

  it('falls back gracefully with no image at all', () => {
    expect(allSourcesOptionLabel(0, 0, undefined, {}, [])).toBe('All images (0)');
  });
});
