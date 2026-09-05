/**
 * Dependency-free PWA icon generator.
 *
 * Renders the EgoPay mark (royal-blue gradient rounded square + bold white
 * "E") into 192x192, 512x512 and 512x512 maskable PNGs using a minimal PNG
 * encoder (zlib for compression, zlib.crc32 for chunk checksums). No external
 * packages, no system tools — runs anywhere Node does.
 *
 * Usage:  node scripts/generate-icons.mjs
 */
import { crc32, deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'public', 'icons');

// ---------------------------------------------------------------------------
// Minimal PNG encoder (RGBA8, non-interlaced)
// ---------------------------------------------------------------------------

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

const GRAD_TOP = [0x3b, 0x82, 0xf6]; // #3b82f6
const GRAD_BOTTOM = [0x1e, 0x40, 0xaf]; // #1e40af

/** Signed distance to a rounded rectangle centered at (cx, cy). */
function roundedRectSdf(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * The "E" as four rounded bars in normalized coordinates (0..1, y down).
 * Returns per-pixel white coverage 0..1 with ~1px antialiasing.
 */
function drawLetter(size, scale) {
  const coverage = Buffer.alloc(size * size);
  const bars = [
    { cx: 0.24, cy: 0.5, hw: 0.06 * scale, hh: 0.36 * scale, r: 0.028 * scale }, // stem
    { cx: 0.5, cy: 0.2, hw: 0.32 * scale, hh: 0.06 * scale, r: 0.028 * scale }, // top
    { cx: 0.4, cy: 0.5, hw: 0.22 * scale, hh: 0.06 * scale, r: 0.028 * scale }, // middle
    { cx: 0.5, cy: 0.8, hw: 0.32 * scale, hh: 0.06 * scale, r: 0.028 * scale }, // bottom
  ];
  for (let y = 0; y < size; y++) {
    const ny = y / size;
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      let d = Infinity;
      for (const b of bars) {
        d = Math.min(d, roundedRectSdf(nx, ny, b.cx, b.cy, b.hw, b.hh, b.r));
      }
      // d is in normalized units; convert to px and apply ~1px AA edge.
      const alpha = Math.max(0, Math.min(1, 0.5 - d * size));
      coverage[y * size + x] = Math.round(alpha * 255);
    }
  }
  return coverage;
}

function makeIcon(size, { rounded = true, letterScale = 0.55 } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const radius = rounded ? Math.round(size * 0.22) : 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bgAlpha = 255;
      if (rounded) {
        // Rounded-rect coverage for the background square.
        const cx = Math.min(Math.max(x, radius), size - radius);
        const cy = Math.min(Math.max(y, radius), size - radius);
        const d = Math.hypot(x - cx, y - cy);
        if (d > radius) bgAlpha = 0;
        else if (d > radius - 1.5) bgAlpha = Math.round(((radius - d) / 1.5) * 255);
      }

      const t = (x + y) / (2 * size);
      const r = Math.round(GRAD_TOP[0] + (GRAD_BOTTOM[0] - GRAD_TOP[0]) * t);
      const g = Math.round(GRAD_TOP[1] + (GRAD_BOTTOM[1] - GRAD_TOP[1]) * t);
      const b = Math.round(GRAD_TOP[2] + (GRAD_BOTTOM[2] - GRAD_TOP[2]) * t);
      const i = (y * size + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = bgAlpha;
    }
  }

  // Composite the white letter on top.
  const letter = drawLetter(size, letterScale);
  for (let i = 0; i < letter.length; i++) {
    const w = letter[i] / 255;
    if (w <= 0) continue;
    const px = i * 4;
    buf[px] = Math.round(buf[px] + (255 - buf[px]) * w);
    buf[px + 1] = Math.round(buf[px + 1] + (255 - buf[px + 1]) * w);
    buf[px + 2] = Math.round(buf[px + 2] + (255 - buf[px + 2]) * w);
  }

  return encodePng(size, size, buf);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192, rounded: true, letterScale: 0.55 },
  { file: 'icon-512.png', size: 512, rounded: true, letterScale: 0.55 },
  // Maskable: full-bleed background (platform may crop), letter inside the
  // 80% safe zone.
  { file: 'icon-512-maskable.png', size: 512, rounded: false, letterScale: 0.46 },
];

for (const t of targets) {
  const png = makeIcon(t.size, t);
  const out = join(OUT_DIR, t.file);
  writeFileSync(out, png);
  console.log(`wrote ${out} (${png.length} bytes)`);
}