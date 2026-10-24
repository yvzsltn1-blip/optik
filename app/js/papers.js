// Sınav kâğıtları: soruların fotoğrafı ya da PDF'i. Öğretmen hangi sınavda ne sorduğunu sonra hatırlasın
// diye sınava eklenir. Ortak sınavlarda (5A, 5B, 5C) dosyalar bir kez yüklenir, kâğıt birden çok sınava
// bağlanır. Fotoğraflar yüklenmeden önce küçültülür, listelerde küçük önizlemeleri gösterilir.
const Papers = (() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MAX_SIDE = 2400, THUMB_SIDE = 480, MAX_BYTES = 25 * 1024 * 1024, MAX_FILES = 30;
  let h; // app.js yardımcıları (bind ile gelir)
  let search = '';

  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';
  const ICON_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0-5 5m5-5 5 5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>';

  const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
  const norm = (s) => String(s || '').trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
  const className = (e) => Store.getClass(e.classId)?.name || 'Sınıf silinmiş';
  const linkedExams = (p) => (p.examIds || []).map(Store.getExam).filter(Boolean)
    .sort((a, b) => className(a).localeCompare(className(b), 'tr', { numeric: true }));
  const coarse = () => matchMedia('(pointer: coarse)').matches;
  // "5A" → 5; aynı adlı sınavın 6. sınıftaki eşi ortak sınav sayılmaz
  const gradeOf = (e) => Store.getClass(e.classId)?.name.match(/^\s*(\d+)/)?.[1] || '';
  const dayDiff = (a, b) => (a && b ? Math.abs(new Date(a) - new Date(b)) / 864e5 : 0);

  function pageLabel(p) {
    const pdf = p.files.filter(isPdf).length, img = p.files.length - pdf;
    return [img ? `${img} sayfa` : '', pdf ? `${pdf} PDF` : ''].filter(Boolean).join(' + ');
  }
  function thumb(f) {
    if (!f) return `<span class="paper-pdf">${ICON}</span>`;
    if (isPdf(f)) return `<span class="paper-pdf">${ICON}<b>PDF</b><small>${esc(f.name || '')}</small></span>`;
    return `<img src="${esc(f.thumbUrl || f.url || f.preview)}" alt="" loading="lazy">`;
  }
  const classChips = (p, current) => `<div class="paper-classes">${linkedExams(p).map((e) =>
    `<a class="paper-class${e.id === current ? ' on' : ''}" style="${h.classColor(e.classId)}" href="#/exam/${e.id}" title="${esc(e.name)}"><i></i>${esc(className(e))}</a>`).join('')}</div>`;

  // ---------- Sınav sayfasındaki bölüm ----------
  function examSection(exam) {
    const list = Store.examPapers(exam.id);
    if (list.length) {
      return list.map((p) => `<section class="paper-card">
        <div class="paper-card-head"><span class="paper-ico" aria-hidden="true">${ICON}</span>
          <div class="grow"><span class="eyebrow">Sınav kâğıdı</span><b>${esc(p.title)}</b><small>${pageLabel(p)}${p.examIds.length > 1 ? ` · ${p.examIds.length} sınavda` : ''}</small></div>
          <button class="btn small" data-paper-edit="${p.id}" data-exam="${exam.id}">Düzenle</button></div>
        <div class="paper-strip">${p.files.map((f, i) => `<button class="paper-thumb" data-paper-view="${p.id}" data-i="${i}" aria-label="${i + 1}. sayfayı aç">${thumb(f)}<span class="paper-pg">${i + 1}</span></button>`).join('')}</div>
        ${p.examIds.length > 1 ? classChips(p, exam.id) : ''}</section>`).join('');
    }
    // Aynı adlı başka bir sınava yüklenmiş kâğıt varsa tek dokunuşla bu sınava da bağlanır
    const twin = Store.papers().find((p) => linkedExams(p).some((e) => e.id !== exam.id && norm(e.name) === norm(exam.name)));
    const count = Store.papers().length;
    return `<section class="paper-empty">
      <div class="paper-card-head"><span class="paper-ico" aria-hidden="true">${ICON}</span>
        <div class="grow"><span class="eyebrow">Sınav kâğıdı</span><b>Soruları bu sınava ekleyin</b><small>PNG, JPG ya da PDF yükleyin</small></div></div>
      ${twin ? `<button class="paper-twin" data-paper-link="${twin.id}" data-exam="${exam.id}"><span class="paper-twin-cover">${thumb(twin.files[0])}</span>
        <span class="grow"><b>${esc(twin.title)}</b><small>${linkedExams(twin).map(className).map(esc).join(', ')} sınav${twin.examIds.length > 1 ? 'larında' : 'ında'} yüklü</small></span><span class="paper-twin-add">+ Bu sınava bağla</span></button>` : ''}
      <div class="paper-empty-btns"><button class="btn primary" data-paper-new="${exam.id}">${ICON_UP} Dosya yükle</button>${count ? `<button class="btn" data-paper-pick="${exam.id}">Arşivden seç <span class="paper-n">${count}</span></button>` : ''}</div>
    </section>`;
  }

  // ---------- Kâğıt arşivi (#/papers) ----------
  function filtered() {
    const q = norm(search);
    return Store.papers().filter((p) => !q || norm(`${p.title} ${linkedExams(p).map((e) => `${e.name} ${className(e)}`).join(' ')}`).includes(q));
  }
  function resultsHTML() {
    const list = filtered();
    if (!list.length) return `<div class="card empty">Bu aramaya uygun kâğıt yok.</div>`;
    return list.map((p) => `<article class="paper-tile">
      <button class="paper-cover" data-paper-view="${p.id}" data-i="0" aria-label="${esc(p.title)} aç">${thumb(p.files[0])}${p.files.length > 1 ? `<span class="paper-count">${p.files.length}</span>` : ''}</button>
      <div class="paper-tile-body"><b>${esc(p.title)}</b><small>${h.fmtDate(p.date)} · ${pageLabel(p)}</small>
        ${p.examIds?.length ? classChips(p) : '<span class="pill warn">Sınava bağlı değil</span>'}</div>
      <button class="paper-edit-btn" data-paper-edit="${p.id}" aria-label="${esc(p.title)} düzenle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg></button>
    </article>`).join('');
  }
  function libraryView() {
    h.setTop('Sınav kâğıtları', '#/exams', '<button class="btn small primary" data-paper-new="">+ Yükle</button>');
    const list = Store.papers();
    if (!list.length) {
      return `<div class="card empty paper-library-empty"><span class="paper-ico big" aria-hidden="true">${ICON}</span>
        <p><b>Henüz sınav kâğıdı yok.</b><br>Soruların fotoğrafını ya da PDF'ini yükleyin, hangi sınavlarda kullandığınızı seçin. Sınav sayfasında hep elinizin altında olsun.</p>
        <button class="btn primary" data-paper-new="">${ICON_UP} İlk kâğıdı yükle</button></div>`;
    }
    const pages = list.reduce((n, p) => n + p.files.length, 0);
    return `<div class="exam-editorial"><div><span class="eyebrow">SORU ARŞİVİ</span><h2>Sınav kâğıtları<span>.</span></h2><p>${list.length} kâğıt · ${pages} dosya · bir kez yükleyin, istediğiniz sınavlara bağlayın.</p></div></div>
      <label class="exam-search paper-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="paper-search" type="search" aria-label="Kâğıt, sınav veya sınıf ara" placeholder="Kâğıt, sınav veya sınıf ara…" value="${esc(search)}"></label>
      <div class="paper-grid" id="paper-results">${resultsHTML()}</div>`;
  }

  // ---------- Görsel hazırlama ----------
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name} açılamadı. JPG, PNG ya da PDF seçin.`)); };
      img.src = url;
    });
  }
  function toJpeg(img, side, quality) {
    const w = img.naturalWidth, hh = img.naturalHeight, s = Math.min(1, side / Math.max(w, hh));
    const c = document.createElement('canvas');
    c.width = Math.round(w * s); c.height = Math.round(hh * s);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; // saydam PNG kararmasın
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Görsel hazırlanamadı'))), 'image/jpeg', quality));
  }
  // Büyük telefon fotoğrafları 2400 piksele küçültülür (sorular okunur kalır); küçük JPG/PNG olduğu gibi gider.
  async function prepareImage(file) {
    const img = await loadImage(file);
    const big = Math.max(img.naturalWidth, img.naturalHeight) > MAX_SIDE || file.size > 2.5e6 || !/^image\/(jpeg|png|webp)$/.test(file.type);
    return { main: big ? await toJpeg(img, MAX_SIDE, 0.86) : file, thumb: await toJpeg(img, THUMB_SIDE, 0.72), w: img.naturalWidth, h: img.naturalHeight };
  }
  async function upload(paperId, raw, onP, track) {
    const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (isPdf(raw)) {
      const pdf = raw.type === 'application/pdf' ? raw : new Blob([raw], { type: 'application/pdf' });
      const r = await Cloud.uploadPaperFile(paperId, `${stamp}.pdf`, pdf, onP);
      track(r.path);
      return { name: raw.name, type: 'application/pdf', size: raw.size, path: r.path, url: r.url };
    }
    const img = await prepareImage(raw);
    const ext = { 'image/png': 'png', 'image/webp': 'webp' }[img.main.type] || 'jpg';
    const main = await Cloud.uploadPaperFile(paperId, `${stamp}.${ext}`, img.main, (f) => onP(f * 0.9));
    track(main.path);
    const th = await Cloud.uploadPaperFile(paperId, `${stamp}-kucuk.jpg`, img.thumb, (f) => onP(0.9 + f * 0.1));
    track(th.path);
    return { name: raw.name, type: img.main.type, size: img.main.size, w: img.w, h: img.h, path: main.path, url: main.url, thumbPath: th.path, thumbUrl: th.url };
  }
  const filePaths = (f) => [f.path, f.thumbPath].filter(Boolean);

  // ---------- Yükleme / düzenleme penceresi ----------
  // examId: sınav sayfasından açıldıysa o sınav seçili gelir. Yeni kâğıtta diğer sınıfların aynı adlı,
  // yakın tarihli sınavları da seçili gelir (ortak yazılı); öğretmen istemezse işareti kaldırır.
  function editor(paper, examId) {
    if (!window.Cloud?.email) return h.toast('Sınav kâğıdı yüklemek için hesabınıza giriş yapın');
    const exam = examId ? Store.getExam(examId) : null;
    const st = {
      id: paper?.id || Store.newPaperId(),
      items: (paper?.files || []).map((f) => ({ file: f })), // file: yüklenmiş; raw: yeni seçilen
      removed: [], uploaded: [], busy: false,
      examIds: new Set(paper ? paper.examIds || [] : exam ? [exam.id] : []),
    };
    const auto = !paper && exam ? Store.exams().filter((e) => e.classId !== exam.classId && norm(e.name) === norm(exam.name)
      && gradeOf(e) === gradeOf(exam) && dayDiff(e.date, exam.date) <= 21) : [];
    auto.forEach((e) => st.examIds.add(e.id));
    // Bu sınav ve seçililer başta (sınıf adına göre), sonra aynı adlılar, sonra en yeniler
    const rank = (e) => (e.id === exam?.id ? 0 : st.examIds.has(e.id) ? 1 : exam && norm(e.name) === norm(exam.name) ? 2 : 3);
    const exams = Store.exams().map((e, i) => ({ e, i })).sort((a, b) => rank(a.e) - rank(b.e)
      || (rank(a.e) < 3 ? className(a.e).localeCompare(className(b.e), 'tr', { numeric: true }) : 0) || a.i - b.i).map((x) => x.e);

    const m = $('#modal');
    m.innerHTML = `<form class="sheet-modal paper-editor" novalidate>
      <h3>${paper ? 'Sınav kâğıdını düzenle' : 'Sınav kâğıdı yükle'}</h3>
      <label class="field"><span>Kâğıdın adı</span><input type="text" name="title" maxlength="120" value="${esc(paper?.title || exam?.name || '')}" placeholder="Örn. 5. sınıflar 1. dönem 1. yazılı"></label>
      <label class="paper-drop"><input type="file" accept="image/*,application/pdf,.pdf" multiple hidden data-files>
        <span class="paper-drop-ico" aria-hidden="true">${ICON_UP}</span><b>Fotoğraf veya PDF seç</b><small>PNG, JPG ya da PDF · birden çok sayfayı birlikte seçebilirsiniz</small></label>
      <div class="paper-edit-thumbs" data-thumbs></div>
      <div class="paper-exam-head"><b>Hangi sınavlarda kullanıldı?</b><small data-count></small></div>
      ${auto.length ? `<p class="paper-auto">Aynı adlı <b>${auto.map(className).map(esc).join(', ')}</b> sınav${auto.length > 1 ? 'ları' : 'ı'} da seçildi. Kâğıt bir kez yüklenir, hepsinde görünür.</p>` : ''}
      ${exams.length > 8 ? '<input type="search" class="paper-exam-search" placeholder="Sınav veya sınıf ara…" data-exam-search>' : ''}
      <div class="paper-exam-list">${exams.length ? exams.map((e) => `<label class="paper-exam" style="${h.classColor(e.classId)}" data-text="${esc(norm(`${e.name} ${className(e)}`))}">
        <input type="checkbox" value="${e.id}" ${st.examIds.has(e.id) ? 'checked' : ''}><span class="paper-exam-class">${esc(className(e))}</span>
        <span class="grow"><b>${esc(e.name)}</b><small>${h.fmtDate(e.date)}</small></span></label>`).join('') : '<p class="small muted">Henüz sınav yok; kâğıt arşivde durur, sonra bağlayabilirsiniz.</p>'}</div>
      <div class="paper-progress" data-progress hidden><span><i></i></span><small></small></div>
      ${paper ? '<button type="button" class="btn danger block" data-delete style="margin-top:16px">Kâğıdı sil</button>' : ''}
      <div class="btns"><button type="button" class="btn" data-close>Vazgeç</button><button class="btn primary" data-save>${paper ? 'Kaydet' : 'Yükle ve kaydet'}</button></div>
    </form>`;
    m.hidden = false;
    const form = m.querySelector('form');

    const drawThumbs = () => {
      form.querySelector('[data-thumbs]').innerHTML = st.items.map((it, i) => `<figure class="paper-edit-thumb">
        ${it.file ? thumb(it.file) : isPdf(it.raw) ? thumb({ type: 'application/pdf', name: it.raw.name }) : `<img src="${it.preview}" alt="">`}
        <span class="paper-pg">${i + 1}</span>
        ${i ? `<button type="button" class="paper-move" data-move="${i}" aria-label="${i + 1}. sayfayı öne al">‹</button>` : ''}
        <button type="button" class="paper-remove" data-remove="${i}" aria-label="${i + 1}. sayfayı kaldır">×</button></figure>`).join('');
    };
    const drawCount = () => {
      const n = st.examIds.size;
      form.querySelector('[data-count]').textContent = n ? `${n} sınav seçili` : 'Seçilmezse yalnız arşivde durur';
    };
    const progress = (f, text) => {
      const el = form.querySelector('[data-progress]');
      el.hidden = false;
      el.querySelector('i').style.width = `${Math.round(f * 100)}%`;
      el.querySelector('small').textContent = text;
    };
    const setBusy = (on) => {
      st.busy = on;
      form.querySelectorAll('button, input').forEach((b) => { b.disabled = on; });
      form.querySelector('[data-save]').textContent = on ? 'Yükleniyor…' : paper ? 'Kaydet' : 'Yükle ve kaydet';
    };
    const close = () => {
      if (st.busy) return;
      st.items.forEach((it) => it.preview && URL.revokeObjectURL(it.preview));
      // Yüklenip kaydedilmeyen dosyalar bulutta yer kaplamasın
      st.uploaded.forEach((p) => Cloud.deletePaperFile(p));
      h.closeModal();
    };
    drawThumbs();
    drawCount();

    form.querySelector('[data-files]').addEventListener('change', (ev) => {
      for (const raw of ev.target.files) {
        if (st.items.length >= MAX_FILES) { h.toast(`Bir kâğıtta en çok ${MAX_FILES} dosya olabilir`); break; }
        if (!isPdf(raw) && !raw.type.startsWith('image/')) { h.toast(`${raw.name}: yalnızca resim ya da PDF`); continue; }
        if (isPdf(raw) && raw.size > MAX_BYTES) { h.toast(`${raw.name} 25 MB'tan büyük`); continue; }
        st.items.push({ raw, preview: isPdf(raw) ? null : URL.createObjectURL(raw) });
      }
      ev.target.value = '';
      drawThumbs();
    });
    form.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-move],[data-remove],[data-close],[data-delete]');
      if (!b || st.busy) return;
      if (b.dataset.move) {
        const i = +b.dataset.move;
        [st.items[i - 1], st.items[i]] = [st.items[i], st.items[i - 1]];
        drawThumbs();
      } else if (b.dataset.remove) {
        const [it] = st.items.splice(+b.dataset.remove, 1);
        if (it.preview) URL.revokeObjectURL(it.preview);
        if (it.file) st.removed.push(...filePaths(it.file));
        drawThumbs();
      } else if ('close' in b.dataset) close();
      else if ('delete' in b.dataset) {
        const n = paper.examIds?.length || 0;
        h.confirmBox('Sınav kâğıdı silinsin mi?', `<b>${esc(paper.title)}</b> ve ${paper.files.length} dosyası silinecek${n ? `; bağlı ${n} sınavdan da kalkar` : ''}. Sınav sonuçları etkilenmez.`, 'Sil', () => {
          [...paper.files.flatMap(filePaths), ...st.uploaded].forEach((p) => Cloud.deletePaperFile(p));
          Store.deletePaper(paper.id);
          h.toast('Sınav kâğıdı silindi');
          h.render(true);
        });
      }
    });
    form.addEventListener('change', (ev) => {
      if (ev.target.type !== 'checkbox') return;
      if (ev.target.checked) st.examIds.add(+ev.target.value); else st.examIds.delete(+ev.target.value);
      drawCount();
    });
    form.querySelector('[data-exam-search]')?.addEventListener('input', (ev) => {
      const q = norm(ev.target.value);
      form.querySelectorAll('.paper-exam').forEach((row) => { row.hidden = !!q && !row.dataset.text.includes(q); });
    });
    m.onclick = (ev) => { if (ev.target === m) close(); };

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (st.busy) return;
      const title = form.elements.title.value.trim();
      if (!title) { form.elements.title.focus(); return h.toast('Kâğıda bir ad verin'); }
      if (!st.items.length) return h.toast('En az bir fotoğraf ya da PDF seçin');
      const fresh = st.items.filter((it) => !it.file);
      setBusy(true);
      try {
        for (let k = 0; k < fresh.length; k++) {
          const label = fresh.length > 1 ? `${k + 1}/${fresh.length} dosya yükleniyor…` : 'Dosya yükleniyor…';
          progress(k / fresh.length, label);
          fresh[k].file = await upload(st.id, fresh[k].raw, (f) => progress((k + f) / fresh.length, label), (p) => st.uploaded.push(p));
        }
      } catch (err) {
        setBusy(false);
        progress(0, err.message);
        return h.toast(err.message);
      }
      const linked = [...st.examIds].map(Store.getExam).filter(Boolean);
      const dates = linked.map((e) => e.date).filter(Boolean).sort();
      Store.savePaper({
        id: st.id, title, examIds: linked.map((e) => e.id),
        date: dates[0] || paper?.date || new Date().toISOString().slice(0, 10),
        files: st.items.map((it) => it.file),
      });
      st.removed.forEach((p) => Cloud.deletePaperFile(p));
      st.items.forEach((it) => it.preview && URL.revokeObjectURL(it.preview));
      st.busy = false;
      st.uploaded = [];
      h.closeModal();
      h.toast(linked.length > 1 ? `Kâğıt ${linked.length} sınava eklendi` : 'Sınav kâğıdı kaydedildi');
      h.render(true);
    });
    if (!paper && !st.items.length) setTimeout(() => form.elements.title.select(), 50);
  }

  // ---------- Arşivden seçme ----------
  function picker(examId) {
    const exam = Store.getExam(examId);
    const list = Store.papers().map((p, i) => ({ p, i, same: linkedExams(p).some((e) => norm(e.name) === norm(exam.name)) }))
      .sort((a, b) => b.same - a.same || a.i - b.i).map((x) => x.p);
    const form = h.modal('Arşivden sınav kâğıdı', `<p class="small muted" style="margin-top:-6px">Daha önce yüklediğiniz kâğıdı <b>${esc(className(exam))} · ${esc(exam.name)}</b> sınavına bağlayın. Dosyalar yeniden yüklenmez.</p>
      <div class="paper-pick-list">${list.map((p) => `<label class="paper-pick"><input type="checkbox" value="${p.id}" ${p.examIds?.includes(examId) ? 'checked' : ''}>
        <span class="paper-pick-cover">${thumb(p.files[0])}</span>
        <span class="grow"><b>${esc(p.title)}</b><small>${h.fmtDate(p.date)} · ${pageLabel(p)}${p.examIds?.length ? ` · ${linkedExams(p).map(className).map(esc).join(', ')}` : ''}</small></span></label>`).join('')}</div>`,
    (fd, f) => {
      const want = new Set([...f.querySelectorAll('input:checked')].map((x) => x.value));
      let n = 0;
      for (const p of Store.papers()) {
        const has = !!p.examIds?.includes(examId);
        if (has === want.has(p.id)) continue;
        Store.savePaper({ id: p.id, examIds: has ? p.examIds.filter((x) => x !== examId) : [...(p.examIds || []), examId] });
        n++;
      }
      if (n) h.toast('Sınav kâğıdı güncellendi');
      h.render(true);
    }, 'Bağla');
    return form;
  }

  function link(paperId, examId) {
    const p = Store.getPaper(paperId);
    if (!p || p.examIds?.includes(examId)) return;
    Store.savePaper({ id: p.id, examIds: [...(p.examIds || []), examId] });
    h.toast('Sınav kâğıdı bu sınava da bağlandı');
    h.render(true);
  }

  // ---------- Tam ekran görüntüleyici ----------
  function viewer(paperId, start = 0) {
    const p = Store.getPaper(paperId);
    if (!p?.files.length) return;
    let i = Math.min(start, p.files.length - 1), x0 = null;
    const n = p.files.length;
    const el = document.createElement('div');
    el.className = 'paper-viewer';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', p.title);
    const draw = () => {
      const f = p.files[i];
      const stage = !isPdf(f) ? `<img src="${esc(f.url)}" alt="${i + 1}. sayfa">`
        : coarse() ? `<div class="pv-pdf"><span class="paper-pdf">${ICON}<b>PDF</b></span><p>${esc(f.name || 'PDF dosyası')}</p><a class="btn primary" href="${esc(f.url)}" target="_blank" rel="noopener">PDF'i aç</a></div>`
          : `<iframe src="${esc(f.url)}" title="${esc(f.name || 'PDF')}"></iframe>`;
      el.innerHTML = `<div class="pv-top"><button class="pv-btn" data-pv="close" aria-label="Kapat">✕</button>
          <div class="pv-title"><b>${esc(p.title)}</b><small>${n > 1 ? `${i + 1} / ${n}` : pageLabel(p)}${p.examIds?.length ? ` · ${linkedExams(p).map(className).map(esc).join(', ')}` : ''}</small></div>
          <a class="pv-btn pv-open" href="${esc(f.url)}" target="_blank" rel="noopener" aria-label="Yeni sekmede aç">↗</a></div>
        <div class="pv-stage">${stage}</div>
        ${n > 1 ? `<button class="pv-nav prev" data-pv="prev" aria-label="Önceki" ${i ? '' : 'disabled'}>‹</button><button class="pv-nav next" data-pv="next" aria-label="Sonraki" ${i < n - 1 ? '' : 'disabled'}>›</button>
          <div class="pv-dots">${p.files.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>` : ''}`;
    };
    const go = (d) => { const k = i + d; if (k >= 0 && k < n) { i = k; draw(); } };
    const close = () => { el.remove(); document.removeEventListener('keydown', onKey); document.body.classList.remove('pv-open-body'); };
    const onKey = (ev) => {
      if (ev.key === 'Escape') close();
      else if (ev.key === 'ArrowLeft') go(-1);
      else if (ev.key === 'ArrowRight') go(1);
    };
    el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-pv]');
      if (b) return b.dataset.pv === 'close' ? close() : go(b.dataset.pv === 'prev' ? -1 : 1);
      // Görsele dokununca yakınlaştır / sığdır
      if (ev.target.tagName === 'IMG') ev.target.closest('.pv-stage').classList.toggle('zoom');
      else if (ev.target.classList.contains('pv-stage')) close();
    });
    el.addEventListener('touchstart', (ev) => { x0 = ev.touches.length === 1 && !el.querySelector('.pv-stage.zoom') ? ev.touches[0].clientX : null; }, { passive: true });
    el.addEventListener('touchend', (ev) => {
      if (x0 == null) return;
      const dx = ev.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
    });
    document.addEventListener('keydown', onKey);
    document.body.classList.add('pv-open-body');
    draw();
    document.body.appendChild(el);
  }

  // ---------- Olaylar ----------
  function onClick(ev) {
    const t = ev.target.closest('[data-paper-new],[data-paper-edit],[data-paper-view],[data-paper-pick],[data-paper-link]');
    if (!t) return;
    ev.preventDefault();
    const d = t.dataset;
    if (d.paperNew != null) editor(null, d.paperNew ? +d.paperNew : null);
    else if (d.paperEdit) editor(Store.getPaper(d.paperEdit), d.exam ? +d.exam : null);
    else if (d.paperView) viewer(d.paperView, +d.i || 0);
    else if (d.paperPick) picker(+d.paperPick);
    else if (d.paperLink) link(d.paperLink, +d.exam);
  }
  function bind(view, hooks) {
    h = hooks;
    view.addEventListener('click', onClick);
    $('#top-actions').addEventListener('click', onClick);
    view.addEventListener('input', (ev) => {
      if (ev.target.id !== 'paper-search') return;
      search = ev.target.value;
      $('#paper-results').innerHTML = resultsHTML();
    });
  }

  const has = (examId) => Store.examPapers(examId).length > 0;
  return { examSection, libraryView, has, bind };
})();
