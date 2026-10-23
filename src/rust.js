// Texture "acciaio corten" procedurale: rumore frattale + palette ruggine.

function fbm(w, h, octaves) {
  const out = new Float32Array(w * h);
  let amp = 1; let total = 0;
  for (let o = 0; o < octaves; o += 1) {
    const g = 4 << o;
    const grid = new Float32Array((g + 1) * (g + 1));
    for (let i = 0; i < grid.length; i += 1) grid[i] = Math.random();
    for (let y = 0; y < h; y += 1) {
      const fy = (y / h) * g; const y0 = fy | 0; let ty = fy - y0; ty = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < w; x += 1) {
        const fx = (x / w) * g; const x0 = fx | 0; let tx = fx - x0; tx = tx * tx * (3 - 2 * tx);
        const k = y0 * (g + 1) + x0;
        const a = grid[k]; const b = grid[k + 1]; const c = grid[k + g + 1]; const d = grid[k + g + 2];
        out[y * w + x] += amp * ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty);
      }
    }
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i += 1) out[i] /= total;
  return out;
}

const PALETTE = [[26, 11, 6], [78, 34, 14], [140, 66, 26], [196, 108, 44], [226, 152, 72]];

// Restituisce { color, bump }: due canvas della stessa texture (colore e rilievo).
export function rustTexture(w, h, letter) {
  const n = fbm(w, h, 6); const m = fbm(w, h, 3);
  const color = document.createElement('canvas'); const bump = document.createElement('canvas');
  color.width = bump.width = w; color.height = bump.height = h;
  const cx = color.getContext('2d'); const bx = bump.getContext('2d');
  const ci = cx.createImageData(w, h); const bi = bx.createImageData(w, h);
  for (let i = 0; i < w * h; i += 1) {
    const v = Math.min(1, Math.max(0, (n[i] - 0.28) * 2.3));
    const t = v * 4; const k = Math.min(3, t | 0); const f = t - k;
    const A = PALETTE[k]; const B = PALETTE[k + 1]; const shade = m[i] > 0.6 ? 0.55 : 1;
    for (let j = 0; j < 3; j += 1) ci.data[i * 4 + j] = (A[j] + (B[j] - A[j]) * f) * shade;
    ci.data[i * 4 + 3] = 255;
    const bv = (v * 0.7 + m[i] * 0.3) * 255;
    bi.data[i * 4] = bi.data[i * 4 + 1] = bi.data[i * 4 + 2] = bv; bi.data[i * 4 + 3] = 255;
  }
  cx.putImageData(ci, 0, 0); bx.putImageData(bi, 0, 0);
  if (letter) {
    cx.font = bx.font = `900 ${h * 0.66}px Archivo`;
    cx.textAlign = bx.textAlign = 'center'; cx.textBaseline = bx.textBaseline = 'middle';
    bx.fillStyle = '#000'; bx.fillText(letter, w / 2, h * 0.53);
    cx.fillStyle = 'rgba(8,3,1,.7)'; cx.fillText(letter, w / 2, h * 0.53);
  }
  return { color, bump };
}
