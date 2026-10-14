/**
 * The scanned-image archive.
 *
 * The zip is written by hand because the deployment carries no zip library and
 * the images are JPEG, so compressing them would buy nothing. A hand-rolled
 * binary format has no compiler to catch its mistakes, so these tests read the
 * archive back the way an unzip tool does: header by header.
 */
import { describe, it, expect } from 'vitest';
import {
  encodeZip,
  buildScannedImagesZip,
  zipSafeName,
  dataUrlToBytes,
  dataUrlSize,
  dataUrlExtension,
  imageContentType
} from './index.js';

/** A tiny valid PNG, so the archive holds real bytes to checksum. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AL+iQWnAAAAAElFTkSuQmCC';
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

/** Reads a zip's central directory the way an unzip tool does. */
function readZip(zip) {
  const entries = [];

  for (let offset = 0; offset < zip.length - 1; ) {
    if (zip.readUInt32LE(offset) !== 0x04034b50) break;

    const crc = zip.readUInt32LE(offset + 14);
    const size = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const name = zip.toString('utf8', offset + 30, offset + 30 + nameLength);

    const dataStart = offset + 30 + nameLength + extraLength;
    const data = zip.subarray(dataStart, dataStart + size);

    entries.push({ name, crc, size, data });
    offset = dataStart + size;
  }

  return entries;
}

/** Reads the end-of-central-directory record that closes an archive. */
function readEndRecord(zip) {
  for (let offset = zip.length - 22; offset >= 0; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) {
      return {
        entries: zip.readUInt16LE(offset + 10),
        directorySize: zip.readUInt32LE(offset + 12),
        directoryOffset: zip.readUInt32LE(offset + 16)
      };
    }
  }
  return null;
}

describe('zipSafeName', () => {  it('replaces characters a filesystem would refuse', () => {
    expect(zipSafeName('field 4 / right upper')).toBe('field_4_right_upper');
  });

  it('keeps a slide name recognisable rather than flattening it', () => {
    expect(zipSafeName('Slide_2026-04-11.jpg')).toBe('Slide_2026-04-11.jpg');
  });

  it('never returns an empty or separator-only fragment', () => {
    expect(zipSafeName('///')).toBe('untitled');
    expect(zipSafeName(undefined)).toBe('untitled');
  });

  it('trims an over-long name rather than overflowing the entry path', () => {
    expect(zipSafeName('x'.repeat(500)).length).toBe(80);
  });
});

describe('dataUrlToBytes', () => {
  it('decodes a base64 data URL', () => {
    expect(dataUrlToBytes(PNG_DATA_URL)?.length).toBeGreaterThan(0);
  });

  it('returns null for a value that is not a data URL', () => {
    expect(dataUrlToBytes('https://example.com/a.png')).toBeNull();
    expect(dataUrlToBytes(null)).toBeNull();
  });

  it('returns null for a URL that is not base64 encoded', () => {
    expect(dataUrlToBytes('data:image/png,raw')).toBeNull();
  });
});

describe('encodeZip', () => {
  it('writes an archive an unzip tool can read back', () => {
    const zip = encodeZip([
      { name: 'specimen/1_slide.png', data: Buffer.from(PNG_BASE64, 'base64') },
      { name: 'specimen/evidence/1_finding.png', data: Buffer.from('second-image', 'utf8') }
    ]);

    const entries = readZip(zip);
    expect(entries.map(entry => entry.name)).toEqual([
      'specimen/1_slide.png',
      'specimen/evidence/1_finding.png'
    ]);

    // The bytes survive the round trip, not just the names.
    expect(entries[0].data.toString('base64')).toBe(PNG_BASE64);
    expect(entries[1].data.toString()).toBe('second-image');

    const end = readEndRecord(zip);
    expect(end.entries).toBe(2);
    expect(end.directorySize).toBeGreaterThan(0);
    expect(end.directoryOffset).toBeGreaterThan(0);
  });

  it('checksums each entry so a corrupt archive can be spotted', () => {
    // "123456789" is the standard CRC-32 check string: any correct
    // implementation must return 0xcbf43926 for it, so an archive holding it
    // and reading back that checksum proves the arithmetic is right.
    const zip = encodeZip([{ name: 'a.png', data: Buffer.from('123456789', 'utf8') }]);

    const { crc } = readZip(zip)[0];
    expect(crc).toBe(0xcbf43926);
  });

  it('writes an empty archive rather than failing when there is nothing to save', () => {
    const zip = encodeZip([]);

    expect(zip.length).toBe(22);
    expect(readEndRecord(zip).entries).toBe(0);
  });
});

