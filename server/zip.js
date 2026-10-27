/**
 * A zip file, stored without compression.
 *
 * The images are JPEG and the deployment carries no zip library, so
 * compressing them would cost CPU and save nothing. The format is written
 * directly: each entry is a local header and its bytes, followed by a central
 * directory and its end record, which is the shape every unzip tool reads.
 *
 * Kept in its own module so the byte format is in one place and the route that
 * uses it does not have to know how a zip is built.
 */

/**
 * Builds a zip from the files given.
 *
 * Each file is `{ name, data }`. The caller controls ordering; this function
 * does not sort, so a download keeps the order the operator chose.
 */
export function encodeZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = Buffer.from(file.name, 'utf8');
    const crc = crc32(file.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // general purpose flags
    local.writeUInt16LE(0, 8); // compression: stored
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0, 12); // mod date
    local.writeUInt32LE(crc, 14); // crc-32
    local.writeUInt32LE(file.data.length, 18); // compressed size
    local.writeUInt32LE(file.data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBytes.length, 26); // file name length
    local.writeUInt16LE(0, 28); // extra field length
    locals.push(local, nameBytes, file.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // general purpose flags
    central.writeUInt16LE(0, 10); // compression: stored
    central.writeUInt16LE(0, 12); // mod time
    central.writeUInt16LE(0, 14); // mod date
    central.writeUInt32LE(crc, 16); // crc-32
    central.writeUInt32LE(file.data.length, 20); // compressed size
    central.writeUInt32LE(file.data.length, 24); // uncompressed size
    central.writeUInt16LE(nameBytes.length, 28); // file name length
    central.writeUInt16LE(0, 30); // extra field length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42); // local header offset
    centrals.push(central, nameBytes);

    offset += 30 + nameBytes.length + file.data.length;
  }

  const centralDirectory = Buffer.concat(centrals);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // signature
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk with central directory
  end.writeUInt16LE(files.length, 8); // entries on this disk
  end.writeUInt16LE(files.length, 10); // total entries
  end.writeUInt32LE(centralDirectory.length, 12); // directory size
  end.writeUInt32LE(offset, 16); // directory offset
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...locals, centralDirectory, end]);
}

/**
 * The bytes a data URL carries.
 *
 * Base64 is four characters for every three bytes, and the trailing padding
 * is the only part that does not decode, so the size is read off the encoded
 * length rather than by decoding the whole slide just to count bytes.
 */
export function dataUrlSize(dataUrl) {
  if (typeof dataUrl !== 'string') return 0;
  const comma = dataUrl.indexOf(',');
  const base64 = comma < 0 ? '' : dataUrl.slice(comma + 1);
  if (!base64) return 0;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

/** Bytes of a data URL, or null when the value is not one. */
export function dataUrlToBytes(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  if (!/;base64$/i.test(dataUrl.slice(0, comma))) return null;
  try {
    return Buffer.from(dataUrl.slice(comma + 1), 'base64');
  } catch {
    return null;
  }
}

/** The extension a data URL's image type calls for. */
export function dataUrlExtension(dataUrl) {
  const match = /^data:([^;,]+)/i.exec(String(dataUrl ?? ''));
  if (!match) return '.jpg';
  const type = match[1].toLowerCase();
  if (type.includes('png')) return '.png';
  if (type.includes('webp')) return '.webp';
  if (type.includes('gif')) return '.gif';
  return '.jpg';
}

/** The media type a data URL declares, for the download's content type. */
export function imageContentType(dataUrl) {
  const match = /^data:([^;,]+)/i.exec(String(dataUrl ?? ''));
  const type = match ? match[1].toLowerCase() : '';
  if (type.startsWith('image/')) return type;
  return 'image/jpeg';
}

/**
 * A fragment that is safe inside a zip entry path.
 *
 * A slide name is operator input, so it may contain path separators or
 * characters a filesystem refuses. Keeping letters, digits and a few
 * separators is enough to stay recognisable, and the length cap keeps the
 * entry path inside what common unzip tools accept.
 */
export function zipSafeName(value) {
  const cleaned = String(value ?? '')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return cleaned || 'untitled';
}

/** A single saved image, with the name it should download under. */
export function scannedImageFile(image) {
  const bytes = dataUrlToBytes(image.imageData);
  if (!bytes) return null;
  const folder = zipSafeName(image.specimenLabel || image.sampleId || 'saved images');
  const label = zipSafeName(image.label || image.id);
  return { name: `${folder}/${label}${dataUrlExtension(image.imageData)}`, data: bytes };
}

/** A zip of the chosen saved images, one folder per specimen. */
export function buildScannedImagesZip(images) {
  const files = [];

  for (let index = 0; index < images.length; index += 1) {
    const file = scannedImageFile(images[index]);
    if (file) files.push({ ...file, name: `${index + 1}_${file.name}` });
  }

  return encodeZip(files);
}

/** CRC-32, the checksum every zip local and central header carries. */
const ZIP_CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) === 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = (crc >>> 8) ^ ZIP_CRC32_TABLE[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}