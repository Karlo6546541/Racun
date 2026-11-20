/*
 * Skener računa: pronalazi račun na slici, izrezuje pozadinu i ispravlja nagib/perspektivu.
 * Čisti JavaScript (bez biblioteka), radi u pregledniku (window.RacunScan) i u Node.js (testovi).
 */
(function (root) {
  'use strict';

  /** Otsuov prag: dijeli sliku na tamno (pozadina) i svijetlo (papir). */
  function otsu(gray) {
    var hist = new Array(256).fill(0), i;
    for (i = 0; i < gray.length; i++) hist[gray[i]]++;
    var total = gray.length, sum = 0;
    for (i = 0; i < 256; i++) sum += i * hist[i];
    var sumB = 0, wB = 0, best = 0, thr = 127;
    for (i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) continue;
      var wF = total - wB;
      if (!wF) break;
      sumB += i * hist[i];
      var mB = sumB / wB, mF = (sum - sumB) / wF;
      var between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; thr = i; }
    }
    return thr;
  }

  function boxBlur(gray, w, h) {
    var out = new Uint8Array(gray.length);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var s = 0, n = 0;
        for (var dy = -1; dy <= 1; dy++) {
          var yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (var dx = -1; dx <= 1; dx++) {
            var xx = x + dx; if (xx < 0 || xx >= w) continue;
            s += gray[yy * w + xx]; n++;
          }
        }
        out[y * w + x] = s / n;
      }
    }
    return out;
  }

  /**
   * Na maloj sivoj slici (gray, w×h) nađi četiri kuta računa.
   * Vraća { quad: [tl,tr,br,bl] (točke {x,y} u koordinatama male slike), area } ili null.
   */
  function findDocument(gray, w, h) {
    var g = boxBlur(boxBlur(gray, w, h), w, h);
    var thr = otsu(g);
    var n = w * h, mask = new Uint8Array(n), bright = 0, i;
    for (i = 0; i < n; i++) { if (g[i] > thr) { mask[i] = 1; bright++; } }
    // Papir mora biti svjetliji dio slike i ne smije biti gotovo cijela slika ili sitnica
    if (bright < n * 0.08) return null;

    // Najveća povezana svijetla površina (BFS)
    var label = new Int32Array(n), bestLabel = 0, bestSize = 0, cur = 0;
    var stack = new Int32Array(n);
    for (i = 0; i < n; i++) {
      if (!mask[i] || label[i]) continue;
      cur++;
      var sp = 0, size = 0;
      stack[sp++] = i; label[i] = cur;
      while (sp) {
        var p = stack[--sp]; size++;
        var x = p % w, y = (p - x) / w;
        if (x > 0 && mask[p - 1] && !label[p - 1]) { label[p - 1] = cur; stack[sp++] = p - 1; }
        if (x < w - 1 && mask[p + 1] && !label[p + 1]) { label[p + 1] = cur; stack[sp++] = p + 1; }
        if (y > 0 && mask[p - w] && !label[p - w]) { label[p - w] = cur; stack[sp++] = p - w; }
        if (y < h - 1 && mask[p + w] && !label[p + w]) { label[p + w] = cur; stack[sp++] = p + w; }
      }
      if (size > bestSize) { bestSize = size; bestLabel = cur; }
    }
    if (bestSize < n * 0.08) return null;

    // Kutovi = ekstremne točke površine
    var tl = null, tr = null, br = null, bl = null;
    var minS = Infinity, maxS = -Infinity, minD = Infinity, maxD = -Infinity;
    var minX = w, maxX = 0, minY = h, maxY = 0;
    for (i = 0; i < n; i++) {
      if (label[i] !== bestLabel) continue;
      var px = i % w, py = (i - px) / w, s = px + py, d = px - py;
      if (s < minS) { minS = s; tl = { x: px, y: py }; }
      if (s > maxS) { maxS = s; br = { x: px, y: py }; }
      if (d > maxD) { maxD = d; tr = { x: px, y: py }; }
      if (d < minD) { minD = d; bl = { x: px, y: py }; }
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
    }
    // Ako papir zauzima cijelu sliku, nema što rezati
    var bboxFrac = ((maxX - minX + 1) * (maxY - minY + 1)) / n;
    if (bboxFrac > 0.97 && bestSize / n > 0.9) return null;

    // Oblik mora biti približno pravokutnik (površina ≈ površina četverokuta)
    var quad = [tl, tr, br, bl];
    var qa = polyArea(quad);
    if (qa < n * 0.08 || bestSize / qa < 0.6) return null;
    return { quad: quad, area: bestSize / n };
  }

  function polyArea(q) {
    var a = 0;
    for (var i = 0; i < q.length; i++) {
      var j = (i + 1) % q.length;
      a += q[i].x * q[j].y - q[j].x * q[i].y;
    }
    return Math.abs(a) / 2;
  }

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  /** Pomakni kutove prema središtu (odbaci sjenu i rub papira). */
  function inset(quad, frac) {
    var cx = 0, cy = 0;
    quad.forEach(function (p) { cx += p.x / 4; cy += p.y / 4; });
    return quad.map(function (p) { return { x: p.x + (cx - p.x) * frac, y: p.y + (cy - p.y) * frac }; });
  }

  /** Riješi sustav A·x = b Gaussovom eliminacijom (A je n×n). */
  function solve(A, b) {
    var n = b.length, i, j, k;
    for (i = 0; i < n; i++) {
      var piv = i;
      for (j = i + 1; j < n; j++) if (Math.abs(A[j][i]) > Math.abs(A[piv][i])) piv = j;
      var t = A[i]; A[i] = A[piv]; A[piv] = t;
      var tb = b[i]; b[i] = b[piv]; b[piv] = tb;
      for (j = i + 1; j < n; j++) {
        var f = A[j][i] / A[i][i];
        for (k = i; k < n; k++) A[j][k] -= f * A[i][k];
        b[j] -= f * b[i];
      }
    }
    var x = new Array(n);
    for (i = n - 1; i >= 0; i--) {
      var s = b[i];
      for (j = i + 1; j < n; j++) s -= A[i][j] * x[j];
      x[i] = s / A[i][i];
    }
    return x;
  }

  /** Homografija koja preslikava pravokutnik izlaza (0..W, 0..H) u četverokut izvora. */
  function homography(quad, W, H) {
    var dst = [[0, 0], [W, 0], [W, H], [0, H]];
    var A = [], b = [];
    for (var i = 0; i < 4; i++) {
      var x = dst[i][0], y = dst[i][1], u = quad[i].x, v = quad[i].y;
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    var h = solve(A, b);
    return h.concat([1]);
  }

  /**
   * Izreži i ispravi perspektivu. src je ImageData-like {data,width,height}, quad u koordinatama src.
   * Vraća { data, width, height } (RGBA).
   */
  function warp(src, quad, maxSide) {
    var top = dist(quad[0], quad[1]), bottom = dist(quad[3], quad[2]);
    var left = dist(quad[0], quad[3]), right = dist(quad[1], quad[2]);
    var W = Math.round((top + bottom) / 2), H = Math.round((left + right) / 2);
    var sc = Math.min(1, maxSide / Math.max(W, H));
    W = Math.max(2, Math.round(W * sc)); H = Math.max(2, Math.round(H * sc));
    var m = homography(quad, W, H);
    var out = new Uint8ClampedArray(W * H * 4), sd = src.data, sw = src.width, sh = src.height;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var d = m[6] * x + m[7] * y + 1;
        var u = (m[0] * x + m[1] * y + m[2]) / d, v = (m[3] * x + m[4] * y + m[5]) / d;
        var o = (y * W + x) * 4;
        if (u < 0) u = 0; else if (u > sw - 1) u = sw - 1;
        if (v < 0) v = 0; else if (v > sh - 1) v = sh - 1;
        var x0 = u | 0, y0 = v | 0, x1 = Math.min(x0 + 1, sw - 1), y1 = Math.min(y0 + 1, sh - 1);
        var fx = u - x0, fy = v - y0;
        for (var c = 0; c < 4; c++) {
          var a = sd[(y0 * sw + x0) * 4 + c], b2 = sd[(y0 * sw + x1) * 4 + c];
          var c2 = sd[(y1 * sw + x0) * 4 + c], d2 = sd[(y1 * sw + x1) * 4 + c];
          out[o + c] = (a * (1 - fx) + b2 * fx) * (1 - fy) + (c2 * (1 - fx) + d2 * fx) * fy;
        }
      }
    }
    return { data: out, width: W, height: H };
  }

  /** RGBA -> siva slika. */
  function toGray(rgba, w, h) {
    var g = new Uint8Array(w * h);
    for (var i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000;
    return g;
  }

  /**
   * Cijeli postupak nad punom slikom (ImageData-like).
   * Vraća { cropped: ImageData-like } ili null ako račun nije pronađen.
   */
  function cropReceipt(full, maxSide) {
    var s = Math.min(1, 256 / Math.max(full.width, full.height));
    var sw = Math.max(8, Math.round(full.width * s)), sh = Math.max(8, Math.round(full.height * s));
    // smanji nasumičnim uzorkovanjem (dovoljno za traženje rubova)
    var small = new Uint8ClampedArray(sw * sh * 4);
    for (var y = 0; y < sh; y++) {
      for (var x = 0; x < sw; x++) {
        var si = (Math.min(full.height - 1, Math.floor((y + 0.5) / s)) * full.width + Math.min(full.width - 1, Math.floor((x + 0.5) / s))) * 4;
        var di = (y * sw + x) * 4;
        small[di] = full.data[si]; small[di + 1] = full.data[si + 1]; small[di + 2] = full.data[si + 2]; small[di + 3] = 255;
      }
    }
    var found = findDocument(toGray(small, sw, sh), sw, sh);
    if (!found) return null;
    var q = inset(found.quad, 0.012).map(function (p) { return { x: p.x / sw * full.width, y: p.y / sh * full.height }; });
    return { cropped: warp(full, q, maxSide || 2000), quad: q };
  }

  var api = { otsu: otsu, findDocument: findDocument, homography: homography, warp: warp, cropReceipt: cropReceipt, toGray: toGray };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RacunScan = api;
})(this);
