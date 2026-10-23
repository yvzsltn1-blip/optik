// Optik form geometrisi (ölçüler mm) ve SVG çizimi. Üç boyut var: A4 (sayfada 1),
// A5 (sayfada 2) ve A6 (sayfada 4). Okuyucu (omr.js) da aynı geometriyi kullanır;
// buradaki bir değişiklik daha önce basılmış formları geçersiz kılar.
const Layout = (() => {
  const LETTERS = ['A', 'B', 'C', 'D', 'E'];

  // mark: köşe işaretleri (merkezler TL, TR, BR, BL); id: kod şeridi; grid: baloncuklar
  const FORMATS = {
    a4: {
      key: 'a4', label: 'A4', perPage: 1, w: 210, h: 297, maxQ: 100,
      mark: { size: 8, pts: [[12, 12], [198, 12], [198, 285], [12, 285]] },
      id: { y: 57, x0: 21, pitch: 7.4, cell: 5 },
      grid: { top: 75, rowPitch: 7.6, maxRows: 25, colW: 44.5, numX: 8, firstX: 13, optPitch: 6.4, r: 2.4, font: 3.2 },
    },
    a5: {
      key: 'a5', label: 'A5', perPage: 2, w: 210, h: 148.5, maxQ: 52,
      mark: { size: 7, pts: [[11, 11], [199, 11], [199, 137.5], [11, 137.5]] },
      id: { y: 35, x0: 22, pitch: 6, cell: 4 },
      grid: { top: 48, rowPitch: 6.7, maxRows: 13, colW: 44.5, numX: 8, firstX: 13, optPitch: 6.2, r: 2.3, font: 3 },
    },
    a6: {
      key: 'a6', label: 'A6', perPage: 4, w: 105, h: 148.5, maxQ: 30,
      mark: { size: 6, pts: [[10, 10], [95, 10], [95, 138.5], [10, 138.5]] },
      id: { y: 33, x0: 14.7, pitch: 3.6, cell: 2.6 },
      grid: { top: 44, rowPitch: 6.2, maxRows: 15, colW: 40, numX: 7, firstX: 11.5, optPitch: 5.6, r: 2.1, font: 2.8 },
    },
  };
  const fmtOf = (key) => FORMATS[key] || FORMATS.a4;

  // Kitapçık yuvarlakları başlıkta durur. n: kitapçık sayısı (2–4). Dönüş: {label:[x,y,anchor], opts:[[x,y]…], r}
  function bookletSpots(fmt, n) {
    const r = fmt.grid.r;
    if (fmt.key === 'a4') return { r, label: [152, 36.2, 'start'], opts: Array.from({ length: n }, (_, j) => [155 + j * 7, 43.4]) };
    if (fmt.key === 'a5') return { r, label: [166, 28.7, 'end'], opts: Array.from({ length: n }, (_, j) => [170 + j * 6.2, 27.6]) };
    const opts = Array.from({ length: n }, (_, j) => [90.5 - (n - 1 - j) * 5.4, 22.4]);
    return { r, label: [(opts[0][0] + opts[n - 1][0]) / 2, 17.4, 'middle'], opts };
  }
  const bookletCount = (exam) => Math.max(1, Math.min(4, exam.booklets | 0 || 1));

  // Kod şeridi: [1][16 bit öğrenci kodu][4 bit kontrol][1]
  const ID_BITS = 16, CS_BITS = 4, ID_CELLS = 1 + ID_BITS + CS_BITS + 1;

  function checksum(id) {
    const n = [id & 15, (id >> 4) & 15, (id >> 8) & 15, (id >> 12) & 15];
    return (n[0] + n[1] * 3 + n[2] * 5 + n[3] * 7 + 9) & 15;
  }

  function idBits(id) {
    const bits = [1];
    for (let i = ID_BITS - 1; i >= 0; i--) bits.push((id >> i) & 1);
    const cs = checksum(id);
    for (let i = CS_BITS - 1; i >= 0; i--) bits.push((cs >> i) & 1);
    bits.push(1);
    return bits;
  }

  // Okunan bitlerden kodu çözer; geçersizse null döner.
  function decodeId(bits) {
    if (bits.length !== ID_CELLS || !bits[0] || !bits[ID_CELLS - 1]) return null;
    let id = 0;
    for (let i = 1; i <= ID_BITS; i++) id = (id << 1) | bits[i];
    let cs = 0;
    for (let i = 1 + ID_BITS; i < ID_CELLS - 1; i++) cs = (cs << 1) | bits[i];
    return cs === checksum(id) ? id : null;
  }

  const idCellCenter = (fmt, i) => [fmt.id.x0 + i * fmt.id.pitch, fmt.id.y];

  function grid(fmt, qCount, optCount) {
    const G = fmt.grid;
    const q = Math.max(1, Math.min(fmt.maxQ, qCount | 0));
    const k = Math.max(2, Math.min(5, optCount | 0));
    const cols = Math.ceil(q / G.maxRows);
    const rows = Math.ceil(q / cols);
    const left = fmt.w / 2 - (cols * G.colW) / 2;
    const questions = [];
    for (let i = 0; i < q; i++) {
      const col = Math.floor(i / rows), row = i % rows;
      const cx = left + col * G.colW;
      const y = G.top + row * G.rowPitch;
      const opts = [];
      for (let j = 0; j < k; j++) opts.push([cx + G.firstX + j * G.optPitch, y]);
      questions.push({ n: i + 1, col, row, numX: cx + G.numX, y, opts });
    }
    return { q, k, cols, rows, left, questions };
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cut = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const txt = (x, y, size, body, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" ${extra}>${body}</text>`;

  function header(fmt, student, exam, cls) {
    const no = student.number ? esc(student.number) : '-';
    const bk = bookletCount(exam) > 1;
    const meta = `${esc(cls.name)} · ${exam.questionCount} soru`;
    if (fmt.key === 'a4') {
      return [
        txt(22, 24, 5.2, esc(cut(exam.name, 42)), 'font-weight="bold" fill="#111"'),
        txt(188, 24, 3, meta, 'fill="#666" text-anchor="end"'),
        `<rect x="20" y="29" width="170" height="20" rx="1.5" fill="none" stroke="#999" stroke-width="0.3"/>`,
        txt(24, 36, 3, 'Ad Soyad', 'fill="#666"'),
        txt(45, 36.2, 4.6, esc(cut(student.name, 40)), 'font-weight="bold" fill="#111"'),
        txt(24, 44, 3, 'Sınıf', 'fill="#666"'),
        txt(45, 44.2, 4, esc(cls.name), 'fill="#111"'),
        txt(110, 44, 3, 'Numara', 'fill="#666"'),
        txt(128, 44.2, 4, no, 'fill="#111"'),
      ].join('');
    }
    if (fmt.key === 'a5') {
      return [
        txt(20, 21, 4.2, esc(cut(exam.name, 48)), 'font-weight="bold" fill="#111"'),
        txt(190, 21, 2.8, meta, 'fill="#666" text-anchor="end"'),
        txt(20, 28.5, 2.8, 'Ad Soyad', 'fill="#666"'),
        txt(36, 28.7, 4.2, esc(cut(student.name, bk ? 32 : 36)), 'font-weight="bold" fill="#111"'),
        txt(bk ? 124 : 150, 28.5, 2.8, 'No', 'fill="#666"'),
        txt(bk ? 130 : 156, 28.7, 3.8, no, 'fill="#111"'),
      ].join('');
    }
    return [
      txt(15, 17, 2.8, esc(cut(exam.name, bk ? 26 : 34)), 'font-weight="bold" fill="#444"'),
      txt(15, 23.2, 3.9, esc(cut(student.name, bk ? 20 : 26)), 'font-weight="bold" fill="#111"'),
      txt(15, 28, 2.5, `${esc(cls.name)} · No ${no} · #${student.id}`, 'fill="#666"'),
    ].join('');
  }

  // Tek form. pos verilirse (sayfa içine yerleştirme) birimler mm olur.
  function sheetSVG(student, exam, cls, pos) {
    const fmt = fmtOf(exam.format);
    const G = fmt.grid;
    const g = grid(fmt, exam.questionCount, exam.optionCount);
    const out = [];
    const size = pos ? `x="${pos[0]}" y="${pos[1]}" width="${fmt.w}" height="${fmt.h}"` : `width="${fmt.w}mm" height="${fmt.h}mm"`;
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" class="sheet" ${size} viewBox="0 0 ${fmt.w} ${fmt.h}" font-family="Arial, Helvetica, sans-serif">`);
    out.push(`<rect width="${fmt.w}" height="${fmt.h}" fill="#fff"/>`);
    const m = fmt.mark.size;
    for (const [x, y] of fmt.mark.pts) out.push(`<rect x="${x - m / 2}" y="${y - m / 2}" width="${m}" height="${m}" fill="#000"/>`);

    out.push(header(fmt, student, exam, cls));

    const nb = bookletCount(exam);
    if (nb > 1) {
      const b = bookletSpots(fmt, nb);
      out.push(txt(b.label[0], b.label[1], fmt.key === 'a6' ? 2.4 : 2.8, 'Kitapçık', `font-weight="bold" fill="#333" text-anchor="${b.label[2]}"`));
      b.opts.forEach(([x, y], j) => {
        out.push(`<circle cx="${x}" cy="${y}" r="${b.r}" fill="none" stroke="#555" stroke-width="0.25"/>`);
        out.push(txt(x, y + b.r * 0.37, b.r * 1.05, L(j), 'fill="#c4c4c4" text-anchor="middle"'));
      });
    }

    // Kod şeridi
    const c = fmt.id.cell;
    const sx = fmt.id.x0 - c / 2 - c * 0.3, ex = fmt.id.x0 + (ID_CELLS - 1) * fmt.id.pitch + c / 2 + c * 0.3;
    out.push(`<rect x="${sx}" y="${fmt.id.y - c * 0.8}" width="${ex - sx}" height="${c * 1.6}" fill="none" stroke="#ccc" stroke-width="0.25"/>`);
    idBits(student.id).forEach((b, i) => {
      if (!b) return;
      const [x, y] = idCellCenter(fmt, i);
      out.push(`<rect x="${x - c / 2}" y="${y - c / 2}" width="${c}" height="${c}" fill="#000"/>`);
    });
    if (fmt.key !== 'a6') out.push(txt(ex + 2, fmt.id.y + 1, 2.6, '#' + student.id, 'fill="#888"'));

    // Sütun başlıkları ve baloncuklar
    for (let col = 0; col < g.cols; col++) {
      const cx = g.left + col * G.colW;
      for (let j = 0; j < g.k; j++) {
        out.push(txt(cx + G.firstX + j * G.optPitch, G.top - G.rowPitch * 0.65, G.font * 0.92, L(j), 'font-weight="bold" fill="#555" text-anchor="middle"'));
      }
    }
    for (const q of g.questions) {
      if (q.row > 0 && q.row % 5 === 0) {
        const cx = g.left + q.col * G.colW;
        out.push(`<line x1="${cx + 2}" x2="${cx + G.colW - 3}" y1="${q.y - G.rowPitch / 2}" y2="${q.y - G.rowPitch / 2}" stroke="#ddd" stroke-width="0.25"/>`);
      }
      out.push(txt(q.numX, q.y + G.font * 0.35, G.font, q.n, 'font-weight="bold" fill="#333" text-anchor="end"'));
      q.opts.forEach(([x, y], j) => {
        out.push(`<circle cx="${x}" cy="${y}" r="${G.r}" fill="none" stroke="#555" stroke-width="0.25"/>`);
        out.push(txt(x, y + G.r * 0.37, G.r * 1.05, L(j), 'fill="#c4c4c4" text-anchor="middle"'));
      });
    }
    if (fmt.key === 'a4') {
      out.push(txt(105, 272, 2.8, 'Yuvarlakları koyu kurşun kalemle tamamen doldurunuz. Formu katlamayınız, köşedeki siyah kareleri kapatmayınız.', 'fill="#777" text-anchor="middle"'));
    }
    out.push(`</svg>`);
    return out.join('');
  }
  const L = (j) => LETTERS[j];

  // Formların A4 sayfa üzerindeki yerleri (mm)
  function slots(fmt) {
    if (fmt.perPage === 4) return [[0, 0], [105, 0], [0, 148.5], [105, 148.5]];
    if (fmt.perPage === 2) return [[0, 0], [0, 148.5]];
    return [[0, 0]];
  }

  // Bir A4 sayfası: forms = [{student, exam, cls}], en çok perPage adet
  function pageSVG(fmt, forms) {
    const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297"><rect width="210" height="297" fill="#fff"/>`];
    const pos = slots(fmt);
    forms.forEach((f, i) => out.push(sheetSVG(f.student, f.exam, f.cls, pos[i])));
    // Kesim çizgileri
    const dash = 'stroke="#aaa" stroke-width="0.2" stroke-dasharray="2 1.5"';
    if (fmt.perPage >= 2) out.push(`<line x1="0" x2="210" y1="148.5" y2="148.5" ${dash}/>`);
    if (fmt.perPage === 4) out.push(`<line x1="105" x2="105" y1="0" y2="297" ${dash}/>`);
    out.push('</svg>');
    return out.join('');
  }

  return { FORMATS, fmtOf, bookletSpots, bookletCount, LETTERS, ID_CELLS, idBits, decodeId, idCellCenter, grid, sheetSVG, pageSVG };
})();
