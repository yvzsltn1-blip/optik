// Optik formlardan A4 PDF üretir. Her sayfa SVG → tuval → JPEG olarak çizilir ve
// elle yazılmış küçük bir PDF dosyasına gömülür (Türkçe karakterler için yazı tipi gömmeye gerek kalmaz).
const PDF = (() => {
  const DPI = 200;
  const PX_W = Math.round(210 / 25.4 * DPI), PX_H = Math.round(297 / 25.4 * DPI);

  function loadSVG(svg) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('Sayfa çizilemedi'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  async function pageJPEG(svg, canvas) {
    const img = await loadSVG(svg);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, PX_W, PX_H);
    ctx.drawImage(img, 0, 0, PX_W, PX_H);
    const bin = atob(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function build(jpegs) {
    const enc = new TextEncoder();
    const parts = [], offs = [];
    let len = 0;
    const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const n = jpegs.length;
    // Nesneler: 1 katalog, 2 sayfa ağacı, her sayfa için 3 nesne (sayfa, içerik, görüntü)
    push('%PDF-1.4\n%âãÏÓ\n');
    offs[1] = len; push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    const kids = jpegs.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
    offs[2] = len; push(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${n} >>\nendobj\n`);
    const content = 'q 595.28 0 0 841.89 0 0 cm /Im0 Do Q';
    jpegs.forEach((bytes, i) => {
      const p = 3 + i * 3, c = p + 1, im = p + 2;
      offs[p] = len; push(`${p} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${c} 0 R >>\nendobj\n`);
      offs[c] = len; push(`${c} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
      offs[im] = len; push(`${im} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${PX_W} /Height ${PX_H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);
      push(bytes);
      push('\nendstream\nendobj\n');
    });
    const total = 3 + n * 3;
    const xref = len;
    let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let k = 1; k < total; k++) x += String(offs[k]).padStart(10, '0') + ' 00000 n \n';
    push(x + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }

  // forms: [{student, exam, cls}] → PDF Blob. onProgress(sayfa, toplam)
  async function sheets(forms, onProgress) {
    const fmt = Layout.fmtOf(forms[0].exam.format);
    const canvas = document.createElement('canvas');
    canvas.width = PX_W;
    canvas.height = PX_H;
    const pages = [];
    for (let i = 0; i < forms.length; i += fmt.perPage) pages.push(forms.slice(i, i + fmt.perPage));
    const jpegs = [];
    for (let i = 0; i < pages.length; i++) {
      onProgress?.(i + 1, pages.length);
      jpegs.push(await pageJPEG(Layout.pageSVG(fmt, pages[i]), canvas));
    }
    return build(jpegs);
  }

  // Veli kodu kartları: A4'te 2 sütun × 8 satır = 16 kart, aralarında kesik kesim çizgileri.
  // students: [{name, number, parentCode}] → PDF Blob
  const CARD_COLS = 2, CARD_ROWS = 8, CARD_W = 210 / CARD_COLS, CARD_H = 297 / CARD_ROWS;
  const xesc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  function codeCardsSVG(cls, studs, site) {
    const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297" font-family="Arial, Helvetica, sans-serif"><rect width="210" height="297" fill="#fff"/>`];
    studs.forEach((s, i) => {
      const x = (i % CARD_COLS) * CARD_W + 9, y = Math.floor(i / CARD_COLS) * CARD_H;
      const code = s.parentCode ? `${s.parentCode.slice(0, 4)} ${s.parentCode.slice(4)}` : '–';
      out.push(`<g transform="translate(${x} ${y})">
        <text x="0" y="8" font-size="2.6" fill="#666">${xesc(cut(cls.name, 30))}${s.number ? ' · No ' + xesc(s.number) : ''}</text>
        <text x="0" y="14.2" font-size="4.3" font-weight="bold" fill="#111">${xesc(cut(s.name, 34))}</text>
        <text x="0" y="20.6" font-size="2.6" fill="#666">Veli kodu</text>
        <text x="0" y="28" font-size="7" font-weight="bold" letter-spacing="0.6" fill="#111">${code}</text>
        <text x="0" y="33.2" font-size="2.4" fill="#555">${xesc(site)} adresine bu kodu yazarak sınav sonuçlarını görebilirsiniz.</text>
      </g>`);
    });
    const dash = 'stroke="#999" stroke-width="0.2" stroke-dasharray="2 1.5"';
    for (let c = 1; c < CARD_COLS; c++) out.push(`<line x1="${c * CARD_W}" x2="${c * CARD_W}" y1="0" y2="297" ${dash}/>`);
    for (let r = 1; r < CARD_ROWS; r++) out.push(`<line x1="0" x2="210" y1="${r * CARD_H}" y2="${r * CARD_H}" ${dash}/>`);
    out.push('</svg>');
    return out.join('');
  }

  async function parentCodes(cls, students, site) {
    const canvas = document.createElement('canvas');
    canvas.width = PX_W;
    canvas.height = PX_H;
    const per = CARD_COLS * CARD_ROWS, jpegs = [];
    for (let i = 0; i < students.length; i += per) jpegs.push(await pageJPEG(codeCardsSVG(cls, students.slice(i, i + per), site), canvas));
    return build(jpegs);
  }

  return { sheets, parentCodes };
})();
