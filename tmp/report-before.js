// Veliye gönderilecek sonuç karnesi: tuval üzerine çizilen, paylaşılabilir JPG.
// render(data) → canvas (1080 px genişlik, yükseklik içeriğe göre)
// data: {examName, dateText, className, studentName, number, booklet, mainValue, mainLabel, mainMax,
//        ratio (0–1), correct, wrong, blank, net, showNet, avg, rank, of, topics[{name,correct,total}],
//        wrongList[number], teacher}
const ReportCard = (() => {
  const W = 1080, PAD = 64, CARD_X = 48, CARD_W = W - 2 * CARD_X;
  const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const C = {
    bg: '#eef2f8', band1: '#0b5cc4', band2: '#2f80ed', card: '#ffffff', text: '#16181d', muted: '#6b7280',
    line: '#e6eaf0', track: '#edf1f7', ok: '#1f9d55', warn: '#e08600', bad: '#d93025', okSoft: '#e7f6ee', badSoft: '#fdecea', chip: '#f3f5f9',
  };
  const status = (r) => (r >= 0.7 ? C.ok : r >= 0.4 ? C.warn : C.bad);
  const font = (w, s) => `${w} ${s}px ${FONT}`;
  const fmt = (n, d = 2) => (Number.isInteger(n) ? String(n) : n.toFixed(d).replace(/0+$/, '').replace(/\.$/, '')).replace('.', ',');

  function roundRect(x, X, y, w, h, r) {
    x.beginPath();
    x.moveTo(X + r, y);
    x.arcTo(X + w, y, X + w, y + h, r);
    x.arcTo(X + w, y + h, X, y + h, r);
    x.arcTo(X, y + h, X, y, r);
    x.arcTo(X, y, X + w, y, r);
    x.closePath();
  }

  // Metni verilen genişliğe sığacak satırlara böler (en çok maxLines; fazlası "…")
  function wrap(x, text, maxW, maxLines) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (x.measureText(t).width <= maxW || !cur) cur = t;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      let last = lines[maxLines - 1];
      while (last && x.measureText(last + '…').width > maxW) last = last.slice(0, -1);
      lines[maxLines - 1] = last + '…';
    }
    return lines;
  }

  function render(d) {
    // İçerik önce saydam bir tuvale çizilir; yükseklik belli olunca arka plan ve kart eklenir.
    const content = document.createElement('canvas');
    content.width = W;
    content.height = 3000;
    const x = content.getContext('2d');
    x.textBaseline = 'alphabetic';
    const L = CARD_X + PAD, R = CARD_X + CARD_W - PAD, IW = R - L;

    // --- Üst bant (beyaz yazılar) ---
    let y = 96;
    x.fillStyle = 'rgba(255,255,255,.75)';
    x.font = font(700, 24);
    x.fillText('SINAV SONUÇ KARNESİ', L - 16, y);
    y += 62;
    x.fillStyle = '#fff';
    x.font = font(800, 50);
    const titleLines = wrap(x, d.examName, IW + 32, 2);
    titleLines.forEach((t) => { x.fillText(t, L - 16, y); y += 60; });
    x.fillStyle = 'rgba(255,255,255,.85)';
    x.font = font(500, 30);
    x.fillText([d.dateText, d.className].filter(Boolean).join('  ·  '), L - 16, y - 8);
    const cardTop = y + 40;

    // --- Kart içeriği ---
    y = cardTop + 86;
    x.fillStyle = C.text;
    x.font = font(800, 56);
    wrap(x, d.studentName, IW, 2).forEach((t) => { x.fillText(t, L, y); y += 64; });
    x.fillStyle = C.muted;
    x.font = font(500, 30);
    x.fillText([d.number ? 'No ' + d.number : '', d.booklet ? d.booklet + ' kitapçığı' : ''].filter(Boolean).join('  ·  ') || ' ', L, y - 10);
    y += 40;

    // Puan halkası
    const cx = W / 2, rr = 150, cy = y + rr + 10;
    x.lineCap = 'round';
    x.lineWidth = 30;
    x.strokeStyle = C.track;
    x.beginPath(); x.arc(cx, cy, rr, 0, Math.PI * 2); x.stroke();
    const ratio = Math.max(0, Math.min(1, d.ratio));
    if (ratio > 0) {
      x.strokeStyle = status(ratio);
      x.beginPath(); x.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + Math.max(0.02, ratio) * Math.PI * 2); x.stroke();
    }
    x.textAlign = 'center';
    x.fillStyle = C.text;
    x.font = font(800, 104);
    x.fillText(fmt(d.mainValue, d.showNet ? 1 : 2), cx, cy + 22); // puan 1, net 2 basamak
    x.fillStyle = C.muted;
    x.font = font(700, 26);
    x.fillText(d.mainLabel.toLocaleUpperCase('tr-TR') + (d.mainMax ? ` / ${d.mainMax}` : ''), cx, cy + 66);
    x.textAlign = 'left';
    y = cy + rr + 64;

    // Doğru / yanlış / boş kutuları
    const tiles = [['Doğru', d.correct, C.ok, C.okSoft], ['Yanlış', d.wrong, C.bad, C.badSoft], ['Boş', d.blank, C.muted, C.chip]];
    if (d.showNet) tiles.push(['Net', fmt(d.net), C.text, C.chip]);
    const gap = 18, tw = (IW - gap * (tiles.length - 1)) / tiles.length, th = 138;
    tiles.forEach(([label, val, col, soft], i) => {
      const tx = L + i * (tw + gap);
      x.fillStyle = soft;
      roundRect(x, tx, y, tw, th, 24);
      x.fill();
      x.textAlign = 'center';
      x.fillStyle = col;
      x.font = font(800, 56);
      x.fillText(String(val), tx + tw / 2, y + 74);
      x.fillStyle = C.muted;
      x.font = font(600, 26);
      x.fillText(label, tx + tw / 2, y + 112);
      x.textAlign = 'left';
    });
    y += th + 34;

    // Sınıf ortalaması / sıralama
    const facts = [];
    if (d.avg != null) facts.push(['Sınıf ortalaması', fmt(d.avg, 1) + ' ' + d.mainLabel.toLocaleLowerCase('tr-TR')]);
    if (d.rank) facts.push(['Sınıftaki sırası', `${d.rank} / ${d.of}`]);
    if (facts.length) {
      x.strokeStyle = C.line;
      x.lineWidth = 2;
      facts.forEach(([k, v]) => {
        x.beginPath(); x.moveTo(L, y); x.lineTo(R, y); x.stroke();
        y += 58;
        x.fillStyle = C.muted;
        x.font = font(500, 30);
        x.fillText(k, L, y);
        x.fillStyle = C.text;
        x.font = font(700, 32);
        x.textAlign = 'right';
        x.fillText(v, R, y);
        x.textAlign = 'left';
        y += 30;
      });
      x.beginPath(); x.moveTo(L, y); x.lineTo(R, y); x.stroke();
      y += 30;
    }

    // Konular
    if (d.topics && d.topics.length) {
      y += 30;
      x.fillStyle = C.text;
      x.font = font(800, 34);
      x.fillText('Konulara göre', L, y);
      y += 26;
      d.topics.slice(0, 8).forEach((t) => {
        const r = t.total ? t.correct / t.total : 0;
        y += 40;
        x.fillStyle = C.text;
        x.font = font(600, 28);
        const name = wrap(x, t.name, IW - 170, 1)[0];
        x.fillText(name, L, y);
        x.textAlign = 'right';
        x.fillStyle = C.muted;
        x.font = font(600, 26);
        x.fillText(`${t.correct}/${t.total}  ·  %${Math.round(r * 100)}`, R, y);
        x.textAlign = 'left';
        y += 16;
        x.fillStyle = C.track;
        roundRect(x, L, y, IW, 16, 8);
        x.fill();
        if (r > 0) {
          x.fillStyle = status(r);
          roundRect(x, L, y, Math.max(16, IW * r), 16, 8);
          x.fill();
        }
        y += 22;
      });
      y += 20;
    }

    // Yanlış yapılan sorular
    if (d.wrongList && d.wrongList.length) {
      y += 34;
      x.fillStyle = C.text;
      x.font = font(800, 34);
      x.fillText('Yanlış yaptığı sorular', L, y);
      y += 26;
      x.font = font(700, 28);
      let cxp = L, rowY = y;
      const ch = 54;
      for (const n of d.wrongList) {
        const label = String(n);
        const cw = Math.max(64, x.measureText(label).width + 36);
        if (cxp + cw > R) { cxp = L; rowY += ch + 12; }
        x.fillStyle = C.badSoft;
        roundRect(x, cxp, rowY, cw, ch, 27);
        x.fill();
        x.fillStyle = C.bad;
        x.textAlign = 'center';
        x.fillText(label, cxp + cw / 2, rowY + 37);
        x.textAlign = 'left';
        cxp += cw + 12;
      }
      y = rowY + ch + 20;
    }

    // İmza
    y += 30;
    if (d.teacher) {
      x.fillStyle = C.text;
      x.font = font(600, 30);
      x.textAlign = 'right';
      x.fillText(d.teacher, R, y + 10);
      x.textAlign = 'left';
      y += 30;
    }
    const cardBottom = y + 40;
    const H = cardBottom + 90;

    // --- Son tuval: arka plan, bant, kart, içerik ---
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const o = out.getContext('2d');
    o.fillStyle = C.bg;
    o.fillRect(0, 0, W, H);
    const g = o.createLinearGradient(0, 0, W, cardTop + 120);
    g.addColorStop(0, C.band1);
    g.addColorStop(1, C.band2);
    o.fillStyle = g;
    o.fillRect(0, 0, W, cardTop + 120);
    // bantta hafif desen: optik yuvarlaklar
    o.strokeStyle = 'rgba(255,255,255,.12)';
    o.lineWidth = 3;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
      o.beginPath(); o.arc(W - 70 - i * 46, 56 + j * 46, 15, 0, Math.PI * 2);
      if ((i + j * 2) % 4 === 1) { o.fillStyle = 'rgba(255,255,255,.18)'; o.fill(); } else o.stroke();
    }
    o.save();
    o.shadowColor = 'rgba(16,24,40,.12)';
    o.shadowBlur = 40;
    o.shadowOffsetY = 12;
    o.fillStyle = C.card;
    roundRect(o, CARD_X, cardTop, CARD_W, cardBottom - cardTop, 40);
    o.fill();
    o.restore();
    o.drawImage(content, 0, 0);
    o.fillStyle = C.muted;
    o.font = font(500, 22);
    o.textAlign = 'center';
    o.fillText('Optik Okuyucu ile hazırlandı', W / 2, H - 38);
    return out;
  }

  // Tuvalden eşzamanlı Blob (paylaşım kullanıcı dokunuşu içinde kalsın diye beklemesiz)
  function toBlob(canvas, type = 'image/jpeg', q = 0.92) {
    const data = atob(canvas.toDataURL(type, q).split(',')[1]);
    const bytes = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);
    return new Blob([bytes], { type });
  }

  return { render, toBlob };
})();
