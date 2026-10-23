// Ekran ve paylaşım için aynı, çevrimdışı üretilebilen 1080 px sonuç karnesi.
const ReportCard = (() => {
  const W = 1080, L = 76, R = W - L, IW = R - L;
  const FONT = '"Segoe UI", -apple-system, BlinkMacSystemFont, Arial, sans-serif';
  const C = { navy: '#1b3045', text: '#203449', muted: '#68798a', line: '#e2e8ed', teal: '#267d6b', soft: '#eff5f3', bad: '#b95653', badSoft: '#fbefed', track: '#e7eeed' };
  const font = (weight, size) => `${weight} ${size}px ${FONT}`;
  const fmt = (n, digits = 1) => Number(n).toLocaleString('tr-TR', { maximumFractionDigits: digits });
  const clamp = (v) => Math.max(0, Math.min(1, Number(v) || 0));
  function box(x, left, top, width, height, radius = 14) {
    const r = Math.min(radius, width / 2, height / 2);
    x.beginPath(); x.moveTo(left + r, top);
    x.arcTo(left + width, top, left + width, top + height, r);
    x.arcTo(left + width, top + height, left, top + height, r);
    x.arcTo(left, top + height, left, top, r);
    x.arcTo(left, top, left + width, top, r); x.closePath(); x.fill();
  }
  // Uzun sözcükler de bölünür; konu ve öğrenci adları kesilmez.
  function wrap(x, value, width) {
    const lines = []; let line = '';
    for (const word of String(value || '').split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (x.measureText(next).width <= width) { line = next; continue; }
      if (line) lines.push(line); line = '';
      for (const ch of word) {
        if (line && x.measureText(line + ch).width > width) { lines.push(line); line = ''; }
        line += ch;
      }
    }
    if (line) lines.push(line); return lines;
  }
  function render(d) {
    const canvas = document.createElement('canvas'); canvas.width = W;
    const x = canvas.getContext('2d');
    const measure = (value, width, weight, size) => { x.font = font(weight, size); return wrap(x, value, width); };
    const exam = measure(d.examName, IW, 600, 43), name = measure(d.studentName, IW, 600, 55);
    const meta = measure([d.className, d.dateText].filter(Boolean).join('   /   '), IW, 400, 26);
    const studentMeta = measure([d.number ? 'Öğrenci no: ' + d.number : '', d.booklet ? d.booklet + ' kitapçığı' : ''].filter(Boolean).join('   ·   '), IW, 400, 26);
    const topics = (d.topics || []).map((t) => ({ ...t, lines: measure(t.name, IW - 220, 500, 28) }));
    const teacher = measure(d.teacher, IW - 330, 500, 27), wrong = d.wrongList || [];
    const chipCols = 12, chipSize = (IW - 110) / chipCols;
    const headerH = 147 + exam.length * 55 + meta.length * 36;
    const identityH = 112 + Math.max(1, name.length) * 65 + studentMeta.length * 36;
    const facts = [];
    if (d.avg != null) facts.push(['Sınıf ortalaması', `${fmt(d.avg)} ${String(d.mainLabel).toLocaleLowerCase('tr-TR')}`]);
    if (d.rank) facts.push(['Sınıf sıralaması', `${d.rank} / ${d.of}`]);
    const topicsH = topics.length ? 117 + topics.reduce((sum, t) => sum + Math.max(1, t.lines.length) * 37 + 45, 0) : 0;
    const wrongH = wrong.length ? 150 + Math.ceil(wrong.length / chipCols) * (chipSize + 10) : 0;
    const H = Math.ceil(headerH + identityH + 270 + 164 + (facts.length ? 142 : 0) + topicsH + wrongH + 174 + teacher.length * 35);
    canvas.height = H; x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    const text = (v, left, top, size = 28, weight = 400, color = C.text, align = 'left') => {
      x.font = font(weight, size); x.fillStyle = color; x.textAlign = align; x.textBaseline = 'alphabetic'; x.fillText(String(v), left, top);
    };
    const rule = (y) => { x.fillStyle = C.line; x.fillRect(L, y, IW, 1.5); };
    const lines = (arr, left, top, step, size, weight, color) => arr.forEach((t, i) => text(t, left, top + i * step, size, weight, color));
    const label = (v, left, top, color = C.muted) => text(v, left, top, 21, 600, color);
    x.fillStyle = C.navy; x.fillRect(0, 0, W, headerH);
    x.fillStyle = '#8dcbb8'; x.fillRect(0, 0, W, 7);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
      x.beginPath(); x.arc(L + 7 + col * 19, 54 + row * 19, 5.5, 0, Math.PI * 2);
      x.fillStyle = row === 1 && col === 1 ? '#8dcbb8' : '#d3e0e8'; x.fill();
    }
    label('OPTİK / AKADEMİK RAPOR', L + 76, 72, '#d3e0e8');
    text('SONUÇ KARNESİ', R, 72, 21, 600, '#d3e0e8', 'right');
    lines(exam, L, 143, 55, 43, 600, '#ffffff');
    lines(meta, L, 143 + exam.length * 55, 36, 26, 400, '#b5c7d6');
    let y = headerH + 58;
    label('ÖĞRENCİ BİLGİLERİ', L, y); y += 64;
    lines(name, L, y, 65, 55, 600, C.text);
    y += (Math.max(1, name.length) - 1) * 65 + 44;
    lines(studentMeta, L, y, 36, 26, 400, C.muted);
    y = headerH + identityH;
    x.fillStyle = C.soft; box(x, L, y, IW, 238, 20);
    label(String(d.mainLabel).toLocaleUpperCase('tr-TR') + ' SONUCU', L + 30, y + 46, C.teal);
    const score = fmt(d.mainValue, d.showNet ? 1 : 2); let scoreSize = 98;
    x.font = font(600, scoreSize);
    while (x.measureText(score).width > 390 && scoreSize > 40) { scoreSize -= 2; x.font = font(600, scoreSize); }
    text(score, L + 26, y + 150, scoreSize, 600, C.navy);
    const valueW = x.measureText(score).width;
    text(`/ ${d.mainMax ?? '—'}`, L + 42 + valueW, y + 148, 30, 400, C.muted);
    text(`%${fmt((Number(d.ratio) || 0) * 100)}`, R - 30, y + 108, 42, 600, C.teal, 'right');
    text('Başarı oranı', R - 30, y + 146, 24, 400, C.muted, 'right');
    x.fillStyle = '#d6e4e0'; box(x, L + 30, y + 190, IW - 60, 8, 4);
    if (clamp(d.ratio)) { x.fillStyle = C.teal; box(x, L + 30, y + 190, (IW - 60) * clamp(d.ratio), 8, 4); }
    y += 270;
    const tiles = [['Doğru', d.correct, C.teal], ['Yanlış', d.wrong, C.bad], ['Boş', d.blank, C.muted]];
    if (d.showNet) tiles.push(['Net', fmt(d.net, 2), C.navy]);
    tiles.forEach(([label, value, color], i) => {
      const tx = L + i * IW / tiles.length;
      text(value, tx + 24, y + 61, 49, 600, color); text(label, tx + 26, y + 103, 25, 400, C.muted);
      if (i) { x.fillStyle = C.line; x.fillRect(tx, y + 24, 1.5, 84); }
    });
    y += 145; rule(y); y += 19;
    if (facts.length) {
      facts.forEach(([label, value], i) => { const fx = L + i * IW / facts.length; text(label, fx, y + 44, 25, 400, C.muted); text(value, fx, y + 90, 34, 600); });
      y += 123; rule(y); y += 19;
    }
    if (topics.length) {
      y += 54; text('Konu bazında değerlendirme', L, y, 33, 600); text('DOĞRU / SORU', R, y, 20, 600, C.muted, 'right'); y += 46;
      topics.forEach((t) => {
        const r = t.total ? clamp(t.correct / t.total) : 0;
        lines(t.lines, L, y, 37, 28, 500, C.text);
        text(`${t.correct} / ${t.total}   %${Math.round(r * 100)}`, R, y, 24, 500, C.muted, 'right');
        y += Math.max(1, t.lines.length) * 37 - 15;
        x.fillStyle = C.track; box(x, L, y, IW, 7, 3.5);
        if (r) { x.fillStyle = r >= .7 ? C.teal : r >= .4 ? '#b48c52' : C.bad; box(x, L, y, IW * r, 7, 3.5); }
        y += 60;
      });
      y += 17;
    }
    if (wrong.length) {
      y += 50; text('Tekrar edilecek sorular', L, y, 33, 600);
      text('Yanlış yanıtlanan sorulara bir kez daha göz atalım.', L, y + 42, 25, 400, C.muted); y += 70;
      wrong.forEach((q, i) => {
        const cx = L + (i % chipCols) * (chipSize + 10), cy = y + Math.floor(i / chipCols) * (chipSize + 10);
        x.fillStyle = C.badSoft; box(x, cx, cy, chipSize, chipSize, 12);
        text(q, cx + chipSize / 2, cy + chipSize / 2 + 10, 27, 600, C.bad, 'center');
      });
      y += Math.ceil(wrong.length / chipCols) * (chipSize + 10) + 30;
    }
    y += 32; rule(y); y += 48; label('DEĞERLENDİRME RAPORU', L, y);
    teacher.forEach((t, i) => text(t, R, y + i * 35, 27, 500, C.text, 'right'));
    y += teacher.length * 35; text('Optik Okuyucu ile hazırlanmıştır.', L, y + 38, 21, 400, C.muted);
    x.fillStyle = C.navy; x.fillRect(0, H - 9, W, 9);
    return canvas;
  }
  // Paylaşımın kullanıcı dokunuşu içinde kalması için eşzamanlı dönüşüm.
  function toBlob(canvas, type = 'image/jpeg', q = 0.92) {
    const data = atob(canvas.toDataURL(type, q).split(',')[1]), bytes = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);
    return new Blob([bytes], { type });
  }
  return { render, toBlob };
})();
