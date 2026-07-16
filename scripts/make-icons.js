/**
 * Generates the PWA icons as PNGs with no dependencies.
 * Run: node scripts/make-icons.js
 */

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A checkmark inside a rounded panel — reads clearly at 48px on a home screen. */
function draw(size, { bleed = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const bg = [13, 17, 23];
  const panel = [22, 27, 34];
  const green = [63, 185, 80];

  const inset = bleed ? 0 : size * 0.06;
  const r = size * 0.18;

  const px = (x, y, c, a = 255) => {
    const i = (y * size + x) * 4;
    buf[i] = c[0];
    buf[i + 1] = c[1];
    buf[i + 2] = c[2];
    buf[i + 3] = a;
  };

  const inRounded = (x, y, x0, y0, x1, y1, rad) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = Math.min(Math.max(x, x0 + rad), x1 - rad);
    const cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
    return (x - cx) ** 2 + (y - cy) ** 2 <= rad ** 2;
  };

  // Checkmark geometry: two strokes meeting at the elbow.
  const a = { x: size * 0.29, y: size * 0.52 };
  const b = { x: size * 0.44, y: size * 0.67 };
  const c = { x: size * 0.72, y: size * 0.35 };
  const w = size * 0.075;

  const distToSeg = (px_, py_, p1, p2) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const l2 = dx * dx + dy * dy;
    let t = ((px_ - p1.x) * dx + (py_ - p1.y) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    const qx = p1.x + t * dx;
    const qy = p1.y + t * dy;
    return Math.hypot(px_ - qx, py_ - qy);
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      px(x, y, bg, bleed ? 255 : 0);

      if (inRounded(x, y, inset, inset, size - inset, size - inset, r)) {
        px(x, y, panel, 255);
      } else if (!bleed) {
        continue;
      }

      const d = Math.min(distToSeg(x, y, a, b), distToSeg(x, y, b, c));
      if (d <= w / 2) {
        px(x, y, green, 255);
      } else if (d <= w / 2 + 1.2) {
        // Cheap antialias on the stroke edge.
        const t = 1 - (d - w / 2) / 1.2;
        const base = inRounded(x, y, inset, inset, size - inset, size - inset, r) ? panel : bg;
        px(
          x,
          y,
          [
            Math.round(base[0] + (green[0] - base[0]) * t),
            Math.round(base[1] + (green[1] - base[1]) * t),
            Math.round(base[2] + (green[2] - base[2]) * t),
          ],
          255
        );
      }
    }
  }
  return buf;
}

const out = path.join(__dirname, '..', 'icons');
fs.mkdirSync(out, { recursive: true });

for (const size of [192, 512]) {
  fs.writeFileSync(path.join(out, `icon-${size}.png`), png(size, size, draw(size)));
  console.log(`icons/icon-${size}.png`);
}
fs.writeFileSync(
  path.join(out, 'icon-maskable-512.png'),
  png(512, 512, draw(512, { bleed: true }))
);
console.log('icons/icon-maskable-512.png');