describe('buildScannedImagesZip', () => {
  const chosen = [
    {
      kind: 'specimen',
      id: 'sam-1',
      sampleId: 'sam-1',
      specimenLabel: 'SLD-1',
      label: 'Specimen image',
      imageData: PNG_DATA_URL
    },
    {
      kind: 'slide',
      id: 'slide-2',
      specimenLabel: 'SLD-1',
      label: 'field 4/right',
      imageData: PNG_DATA_URL
    },
    {
      kind: 'evidence',
      id: 'dimg-1',
      specimenLabel: 'Hookworm egg',
      label: 'Hookworm egg — confirmed',
      imageData: PNG_DATA_URL
    }
  ];

  it('nests every image under the specimen it belongs to', () => {
    const zip = buildScannedImagesZip(chosen);

    expect(readZip(zip).map(entry => entry.name)).toEqual([
      '1_SLD-1/Specimen_image.png',
      '2_SLD-1/field_4_right.png',
      '3_Hookworm_egg/Hookworm_egg_confirmed.png'
    ]);
  });

  it('skips an image that is not stored, rather than writing an empty file', () => {
    expect(readZip(buildScannedImagesZip([{ ...chosen[0], imageData: null }]))).toHaveLength(0);
    expect(readZip(buildScannedImagesZip([]))).toHaveLength(0);
  });

  it('names the file after the image the data URL declares', () => {
    const zip = buildScannedImagesZip([
      {
        kind: 'slide',
        id: 'primary',
        specimenLabel: 'SLD',
        label: 'photo',
        imageData: 'data:image/webp;base64,UklGRg=='
      }
    ]);

    expect(readZip(zip)[0].name).toBe('1_SLD/photo.webp');
  });
});

describe('data URL helpers', () => {
  it('reads the extension the data URL declares', () => {
    expect(dataUrlExtension('data:image/png;base64,AAAA')).toBe('.png');
    expect(dataUrlExtension('data:image/webp;base64,AAAA')).toBe('.webp');
    expect(dataUrlExtension('data:image/gif;base64,AAAA')).toBe('.gif');
    // An undeclared or unknown type still gets an image extension.
    expect(dataUrlExtension('data:application/octet-stream;base64,AAAA')).toBe('.jpg');
    expect(dataUrlExtension(null)).toBe('.jpg');
  });

  it('reads the media type the data URL declares', () => {
    expect(imageContentType('data:image/png;base64,AAAA')).toBe('image/png');
    expect(imageContentType('data:application/octet-stream;base64,AAAA')).toBe('image/jpeg');
  });

  it('reads a size without decoding the image', () => {
    // Base64 is four characters for every three bytes, so the encoded length
    // gives the size away without allocating the decoded buffer.
    const threeBytes = Buffer.from('abc', 'utf8').toString('base64');
    expect(dataUrlSize(`data:image/png;base64,${threeBytes}`)).toBe(3);

    const twoBytes = Buffer.from('ab', 'utf8').toString('base64');
    expect(dataUrlSize(`data:image/png;base64,${twoBytes}`)).toBe(2);
  });

  it('reports no size for a value that is not a data URL', () => {
    expect(dataUrlSize(null)).toBe(0);
    expect(dataUrlSize('data:image/png;base64,')).toBe(0);
  });
});
