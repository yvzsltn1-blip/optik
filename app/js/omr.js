// Görüntüden optik form okuma. Harici kütüphane kullanmaz.
// Akış:
//  1. Gri ton (tam çözünürlük) ve yarım çözünürlüklü kopya.
//  2. Yarım çözünürlükte uyarlamalı eşik → kapama (çizgili basılmış kareleri doldurur) →
//     bağlı bileşenler → 4 köşe işareti adayı.
//  3. Köşe merkezleri tam çözünürlükte, alt piksel hassasiyetinde düzeltilir → homografi (mm → piksel).
//  4. Kod şeridi gri tondan, kâğıda göre koyuluğuyla okunur (kontrol bitli).
//  5. Izgara ince ayarı: her soru satırı, basılı yuvarlak çerçevelerine oturacak şekilde kaydırılır
//     (kâğıt kıvrımı ve yazıcı ölçek hataları için).
//  6. Her yuvarlağın koyuluğu çevresindeki kâğıda göre ölçülür; dolu/boş eşiği formdan formun
//     kendi değerleriyle (Otsu) bulunur; eşiğe çok yakın işaretler "şüpheli" olarak bildirilir.
const OMR = (() => {
  const DARK_RATIO = 0.7;      // piksel, çevresinin ortalamasının bu oranından koyuysa "koyu"
  const FILL_FLOOR = 0.16;     // kâğıda göre bundan az koyu yuvarlak hiçbir zaman işaretli sayılmaz
  const FILL_CEIL = 0.4;       // bundan koyu yuvarlak her zaman işaretli sayılır
  const FILL_REL = 0.7;        // bir soruda en koyu işaretin bu oranından açık olanlar (silinmiş izler) yok sayılır
  const UNSURE = 0.05;         // eşiğe bu kadar yakın kararlar "şüpheli" sayılır
  const REFINE_MAX = 2.0;      // ızgara ince ayarında en fazla kaydırma (mm)

  function toGray(img) {
    const { data, width: w, height: h } = img;
    const g = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) {
      g[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
    }
    return g;
  }

  // 2×2 ortalama ile yarım çözünürlük
  function half(g, w, h) {
    const w2 = w >> 1, h2 = h >> 1;
    const o = new Uint8Array(w2 * h2);
    for (let y = 0; y < h2; y++) {
      const a = 2 * y * w, b = a + w;
      for (let x = 0; x < w2; x++) {
        const i = 2 * x;
        o[y * w2 + x] = (g[a + i] + g[a + i + 1] + g[b + i] + g[b + i + 1]) >> 2;
      }
    }
    return { g: o, w: w2, h: h2 };
  }

  function binarize(g, w, h) {
    const W = w + 1;
    const integ = new Uint32Array(W * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        row += g[y * w + x];
        integ[(y + 1) * W + x + 1] = integ[y * W + x + 1] + row;
      }
    }
    const r = Math.max(8, Math.round(Math.max(w, h) / 16));
    const bin = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        const sum = integ[y1 * W + x1] - integ[y0 * W + x1] - integ[y1 * W + x0] + integ[y0 * W + x0];
        const cnt = (y1 - y0) * (x1 - x0);
        if (g[y * w + x] * cnt < sum * DARK_RATIO) bin[y * w + x] = 1;
      }
    }
    return bin;
  }

  // Morfolojik kapama (genişlet + aşındır, kare çekirdek). Yazıcı kareleri çizgili ya da
  // benekli bastığında aradaki açıklıkları doldurur.
  function close(bin, w, h, k) {
    return morph(morph(bin, w, h, k, true), w, h, k, false);
  }
  // Ayrılabilir kayan pencere: önce yatay, sonra dikey. grow=true → pencerede 1 varsa 1,
  // grow=false → pencerenin tamamı 1 ise 1.
  function morph(src, w, h, k, grow) {
    const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
    const pass = (a, b, len, count, stride, lineStride) => {
      for (let line = 0; line < count; line++) {
        const base = line * lineStride;
        let sum = 0;
        for (let i = 0; i < Math.min(k, len); i++) sum += a[base + i * stride];
        for (let i = 0; i < len; i++) {
          if (i + k < len) sum += a[base + (i + k) * stride];
          if (i - k - 1 >= 0) sum -= a[base + (i - k - 1) * stride];
          const n = Math.min(len - 1, i + k) - Math.max(0, i - k) + 1;
          b[base + i * stride] = grow ? (sum > 0 ? 1 : 0) : (sum === n ? 1 : 0);
        }
      }
    };
    pass(src, tmp, w, h, 1, w);
    pass(tmp, out, h, w, w, 1);
    return out;
  }

  // Dolu, kareye/daireye yakın koyu bileşenleri döndürür (köşe işareti adayları).
  function blobs(bin, w, h) {
    const minSide = Math.min(w, h);
    const minArea = Math.max(12, (minSide * 0.012) ** 2);
    const maxArea = (minSide * 0.12) ** 2;
    const seen = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);
    const out = [];
    for (let start = 0; start < bin.length; start++) {
      if (!bin[start] || seen[start]) continue;
      let sp = 0, n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, touches = false;
      const ox = start % w, oy = (start / w) | 0;
      stack[sp++] = start;
      seen[start] = 1;
      while (sp) {
        const p = stack[--sp];
        const x = p % w, y = (p / w) | 0;
        const dx = x - ox, dy = y - oy;
        n++; sx += dx; sy += dy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches = true;
        if (x > 0 && bin[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
        if (x < w - 1 && bin[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
        if (y > 0 && bin[p - w] && !seen[p - w]) { seen[p - w] = 1; stack[sp++] = p - w; }
        if (y < h - 1 && bin[p + w] && !seen[p + w]) { seen[p + w] = 1; stack[sp++] = p + w; }
      }
      if (touches || n < minArea || n > maxArea) continue;
      const mx = sx / n, my = sy / n;
      const vxx = sxx / n - mx * mx, vyy = syy / n - my * my, vxy = sxy / n - mx * my;
      const det = vxx * vyy - vxy * vxy;
      if (det <= 0) continue;
      // Dolu kare/daire için alan ≈ 12·sqrt(det); halka ya da yazı için çok daha küçük
      const solidity = n / (12 * Math.sqrt(det));
      const tr = vxx + vyy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
      const elong = (tr / 2 + disc) / Math.max(1e-9, tr / 2 - disc);
      if (solidity < 0.85 || solidity > 1.2 || elong > 2.5) continue;
      out.push({ x: ox + mx, y: oy + my, area: n });
    }
    return out;
  }

  // Köşe işaretinin merkezini tam çözünürlükte, işaretin içindeki koyu piksellerin
  // ağırlık merkeziyle bulur (eşik: penceredeki en açık ve en koyu değerin ortası).
  function refineMarker(g, w, h, x, y, side) {
    const rad = Math.max(3, Math.round(side * 0.75));
    const x0 = Math.max(0, Math.round(x) - rad), x1 = Math.min(w - 1, Math.round(x) + rad);
    const y0 = Math.max(0, Math.round(y) - rad), y1 = Math.min(h - 1, Math.round(y) + rad);
    let lo = 255, hi = 0;
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const v = g[yy * w + xx];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (hi - lo < 30) return [x, y];
    const thr = (lo + hi) / 2;
    let n = 0, sx = 0, sy = 0;
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const v = g[yy * w + xx];
      if (v < thr) { const wgt = thr - v; n += wgt; sx += xx * wgt; sy += yy * wgt; }
    }
    return n ? [sx / n, sy / n] : [x, y];
  }

  // 4 nokta eşlemesinden homografi: src (mm) → dst (piksel)
  function homography(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    const h = solve(A, b);
    return h ? [...h, 1] : null;
  }

  function solve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      if (Math.abs(M[piv][c]) < 1e-12) return null;
      [M[c], M[piv]] = [M[piv], M[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((row, i) => row[n] / row[i]);
  }

  function project(H, x, y) {
    const d = H[6] * x + H[7] * y + H[8];
    return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d];
  }

  // Görüntü dışındaki noktalar için NaN döner
  function at(g, w, h, H, x, y) {
    const d = H[6] * x + H[7] * y + H[8];
    const xi = Math.round((H[0] * x + H[1] * y + H[2]) / d), yi = Math.round((H[3] * x + H[4] * y + H[5]) / d);
    return xi < 0 || yi < 0 || xi >= w || yi >= h ? NaN : g[yi * w + xi];
  }

  // (cx,cy) mm merkezli alanın ortalama gri değeri; görüntü dışına taşarsa -1
  function meanGray(g, w, h, H, cx, cy, rad, circle) {
    let sum = 0, n = 0;
    const steps = 7;
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < steps; j++) {
        const dx = (i / (steps - 1) * 2 - 1) * rad, dy = (j / (steps - 1) * 2 - 1) * rad;
        if (circle && dx * dx + dy * dy > rad * rad) continue;
        const v = at(g, w, h, H, cx + dx, cy + dy);
        if (v !== v) return -1;
        sum += v;
        n++;
      }
    }
    return sum / n;
  }


  // Yuvarlağın koyuluğu: 0 = kâğıt rengi, 1 = siyah. Kâğıt parlaklığı yuvarlağın hemen üstündeki
  // ve altındaki boşluktan ölçülür; gölge böylece dengelenir.
  function spotDarkness(g, w, h, H, x, y, r, gap) {
    const inner = meanGray(g, w, h, H, x, y, r * 0.55, true);
    const up = meanGray(g, w, h, H, x, y - gap, 0.4, false);
    const down = meanGray(g, w, h, H, x, y + gap, 0.4, false);
    if (inner < 0 || up < 0 || down < 0) return -1;
    return Math.max(0, Math.min(1, 1 - inner / Math.max(up, down, 1)));
  }

  // Izgara ince ayarı: her soru satırı, basılı çerçevelerin en net göründüğü kaydırmaya oturtulur
  // (çemberin kendisi koyu, hemen dışı açık). Kâğıt kıvrımı satırdan satıra yavaş değiştiği için
  // arama bir önceki satırın kaymasından başlar; sütunun ilk satırında geniş arama yapılır.
  // Sonra sütun boyunca medyan süzgeçle tek tük sapmalar atılır.
  const RING = Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4 + 0.39), Math.sin(i * Math.PI / 4 + 0.39)]);
  function refineGrid(g, w, h, H, fmt, grid) {
    const r = fmt.grid.r, ro = r + 0.6;
    const ring = (cx, cy, rad) => {
      let s = 0;
      for (const [c, si] of RING) {
        const v = at(g, w, h, H, cx + c * rad, cy + si * rad);
        if (v !== v) return NaN;
        s += v;
      }
      return s / RING.length;
    };
    const score = (q, dx, dy) => {
      let s = 0;
      for (const [x, y] of q.opts) {
        // ince çerçeve çizgisini kaçırmamak için iki yakın yarıçap
        const band = (ring(x + dx, y + dy, r - 0.1) + ring(x + dx, y + dy, r + 0.1)) / 2;
        const out = ring(x + dx, y + dy, ro);
        if (band !== band || out !== out) return -1e9;
        s += out - band;
      }
      return s;
    };
    const search = (q, start, steps) => {
      let best = start, bs = score(q, start[0], start[1]);
      for (const step of steps) {
        const [cx, cy] = best;
        for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
          if (!i && !j) continue;
          const dx = cx + i * step, dy = cy + j * step;
          if (Math.abs(dx) > REFINE_MAX || Math.abs(dy) > REFINE_MAX) continue;
          const s = score(q, dx, dy);
          if (s > bs) { bs = s; best = [dx, dy]; }
        }
      }
      return { best, bs };
    };
    const raw = new Array(grid.questions.length);
    const cols = new Map();
    grid.questions.forEach((q, i) => { if (!cols.has(q.col)) cols.set(q.col, []); cols.get(q.col).push(i); });
    for (const idx of cols.values()) {
      let prev = null;
      for (const qi of idx) {
        const q = grid.questions[qi];
        const { best, bs } = prev ? search(q, prev, [0.3, 0.1]) : search(q, [0, 0], [0.8, 0.3, 0.1]);
        // Çerçeve görünmüyorsa (çok soluk baskı) bu satırda yeni kaydırma bulunmaz
        const visible = bs > 6 * q.opts.length;
        raw[qi] = visible ? best : prev || [0, 0];
        if (visible) prev = best;
      }
    }
    // Sütun boyunca medyan süzgeç (pencere 5)
    const out = raw.map((v) => v.slice());
    const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
    for (const idx of cols.values()) {
      idx.forEach((qi, k) => {
        const win = idx.slice(Math.max(0, k - 2), k + 3);
        out[qi] = [med(win.map((j) => raw[j][0])), med(win.map((j) => raw[j][1]))];
      });
    }
    return out;
  }

  // Bir soru satırındaki işaret: indeks, null (boş) ya da -1 (birden fazla)
  function pick(s, T) {
    const mx = Math.max(...s);
    if (mx < T) return null;
    const marked = s.map((v, j) => (v >= Math.max(T, mx * FILL_REL) ? j : -1)).filter((j) => j >= 0);
    return marked.length === 1 ? marked[0] : -1;
  }

  // Karar eşiğe ya da ikinci işaret sınırına çok yakınsa şüphelidir
  function unsure(s, T) {
    const sorted = s.slice().sort((a, b) => b - a);
    const a = sorted[0], b = sorted[1] ?? 0;
    if (Math.abs(a - T) < UNSURE) return true;
    if (a < T) return false;
    const cut = Math.max(T, a * FILL_REL);
    return Math.abs(b - cut) < UNSURE;
  }

  // Koyuluk değerlerini "boş" ve "dolu" diye ikiye ayıran eşik (Otsu). Formdaki tüm yuvarlaklar
  // kullanılır; öğrenci hafif bastırdıysa eşik de kendiliğinden düşer.
  function fillThreshold(values) {
    const bins = 100, hist = new Array(bins).fill(0);
    values.forEach((v) => hist[Math.min(bins - 1, Math.floor(v * bins))]++);
    const total = values.length;
    let sumAll = 0;
    hist.forEach((c, i) => (sumAll += c * i));
    let wB = 0, sumB = 0, best = -1, t = 0;
    for (let i = 0; i < bins; i++) {
      wB += hist[i];
      if (!wB || wB === total) continue;
      sumB += hist[i] * i;
      const mB = sumB / wB, mF = (sumAll - sumB) / (total - wB);
      const between = wB * (total - wB) * (mB - mF) ** 2;
      if (between > best) { best = between; t = (i + 1) / bins; }
    }
    return Math.max(FILL_FLOOR, Math.min(FILL_CEIL, t));
  }

  // Koyuluk değerlerinden kararlar. Kamera ekranında birkaç karenin ortalaması da buradan geçer.
  function decide(scores, bookletScores) {
    const T = fillThreshold(scores.flat());
    const answers = scores.map((s) => pick(s, T));
    const uncertain = [];
    scores.forEach((s, i) => { if (unsure(s, T)) uncertain.push(i); });
    let booklet = null, bookletUnsure = false;
    if (bookletScores) {
      booklet = pick(bookletScores, T);
      bookletUnsure = unsure(bookletScores, T);
    }
    return { threshold: T, answers, uncertain, booklet, bookletUnsure };
  }

  // Kod şeridi: her hücrenin kâğıda göre koyuluğu; eşik en açık ve en koyu hücrenin ortası
  function readId(g, w, h, H, fmt) {
    const c = fmt.id.cell;
    const vals = [];
    for (let i = 0; i < Layout.ID_CELLS; i++) {
      const [x, y] = Layout.idCellCenter(fmt, i);
      const v = spotDarkness(g, w, h, H, x, y, c * 0.55, c * 1.3);
      if (v < 0) return null;
      vals.push(v);
    }
    const lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < 0.2) return null;
    const thr = (lo + hi) / 2;
    return Layout.decodeId(vals.map((v) => (v > thr ? 1 : 0)));
  }

  function polyArea(p) {
    let a = 0;
    for (let i = 0; i < p.length; i++) {
      const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
      a += x1 * y2 - x2 * y1;
    }
    return a / 2;
  }

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // Nokta, saat yönünde sıralı dışbükey dörtgenin içinde mi?
  function inside(pts, x, y) {
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % 4];
      if ((x2 - x1) * (y - y1) - (y2 - y1) * (x - x1) < 0) return false;
    }
    return true;
  }

  // Köşe işaretlerine uyan dörtlüleri puanına göre sıralı döndürür (saat yönünde).
  function markerQuads(cands, w, h, fmt) {
    const top = cands.sort((a, b) => b.area - a.area).slice(0, 20);
    const quads = [];
    const P = fmt.mark.pts;
    const mw = P[1][0] - P[0][0], mh = P[2][1] - P[1][1];
    const target = mw / mh;
    // Köşe işaretinin alanı, işaretlerin oluşturduğu dörtgenin alanıyla orantılıdır
    const markShare = fmt.mark.size ** 2 / (mw * mh);
    for (let a = 0; a < top.length; a++)
      for (let b = a + 1; b < top.length; b++)
        for (let c = b + 1; c < top.length; c++)
          for (let d = c + 1; d < top.length; d++) {
            const set = [top[a], top[b], top[c], top[d]];
            const areas = set.map((s) => s.area);
            if (Math.min(...areas) / Math.max(...areas) < 0.3) continue;
            const mx = set.reduce((s, p) => s + p.x, 0) / 4, my = set.reduce((s, p) => s + p.y, 0) / 4;
            set.sort((p, q) => Math.atan2(p.y - my, p.x - mx) - Math.atan2(q.y - my, q.x - mx));
            const pts = set.map((p) => [p.x, p.y]);
            const area = polyArea(pts);
            if (area < w * h * 0.04) continue;
            const sizeErr = Math.abs(Math.log(areas.reduce((s, v) => s + v, 0) / 4 / (area * markShare)));
            if (sizeErr > 0.8) continue;
            let convex = true;
            for (let i = 0; i < 4; i++) {
              const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % 4], [x3, y3] = pts[(i + 2) % 4];
              if ((x2 - x1) * (y3 - y2) - (y2 - y1) * (x3 - x2) <= 0) { convex = false; break; }
            }
            if (!convex) continue;
            const e = [0, 1, 2, 3].map((i) => dist(pts[i], pts[(i + 1) % 4]));
            if (Math.min(e[0], e[2]) / Math.max(e[0], e[2]) < 0.55) continue;
            if (Math.min(e[1], e[3]) / Math.max(e[1], e[3]) < 0.55) continue;
            const ratio = (e[0] + e[2]) / (e[1] + e[3]);
            const err = Math.min(Math.abs(Math.log(ratio / target)), Math.abs(Math.log(ratio * target)));
            if (err > 0.45) continue;
            // Gerçek bir formun köşeleri arasında köşe işareti büyüklüğünde başka kare olmaz.
            // Kesilmemiş sayfada komşu formların köşelerinden oluşan karışık dörtgenler böyle elenir.
            // (Dolu yuvarlaklar ve kod hücreleri tam çözünürlükte köşe işaretinin alanının %40.ından,
            // yarım çözünürlükte eşikleme yüzünden şişince bile %75.inden küçük kalır.)
            const big = areas.reduce((s, v) => s + v, 0) / 4 * 0.8;
            if (top.some((o) => !set.includes(o) && o.area >= big && inside(pts, o.x, o.y))) continue;
            // Görüntü y aşağı doğru olduğu için açıya göre sıralama saat yönündedir.
            // İlk köşe sol üste en yakın olan olsun.
            let first = 0;
            for (let i = 1; i < 4; i++) if (pts[i][0] + pts[i][1] < pts[first][0] + pts[first][1]) first = i;
            const order = [0, 1, 2, 3].map((i) => (i + first) % 4);
            // Boyut tutarlılığı alandan önemlidir: kesilmemiş sayfada iki formu kapsayan dörtgenler elenir
            quads.push({ blobs: order.map((i) => set[i]), score: area * Math.exp(-3 * err - 3 * sizeErr) });
          }
    return quads.sort((p, q) => q.score - p.score).slice(0, 60);
  }

  // Görüntüdeki tüm formları okur (kesilmemiş sayfada birden fazla form olabilir).
  // spec: {format, questionCount, optionCount, booklets}; known(id) → öğrenci kayıtlı mı
  // prof verilirse aşama süreleri (ms) içine yazılır.
  // Dönüş: {ok:true, forms:[…]} ya da {ok:false, reason, …}
  function readAll(img, spec, known, prof) {
    const t = prof ? () => performance.now() : null;
    let t0 = t && t();
    const lap = (name) => { if (prof) { const n = t(); prof[name] = (prof[name] || 0) + n - t0; t0 = n; } };

    const fmt = Layout.fmtOf(spec.format);
    const { width: w, height: h } = img;
    const gray = toGray(img);
    // Köşe arama yarım çözünürlükte (küçük görüntülerde gerek yok)
    const f = Math.max(w, h) > 900 ? 2 : 1;
    const small = f === 2 ? half(gray, w, h) : { g: gray, w, h };
    lap('gri');
    const bin = close(binarize(small.g, small.w, small.h), small.w, small.h, Math.max(1, Math.round(Math.min(small.w, small.h) / 250)));
    lap('eşik');
    const quads = markerQuads(blobs(bin, small.w, small.h), small.w, small.h, fmt);
    lap('köşe');
    if (!quads.length) return { ok: false, reason: 'nomarkers' };

    const refined = new Map();
    const fine = (b) => {
      if (!refined.has(b)) refined.set(b, refineMarker(gray, w, h, b.x * f + (f - 1) / 2, b.y * f + (f - 1) / 2, Math.sqrt(b.area) * f));
      return refined.get(b);
    };
    const forms = [], used = new Set(), ids = new Set();
    let fail = null;
    for (const quad of quads) {
      if (forms.length >= 6) break;
      if (quad.blobs.some((b) => used.has(b))) continue;
      const pts = quad.blobs.map(fine);
      // Form ters ya da yan tutulmuş olabilir: dört dönüşü de dene
      for (let rot = 0; rot < 4; rot++) {
        const dst = [0, 1, 2, 3].map((i) => pts[(i + rot) % 4]);
        const H = homography(fmt.mark.pts, dst);
        if (!H) continue;
        const id = readId(gray, w, h, H, fmt);
        if (id == null) continue;
        if (!known(id)) { fail = fail || { ok: false, reason: 'unknown', id, corners: dst }; break; }
        lap('kod');
        const grid = Layout.grid(fmt, spec.questionCount, spec.optionCount);
        // spec.refine === false yalnızca testlerde karşılaştırma için kullanılır
        const offsets = spec.refine === false ? grid.questions.map(() => [0, 0]) : refineGrid(gray, w, h, H, fmt, grid);
        lap('ızgara');
        const G = fmt.grid;
        let scores = [], outside = false;
        const centers = grid.questions.map((q, i) => q.opts.map(([x, y]) => [x + offsets[i][0], y + offsets[i][1]]));
        for (const row of centers) {
          const s = row.map(([x, y]) => spotDarkness(gray, w, h, H, x, y, G.r, G.rowPitch / 2));
          if (s.some((v) => v < 0)) { outside = true; break; }
          scores.push(s);
        }
        if (outside) { fail = fail || { ok: false, reason: 'partial', id, corners: dst }; break; }
        // Kitapçık işareti (sınavda birden fazla kitapçık varsa)
        let bookletScores = null;
        const nb = Layout.bookletCount(spec);
        if (nb > 1) {
          const b = Layout.bookletSpots(fmt, nb);
          bookletScores = b.opts.map(([x, y]) => spotDarkness(gray, w, h, H, x, y, b.r, 3.2));
          if (bookletScores.some((v) => v < 0)) bookletScores = bookletScores.map(() => 0);
        }
        lap('yuvarlak');
        quad.blobs.forEach((b) => used.add(b));
        if (!ids.has(id)) {
          ids.add(id);
          forms.push({ id, H, corners: dst, grid, centers, scores, bookletScores, ...decide(scores, bookletScores) });
        }
        break;
      }
    }
    if (forms.length) {
      // Okuma sırası: yukarıdan aşağı, soldan sağa
      const c = (fm) => fm.corners.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4], [0, 0]);
      forms.sort((a, b) => { const [ax, ay] = c(a), [bx, by] = c(b); return Math.abs(ay - by) > h * 0.15 ? ay - by : ax - bx; });
      return { ok: true, forms };
    }
    return fail || { ok: false, reason: 'noid', corners: quads[0].blobs.map((b) => [b.x * f, b.y * f]) };
  }

  return { readAll, decide, project, homography };
})();
