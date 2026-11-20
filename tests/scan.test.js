// Pokretanje: node tests/scan.test.js
const assert = require('assert');
const S = require('../scan.js');

// Umjetna fotografija: tamna pozadina, nagnut svijetli račun s "tekstom"
function photo(W, H, cx, cy, rw, rh, deg) {
  const data = new Uint8ClampedArray(W * H * 4);
  const a = deg * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - cx, dy = y - cy;
    const u = dx * cos + dy * sin, v = -dx * sin + dy * cos; // koordinate u sustavu računa
    let g = 70 + 20 * Math.sin(x / 37) ; // pozadina s varijacijom
    if (Math.abs(u) < rw / 2 && Math.abs(v) < rh / 2) {
      g = 235;
      if (Math.abs(v) < rh / 2 - 30 && Math.floor((v + rh / 2) / 14) % 3 === 0 && Math.abs(u) < rw / 2 - 20) g = 40; // crte teksta
    }
    const i = (y * W + x) * 4; data[i] = data[i + 1] = data[i + 2] = g; data[i + 3] = 255;
  }
  return { data, width: W, height: H };
}

let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('✓ ' + name); } catch (e) { console.error('✗ ' + name + '\n  ' + e.message); process.exitCode = 1; } }

test('izrezuje nagnut račun na tamnoj pozadini', () => {
  const img = photo(900, 1200, 450, 600, 420, 900, 12);
  const r = S.cropReceipt(img, 2000);
  assert.ok(r, 'račun nije pronađen');
  const { width: w, height: h, data } = r.cropped;
  // očekivane dimenzije ~ 420×900 (minus mali rub)
  assert.ok(Math.abs(w - 420) < 45, 'širina ' + w);
  assert.ok(Math.abs(h - 900) < 60, 'visina ' + h);
  // gotovo nigdje ne smije biti tamne pozadine (tekst je ≈ 1/3 redaka)
  let darkEdge = 0, count = 0;
  for (let x = 0; x < w; x++) for (const y of [2, h - 3]) { count++; if (data[(y * w + x) * 4] < 120) darkEdge++; }
  assert.ok(darkEdge / count < 0.1, 'pozadina na rubu: ' + darkEdge / count);
});

test('račun bez nagiba', () => {
  const r = S.cropReceipt(photo(800, 1000, 400, 500, 400, 800, 0), 2000);
  assert.ok(r); assert.ok(Math.abs(r.cropped.width - 400) < 30);
});

test('slika bez pozadine (papir preko cijele slike) ostaje nerezana', () => {
  const data = new Uint8ClampedArray(400 * 600 * 4).fill(235);
  assert.strictEqual(S.cropReceipt({ data, width: 400, height: 600 }, 2000), null);
});

test('prazna tamna slika', () => {
  const data = new Uint8ClampedArray(400 * 600 * 4).fill(60);
  assert.strictEqual(S.cropReceipt({ data, width: 400, height: 600 }, 2000), null);
});

test('homografija preslikava kutove', () => {
  const q = [{ x: 10, y: 20 }, { x: 110, y: 30 }, { x: 120, y: 220 }, { x: 5, y: 210 }];
  const m = S.homography(q, 100, 200);
  const map = (x, y) => { const d = m[6] * x + m[7] * y + 1; return [(m[0] * x + m[1] * y + m[2]) / d, (m[3] * x + m[4] * y + m[5]) / d]; };
  const [u, v] = map(100, 200);
  assert.ok(Math.abs(u - 120) < 1e-6 && Math.abs(v - 220) < 1e-6);
});

console.log(`\n${passed} testova prošlo`);
