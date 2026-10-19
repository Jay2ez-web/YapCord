// A small GIF89a encoder (no dependencies): colour quantisation (median cut) + LZW + animation + 1-bit transparency.
//
//   const bytes = YM.gif.encode({ width, height, frames: [Uint8ClampedArray RGBA, ...], delayMs: 40, loop: 0 });
//
// All frames share one global palette (256 colours, index 0 is the transparent colour when any pixel is transparent).
// Used by the PetPet plugin; written from the GIF89a specification, checked against Chromium's own GIF decoder in the tests.

const Gif = (YM.gif = {});

const OPAQUE_ALPHA = 128;

/** Median cut on a 5-5-5 bit histogram of the opaque pixels of every frame. Returns [[r,g,b], ...] (at most `max`). */
Gif.quantize = function quantize(frames, max) {
  const count = new Uint32Array(32768);
  const sumR = new Float64Array(32768);
  const sumG = new Float64Array(32768);
  const sumB = new Float64Array(32768);
  let any = false;
  for (const data of frames) {
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < OPAQUE_ALPHA) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      count[key]++;
      sumR[key] += r;
      sumG[key] += g;
      sumB[key] += b;
      any = true;
    }
  }
  if (!any) return [[0, 0, 0]];
  const bins = [];
  for (let k = 0; k < 32768; k++) if (count[k]) bins.push(k);
  const channel = (k, c) => (c === 0 ? sumR[k] : c === 1 ? sumG[k] : sumB[k]) / count[k];

  const makeBox = (list) => {
    let min = [255, 255, 255], maxv = [0, 0, 0], total = 0;
    for (const k of list) {
      total += count[k];
      for (let c = 0; c < 3; c++) {
        const v = channel(k, c);
        if (v < min[c]) min[c] = v;
        if (v > maxv[c]) maxv[c] = v;
      }
    }
    const range = [maxv[0] - min[0], maxv[1] - min[1], maxv[2] - min[2]];
    const axis = range[0] >= range[1] && range[0] >= range[2] ? 0 : range[1] >= range[2] ? 1 : 2;
    return { list, total, axis, range: range[axis] };
  };

  const boxes = [makeBox(bins)];
  while (boxes.length < max) {
    // split the box with the most pixels (weighted by how much its colours differ); stop when nothing can be split
    let best = -1, bestScore = 0;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.list.length < 2) continue;
      const score = b.total * (1 + b.range);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) break;
    const box = boxes[best];
    const sorted = box.list.slice().sort((a, b) => channel(a, box.axis) - channel(b, box.axis));
    let acc = 0, cut = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
      acc += count[sorted[i]];
      cut = i + 1;
      if (acc >= box.total / 2) break;
    }
    boxes.splice(best, 1, makeBox(sorted.slice(0, cut)), makeBox(sorted.slice(cut)));
  }
  return boxes.map((b) => {
    let r = 0, g = 0, bl = 0, n = 0;
    for (const k of b.list) {
      r += sumR[k]; g += sumG[k]; bl += sumB[k]; n += count[k];
    }
    return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
  });
};

/** LZW-compress colour indices the way GIF wants it (variable code size, clear code when the table is full). */
Gif.lzw = function lzw(indices, minCodeSize) {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  const out = [];
  let cur = 0, shift = 0;
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  let table = new Map();
  const emit = (code) => {
    cur |= code << shift;
    shift += codeSize;
    while (shift >= 8) {
      out.push(cur & 255);
      cur >>>= 8;
      shift -= 8;
    }
  };
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const found = table.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (next === 4096) {
      emit(clear);
      table = new Map();
      next = eoi + 1;
      codeSize = minCodeSize + 1;
    } else {
      if (next >= 1 << codeSize) codeSize++;
      table.set(key, next++);
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (shift > 0) out.push(cur & 255);
  return out;
};

/**
 * @param {{ width: number, height: number, frames: Uint8ClampedArray[], delayMs?: number, loop?: number }} opts
 *        loop: 0 = forever. Pixels with alpha < 128 are transparent.
 * @returns {Uint8Array}
 */
Gif.encode = function encode({ width, height, frames, delayMs = 40, loop = 0 }) {
  if (!frames || !frames.length) throw new Error('gif: no frames');
  const pixels = width * height;
  for (const f of frames) if (f.length !== pixels * 4) throw new Error('gif: frame size does not match width x height');
  let transparent = false;
  for (const f of frames) {
    for (let i = 3; i < f.length; i += 4) if (f[i] < OPAQUE_ALPHA) { transparent = true; break; }
    if (transparent) break;
  }
  const palette = Gif.quantize(frames, transparent ? 255 : 256);
  const offset = transparent ? 1 : 0; // palette index 0 is kept for "transparent"
  const colours = [];
  if (transparent) colours.push([0, 0, 0]);
  for (const c of palette) colours.push(c);
  while (colours.length < 256) colours.push([0, 0, 0]);

  // nearest palette entry per 5-5-5 colour, cached
  const nearest = new Int16Array(32768).fill(-1);
  const lookup = (r, g, b) => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let n = nearest[key];
    if (n >= 0) return n;
    const rr = (r & 248) | 4, gg = (g & 248) | 4, bb = (b & 248) | 4;
    let best = offset, bestD = Infinity;
    for (let i = offset; i < offset + palette.length; i++) {
      const c = colours[i];
      const d = (c[0] - rr) * (c[0] - rr) * 2 + (c[1] - gg) * (c[1] - gg) * 4 + (c[2] - bb) * (c[2] - bb);
      if (d < bestD) { bestD = d; best = i; }
    }
    nearest[key] = best;
    return best;
  };

  const out = [];
  const u16 = (v) => { out.push(v & 255, (v >> 8) & 255); };
  const str = (s) => { for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i)); };
  str('GIF89a');
  u16(width); u16(height);
  out.push(0x80 | 0x70 | 7, 0, 0); // global colour table, 256 entries
  for (const c of colours) out.push(c[0], c[1], c[2]);
  if (frames.length > 1) {
    out.push(0x21, 0xff, 11);
    str('NETSCAPE2.0');
    out.push(3, 1);
    u16(loop);
    out.push(0);
  }
  const delay = Math.max(2, Math.round(delayMs / 10)); // hundredths of a second; browsers treat < 2 as 10
  for (const data of frames) {
    out.push(0x21, 0xf9, 4, (2 << 2) | (transparent ? 1 : 0)); // dispose to background so transparent frames do not smear
    u16(delay);
    out.push(0, 0);
    out.push(0x2c);
    u16(0); u16(0); u16(width); u16(height);
    out.push(0);
    const indices = new Uint8Array(pixels);
    for (let p = 0, i = 0; p < pixels; p++, i += 4) {
      indices[p] = data[i + 3] < OPAQUE_ALPHA ? 0 : lookup(data[i], data[i + 1], data[i + 2]);
    }
    out.push(8);
    const bytes = Gif.lzw(indices, 8);
    for (let i = 0; i < bytes.length; i += 255) {
      const chunk = Math.min(255, bytes.length - i);
      out.push(chunk);
      for (let j = 0; j < chunk; j++) out.push(bytes[i + j]);
    }
    out.push(0);
  }
  out.push(0x3b);
  return Uint8Array.from(out);
};
