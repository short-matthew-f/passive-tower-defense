// Generates the PWA icons from a hand-drawn 16x16 pixel sprite (no image deps).
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const PAL = {
  '.': null,
  B: [0x14, 0x0c, 0x1c], // background
  K: [0x0a, 0x04, 0x10], // outline
  H: [0x5c, 0x3a, 0x6e], // helm
  h: [0x8a, 0x5c, 0x9e], // helm highlight
  C: [0xe8, 0xd0, 0x8a], // crown / horn
  G: [0x8f, 0xd1, 0x4f], // eyes
  R: [0xc0, 0x3a, 0x3a], // gem
};

// The Overlord's horned helm.
const SPRITE = [
  '................',
  '.C............C.',
  '.CC..........CC.',
  '..CC..C..C..CC..',
  '..CKKKCKKCKKKC..',
  '...KhhhhRhhhK...',
  '...KhHHHHHHhK...',
  '..KhHHHHHHHHhK..',
  '..KHHKKKKKKHHK..',
  '..KHKGGKKGGKHK..',
  '..KHKKKKKKKKHK..',
  '..KHHHKKKKHHHK..',
  '...KHHKHHKHHK...',
  '...KHHKHHKHHK...',
  '....KKKKKKKK....',
  '................',
];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, padFrac) {
  const pad = Math.round(size * padFrac);
  const cell = Math.floor((size - pad * 2) / 16);
  const off = Math.floor((size - cell * 16) / 2);
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const sx = Math.floor((x - off) / cell), sy = Math.floor((y - off) / cell);
      let col = PAL.B;
      if (sx >= 0 && sx < 16 && sy >= 0 && sy < 16) col = PAL[SPRITE[sy][sx]] ?? PAL.B;
      raw.set(col, y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = (name, size, pad) => writeFileSync(new URL(`../public/${name}`, import.meta.url), png(size, pad));
out('favicon.png', 64, 0);
out('apple-touch-icon.png', 180, 0.06);
out('icon-192.png', 192, 0.06);
out('icon-512.png', 512, 0.06);
out('icon-maskable-512.png', 512, 0.2);
console.log('icons written');
