// Uygulama arayüzü: basit hash yönlendirme + HTML şablonları.
(() => {
  const $ = (s) => document.querySelector(s);
  const view = $('#view');
  const L = Layout.LETTERS;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, d = 2) => (Number.isInteger(n) ? String(n) : n.toFixed(d).replace(/0+$/, '').replace(/\.$/, '')).replace('.', ',');
  const today = () => new Date().toISOString().slice(0, 10);
  const fmtDate = (s) => (s ? new Date(s + 'T00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const ansLabel = (a) => (a == null ? '–' : a === -1 ? '✱' : L[a]);

  // Veli kodu (matematik.win'de girilir): "12345678" → "1234 5678"
  const PARENT_SITE = 'matematik.win';
  const fmtCode = (c) => (c ? `${c.slice(0, 4)} ${c.slice(4)}` : 'hazırlanıyor…');

  // ---------- Genel yardımcılar ----------
  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }

  // Alttan açılan form penceresi. onSubmit(FormData) false dönerse pencere açık kalır.
  function modal(title, body, onSubmit, submitText = 'Kaydet') {
    const m = $('#modal');
    m.innerHTML = `<form class="sheet-modal"><h3>${title}</h3>${body}
      <div class="btns"><button type="button" class="btn" data-close>Vazgeç</button><button class="btn primary">${submitText}</button></div></form>`;
    m.hidden = false;
    const form = m.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (onSubmit(new FormData(form), form) !== false) closeModal();
    });
    form.querySelector('[data-close]').onclick = closeModal;
    m.onclick = (e) => { if (e.target === m) closeModal(); };
    form.querySelector('input:not([type=hidden]),textarea')?.focus();
    form.querySelectorAll('.seg').forEach((seg) => {
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        form.elements[seg.dataset.name].value = b.dataset.v;
      });
    });
    return form;
  }
  function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }

  function confirmBox(title, text, okText, onOk) {
    modal(title, `<p class="muted">${text}</p>`, () => onOk(), okText).querySelector('.btn.primary').classList.add('danger');
  }

  function seg(name, value, options) {
    return `<input type="hidden" name="${name}" value="${value}"><div class="seg" data-name="${name}">${options
      .map(([v, label]) => `<button type="button" data-v="${v}" class="${String(v) === String(value) ? 'on' : ''}">${label}</button>`).join('')}</div>`;
  }

  function setTop(title, back, actions = '') {
    $('#title').textContent = title;
    document.title = title === 'Optik Okuyucu' ? title : title + ' · Optik Okuyucu';
    const b = $('#back');
    b.style.visibility = back ? 'visible' : 'hidden';
    b.hidden = !back;
    b.onclick = () => (location.hash = back);
    $('#top-actions').innerHTML = actions;
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // Kitapçıklı sınavlarda A/B/C/D sekmeleri; href(b) her sekmenin adresi
  function bookletTabs(e, current, href) {
    const n = Store.bookletCount(e);
    if (n < 2) return '';
    return `<div class="seg" style="margin-bottom:12px">${Array.from({ length: n }, (_, b) =>
      `<a href="${href(b)}" class="seg-link ${b === current ? 'on' : ''}">${L[b]} kitapçığı</a>`).join('')}</div>`;
  }
  const keyCount = (key) => key.filter((k) => k != null).length;

  const fmtLabel = (key) => { const f = Layout.fmtOf(key); return `${f.label} · sayfada ${f.perPage}`; };

  // Sınavın optik formlarını PDF olarak hazırlar. Paylaşma, kullanıcı dokunuşu gerektirdiği için
  // PDF hazır olunca ayrı bir düğmeyle yapılır.
  async function makePDF(examId, studentIds) {
    const e = Store.getExam(examId), cls = Store.getClass(e.classId);
    const studs = Store.students(e.classId).filter((s) => !studentIds || studentIds.includes(s.id));
    if (!studs.length) return toast('Bu sınıfta öğrenci yok');
    const m = $('#modal');
    m.innerHTML = `<div class="sheet-modal"><h3>PDF hazırlanıyor…</h3><p class="muted" id="pdf-prog"></p></div>`;
    m.hidden = false;
    m.onclick = null;
    let blob;
    try {
      blob = await PDF.sheets(studs.map((student) => ({ student, exam: e, cls })), (i, n) => { $('#pdf-prog').textContent = `Sayfa ${i} / ${n}`; });
    } catch (err) {
      closeModal();
      return toast('PDF oluşturulamadı: ' + err.message);
    }
    const name = `${cls.name} - ${e.name} - optik.pdf`.replace(/[\\/:*?"<>|]/g, '_');
    const fmt = Layout.fmtOf(e.format);
    const pages = Math.ceil(studs.length / fmt.perPage);
    pdfReady(blob, name, `${studs.length} öğrenci · ${pages} sayfa A4 · ${fmtLabel(e.format)}${fmt.perPage > 1 ? '. Sayfaları kesik çizgilerden kesin.' : ''}`);
  }

  // Sınıftaki öğrencilerin veli kodlarını kesilip dağıtılacak kartlar olarak PDF'e döker (sayfada 16)
  async function makeCodesPDF(classId) {
    const cls = Store.getClass(classId);
    const studs = Store.students(classId);
    if (!studs.length) return toast('Bu sınıfta öğrenci yok');
    const m = $('#modal');
    m.innerHTML = `<div class="sheet-modal"><h3>PDF hazırlanıyor…</h3></div>`;
    m.hidden = false;
    m.onclick = null;
    let blob;
    try {
      blob = await PDF.parentCodes(cls, studs, PARENT_SITE);
    } catch (err) {
      closeModal();
      return toast('PDF oluşturulamadı: ' + err.message);
    }
    const name = `${cls.name} - veli kodları.pdf`.replace(/[\\/:*?"<>|]/g, '_');
    const missing = studs.filter((s) => !s.parentCode).length;
    pdfReady(blob, name, `${studs.length} öğrenci · ${Math.ceil(studs.length / 16)} sayfa A4 · sayfada 16 kart. Kartları kesik çizgilerden kesin.${missing ? ` ${missing} öğrencinin kodu henüz hazır değil.` : ''}`);
  }

  // PDF hazır penceresi. Paylaşma, kullanıcı dokunuşu gerektirdiği için ayrı bir düğmeyle yapılır.
  function pdfReady(blob, name, info) {
    const m = $('#modal');
    m.innerHTML = `<div class="sheet-modal"><h3>PDF hazır</h3>
      <p class="muted">${info}</p>
      <p class="small muted">Yazdırırken ölçeği <b>%100 / Gerçek boyut</b> seçin. Kâğıda sığdırma da sorun yaratmaz.</p>
      <div class="btns"><button class="btn" data-close>Kapat</button><button class="btn primary" data-share>Paylaş / Kaydet</button></div></div>`;
    m.querySelector('[data-close]').onclick = closeModal;
    m.querySelector('[data-share]').onclick = async () => {
      const file = new File([blob], name, { type: 'application/pdf' });
      // Telefonda paylaşım menüsü (Yazdır, Dosyalar'a kaydet…), bilgisayarda doğrudan indirme
      if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: name }); return; } catch (err) { if (err.name === 'AbortError') return; }
      }
      download(name, blob, 'application/pdf');
    };
  }

  // ---------- Sınıflar ----------
  function classesView() {
    setTop('Sınıflar', null, `<button class="btn small primary" data-act="new-class">+ Sınıf</button>`);
    const list = Store.classes();
    if (!list.length) {
      return `<div class="card empty"><p style="font-size:40px;margin:0">👥</p><p>Henüz sınıf yok.<br>Sınıf ekleyip öğrencileri girin; her öğrenciye özel optik form basılır.</p>
        <button class="btn primary" data-act="new-class">İlk sınıfı oluştur</button></div>`;
    }
    return `${installBanner()}<div class="collection-intro"><span class="eyebrow">SINIFLARIM</span><h2>Her sınıfın kendi rengi.</h2><p>${list.length} sınıf · ${list.reduce((n, c) => n + Store.students(c.id).length, 0)} öğrenci${list.length > 1 ? ' · Yerini değiştirmek için karta basılı tutup sürükleyin' : ''}</p></div><div class="class-grid" data-sortable>${list.map((c) => {
      const n = Store.students(c.id).length, ex = Store.exams(c.id).length;
      return `<a class="class-card" style="${classColor(c.id)}" href="#/class/${c.id}" data-class-id="${c.id}" draggable="false"><span class="class-card-icon" aria-hidden="true">${ICON_STUDENTS}</span><span class="class-card-label">SINIF</span><h3>${esc(c.name)}</h3><div class="class-card-footer"><span>${n} öğrenci <span class="meta-dot">·</span> ${ex} sınav</span><span aria-hidden="true">↗</span></div></a>`;
    }).join('')}</div>`;
  }

  // Sınıf kartlarını sıralama: karta basılı tutunca kart kalkar ve parmağı (fareyi) izler; üzerine
  // geldiği kartın yerine geçer, ötekiler kayarak yer açar. Bırakınca sıra kaydedilir ve buluta gider.
  (() => {
    const HOLD = 450, SLOP = 8, EDGE = 90;
    let press = null, drag = null;
    const cards = (grid) => [...grid.querySelectorAll('.class-card')];
    // Kartın kaydırma (transform) uygulanmamış yeri, ekran koordinatlarında
    const home = (el) => {
      const p = el.offsetParent, r = p.getBoundingClientRect();
      return { l: r.left + p.clientLeft + el.offsetLeft, t: r.top + p.clientTop + el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
    };
    // Kartlar yer değiştirirken eski yerlerinden yenisine kayarak geçsin
    function flip(els, change) {
      const was = els.map((el) => el.getBoundingClientRect());
      change();
      els.forEach((el, i) => {
        const now = el.getBoundingClientRect(), dx = was[i].left - now.left, dy = was[i].top - now.top;
        if (!dx && !dy) return;
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.getBoundingClientRect();
        el.style.transition = 'transform .22s ease';
        el.style.transform = '';
      });
    }

    function start() {
      const { card, x, y } = press;
      press = null;
      const h = home(card);
      drag = { card, grid: card.parentElement, gx: x - h.l, gy: y - h.t, x, y, before: cards(card.parentElement).map((c) => c.dataset.classId).join() };
      card.classList.add('dragging');
      card.style.transition = 'none';
      document.body.classList.add('sorting');
      navigator.vibrate?.(25);
      follow();
      drag.raf = requestAnimationFrame(tick);
    }
    function follow() {
      const { card, grid, x, y } = drag;
      if (!card.isConnected) return end();
      let h = home(card);
      const over = cards(grid).find((c) => {
        if (c === card) return false;
        const o = home(c);
        return x >= o.l && x <= o.l + o.w && y >= o.t && y <= o.t + o.h;
      });
      if (over) {
        const list = cards(grid), forward = list.indexOf(over) > list.indexOf(card);
        flip(list.filter((c) => c !== card), () => over[forward ? 'after' : 'before'](card));
        h = home(card);
      }
      card.style.transform = `translate(${x - drag.gx - h.l}px, ${y - drag.gy - h.t}px) scale(1.04)`;
    }
    // Parmak ekranın üst ya da alt kenarına gelince sayfa kendiliğinden kayar
    function tick() {
      if (!drag) return;
      const y = drag.y, v = y < EDGE ? -(EDGE - y) / 5 : y > innerHeight - EDGE ? (y - innerHeight + EDGE) / 5 : 0;
      if (v) { scrollBy(0, v); follow(); }
      if (drag) drag.raf = requestAnimationFrame(tick);
    }
    function end() {
      const { card, grid, before, raf } = drag;
      drag = null;
      cancelAnimationFrame(raf);
      document.body.classList.remove('sorting');
      card.classList.remove('dragging');
      card.style.transition = 'transform .2s ease';
      card.style.transform = '';
      setTimeout(() => (card.style.transition = ''), 250);
      // Bırakınca gelen tıklama sınıfı açmasın; tıklama gelmezse sonraki gerçek tıklamaya dokunma
      const eat = (e) => { e.preventDefault(); e.stopPropagation(); };
      addEventListener('click', eat, { capture: true, once: true });
      setTimeout(() => removeEventListener('click', eat, true), 400);
      if (!card.isConnected) return;
      const ids = cards(grid).map((c) => +c.dataset.classId);
      if (ids.join() !== before) Store.reorderClasses(ids);
    }

    view.addEventListener('pointerdown', (ev) => {
      const card = ev.target.closest('[data-sortable] .class-card');
      if (!card || ev.button !== 0 || drag) return;
      clearTimeout(press?.timer);
      press = { card, x: ev.clientX, y: ev.clientY, timer: setTimeout(start, HOLD) };
    });
    addEventListener('pointermove', (ev) => {
      if (drag) { drag.x = ev.clientX; drag.y = ev.clientY; follow(); }
      else if (press && Math.hypot(ev.clientX - press.x, ev.clientY - press.y) > SLOP) { clearTimeout(press.timer); press = null; }
    });
    const release = () => { if (press) { clearTimeout(press.timer); press = null; } if (drag) end(); };
    addEventListener('pointerup', release);
    addEventListener('pointercancel', release);
    // Sürüklerken sayfa kaymasın, uzun basınca bağlantı menüsü açılmasın
    addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });
    view.addEventListener('contextmenu', (e) => { if (press || drag) e.preventDefault(); });
  })();

  function classForm(c) {
    const isNew = !c;
    c = c || { name: '' };
    modal(isNew ? 'Yeni sınıf' : 'Sınıfı düzenle', `
      <label class="field"><span>Sınıf adı</span><input type="text" name="name" required value="${esc(c.name)}" placeholder="Örn. 8-A"></label>
      <p class="small muted">Soru sayısı, şık ve form boyutu her sınav için ayrı seçilir.</p>`,
    (fd) => {
      const saved = Store.saveClass({ id: c.id, name: fd.get('name').trim() });
      if (isNew) location.hash = `#/class/${saved.id}`;
      else render();
    });
  }

  function classView(id) {
    const c = Store.getClass(id);
    if (!c) return notFound();
    setTop(c.name, '#/classes', `<button class="btn small" data-act="edit-class" data-id="${id}">Düzenle</button>`);
    const studs = Store.students(id);
    const exams = Store.exams(id);
    const addCard = `<div class="card pad">
        <label class="field"><span>Her satıra bir öğrenci: <i>numara ad soyad</i> (numara isteğe bağlı; Excel'den yapıştırabilirsiniz)</span>
          <textarea id="bulk" placeholder="12 Ayşe Yılmaz&#10;15 Mehmet Demir&#10;Zeynep Kaya"></textarea></label>
        <button class="btn primary block" data-act="add-students" data-id="${id}">Öğrencileri ekle</button>
      </div>`;
    // Yeni sınıfta önce öğrenciler eklenir; öğrenci varsa sınavlar öne çıkar
    if (!studs.length) {
      return `
      <div class="card pad small" style="margin-bottom:12px">👋 <b>${esc(c.name)}</b> oluşturuldu. Önce öğrencileri ekleyin, sonra bu sınıf için istediğiniz kadar sınav oluşturabilirsiniz.</div>
      <h2>Öğrenci ekle</h2>
      ${addCard}
      <button class="btn danger block" style="margin-top:28px" data-act="del-class" data-id="${id}">Sınıfı sil</button>`;
    }
    // Sınavlar tarih rozetli kartlar, öğrenciler numara rozetli yoklama listesi: iki bölüm birbirine benzemesin
    const readCount = exams.reduce((t, e) => t + Store.results(e.id).length, 0);
    return `
      <div class="class-hero class-colored" style="${classColor(c.id)}">
        <div><span class="eyebrow">Sınıf</span><h2>${esc(c.name)}</h2></div>
        <div class="class-hero-stats"><div><b>${studs.length}</b><span>öğrenci</span></div><div><b>${exams.length}</b><span>sınav</span></div><div><b>${readCount}</b><span>okunan form</span></div></div>
      </div>

      <section class="class-section">
        <div class="section-title"><span class="section-ico exam-ico" aria-hidden="true">${ICON_EXAM}</span><h2>Sınavlar</h2>
          <button class="btn small primary" data-act="new-exam" data-class="${id}">+ Yeni sınav</button></div>
        ${exams.length ? `<div class="exam-tiles">${exams.map(examTile).join('')}</div>`
          : '<div class="card empty">Henüz sınav yok. <b>+ Yeni sınav</b> ile ilk sınavı oluşturun.</div>'}
      </section>

      <section class="class-section">
        <div class="section-title"><span class="section-ico student-ico" aria-hidden="true">${ICON_STUDENTS}</span><h2>Öğrenciler <span class="count">${studs.length}</span></h2></div>
        <p class="section-note">Velinin sonuçları görmek için <b>${PARENT_SITE}</b> adresine yazdığı kod öğrencinin yanında. Değiştirmek için ✎</p>
        <div class="roster">${studs.map((s) => `
          <div class="roster-row">
            <a class="roster-main" href="#/student/${s.id}"><span class="roster-no">${esc(s.number) || '–'}</span><span class="roster-name">${esc(s.name)}</span></a>
            <span class="code-chip" title="Veli kodu"><small>Veli kodu</small>${fmtCode(s.parentCode)}</span>
            <button class="roster-edit" data-act="edit-student" data-id="${s.id}" aria-label="${esc(s.name)} düzenle">${ICON_EDIT}</button>
          </div>`).join('')}</div>
        <button class="btn small codes-print" data-act="codes-pdf" data-id="${id}">🖨 Veli kodlarını çıktı al</button>
        <details class="add-more"><summary class="btn block">+ Öğrenci ekle</summary>${addCard}</details>
      </section>
      <button class="btn danger block" style="margin-top:36px" data-act="del-class" data-id="${id}">Sınıfı sil</button>`;
  }

  const ICON_EXAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4V2.5h6V4M9 10h6m-6 4h6m-6 4h3"/></svg>';
  const ICON_STUDENTS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4.5V20"/></svg>';
  const ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>';

  // Sınıf sayfasındaki sınav kartı: tarih rozeti, okunma ilerlemesi, ortalama
  function examTile(e) {
    const res = Store.results(e.id);
    const total = Store.roster(e).length;
    const keyed = !Store.keyEmpty(e);
    const avg = res.length ? res.reduce((s, r) => s + Store.mainScore(e, Store.scoreResult(e, r)), 0) / res.length : null;
    const d = e.date ? new Date(e.date + 'T00:00') : null;
    return `<a class="exam-tile class-colored" style="${classColor(e.classId)}" href="#/exam/${e.id}">
      <span class="date-badge">${d ? `<b>${d.getDate()}</b><span>${d.toLocaleDateString('tr-TR', { month: 'short' })}</span>` : '<b>–</b>'}</span>
      <span class="exam-tile-body"><span class="exam-tile-name">${esc(e.name)}</span>
        <span class="progress" aria-hidden="true"><i style="width:${total ? Math.round(res.length / total * 100) : 0}%"></i></span>
        <span class="exam-tile-meta">${res.length}/${total} okundu${avg != null ? ` · ort. ${fmt(avg, 1)} ${Store.mainLabel(e).toLocaleLowerCase('tr-TR')}` : ''}${keyed ? '' : ' · <span class="pill warn">Anahtar yok</span>'}${Papers.has(e.id) ? ' · <span class="paper-flag">Kâğıt ekli</span>' : ''}</span></span>
      <span class="chev"></span></a>`;
  }

  function addStudents(classId) {
    const lines = $('#bulk').value.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return toast('Önce öğrenci adlarını yazın');
    let n = 0;
    for (let line of lines) {
      // Eski listelerde sonda telefon olabilir ("12 Ayşe Yılmaz 0532 123 45 67"); ada karışmasın diye atılır
      const tokens = line.split(/[\s,;]+/);
      let k = tokens.length;
      while (k > 1 && /^[+(]?[\d().-]+$/.test(tokens[k - 1])) k--;
      if (tokens.slice(k).join('').replace(/\D/g, '').length >= 10) line = tokens.slice(0, k).join(' ');
      const m = line.match(/^(\d+)[\s.,;:\-)]+(.+)$/);
      const [number, name] = m ? [m[1], m[2].trim()] : ['', line];
      try { Store.addStudent(classId, name, number); n++; } catch (e) { toast(e.message); break; }
    }
    toast(`${n} öğrenci eklendi. Şimdi bu sınıfa sınav oluşturabilirsiniz.`);
    render();
  }

  function studentForm(id) {
    const s = Store.getStudent(id);
    const form = modal('Öğrenciyi düzenle', `
      <label class="field"><span>Ad soyad</span><input type="text" name="name" required value="${esc(s.name)}"></label>
      <label class="field"><span>Numara</span><input type="text" name="number" value="${esc(s.number)}" inputmode="numeric"></label>
      <div class="code-box"><div><span>Veli kodu</span><b>${fmtCode(s.parentCode)}</b><small>Veli bu kodu ${PARENT_SITE} adresine yazarak sınav sonuçlarını görür</small></div>
        <button type="button" class="btn small" data-newcode ${s.parentCode ? '' : 'disabled'}>Kodu değiştir</button></div>
      <p class="small muted">Optik kodu: #${s.id} (değişmez, basılmış formlar geçerli kalır)</p>
      <button type="button" class="btn danger block" data-del>Öğrenciyi sil</button>`,
    (fd) => {
      Store.updateStudent(id, { name: fd.get('name').trim(), number: fd.get('number').trim() });
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
    });
    form.querySelector('[data-del]').onclick = () => confirmBox('Öğrenci silinsin mi?', `${esc(s.name)} ve tüm sınav sonuçları silinecek.`, 'Sil', () => { Store.deleteStudent(id); render(); });
    form.querySelector('[data-newcode]').onclick = () => confirmBox('Veli kodu değiştirilsin mi?',
      `${esc(s.name)} için yeni bir kod oluşturulacak. Eski kod (<b>${fmtCode(s.parentCode)}</b>) hemen geçersiz olur; veli sonuçları yalnızca yeni kodla görebilir. Onaylıyor musunuz?`,
      'Evet, değiştir', () => {
        const code = Store.newParentCode(new Set([s.parentCode]));
        Store.updateStudent(id, { parentCode: code });
        render(true);
        toast(`Yeni veli kodu: ${fmtCode(code)}`);
        // confirmBox kapanınca öğrenci penceresi yeni kodla yeniden açılır
        setTimeout(() => studentForm(id));
      });
  }

  // ---------- Sınavlar ----------
  // Sınıfın eklenme sırasını kullan: sınav sırası, filtreler ve sınıfların yer değiştirmesi renkleri değiştirmez.
  function classColor(id) {
    const palette = [['#246b66', '#86d8c5'], ['#6654b0', '#bcaaff'], ['#286ba5', '#8ec9ff'], ['#a15d20', '#f0bc7c'], ['#ac4e70', '#f2a4c3'], ['#597529', '#c1d990']];
    const index = Store.classIndex(id);
    const [light, dark] = palette[Math.max(0, index) % palette.length];
    return `--class-light:${light};--class-dark:${dark}`;
  }
  let examClassFilter = '', examSearch = '';
  function filteredExams() {
    const query = examSearch.trim().toLocaleLowerCase('tr-TR');
    return Store.exams().filter(e => (!examClassFilter || String(e.classId) === examClassFilter) &&
      `${e.name} ${Store.getClass(e.classId)?.name || ''}`.toLocaleLowerCase('tr-TR').includes(query));
  }
  function examResultsHTML() {
    const list = filteredExams();
    return list.length ? list.map(examRow).join('') : '<div class="card empty">Bu aramaya uygun sınav bulunamadı.<br><button class="btn" data-reset-exams>Filtreleri temizle</button></div>';
  }
  function updateExamResults() {
    $('#exam-results').innerHTML = examResultsHTML();
    $('#exam-result-count').textContent = `${filteredExams().length} sınav`;
    view.querySelectorAll('[data-exam-class]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.examClass === examClassFilter)));
  }
  function examRow(e) {
    const c = Store.getClass(e.classId);
    const res = Store.results(e.id);
    const keyed = !Store.keyEmpty(e);
    const total = Store.roster(e).length;
    const percent = total ? Math.min(100, Math.round(res.length / total * 100)) : 0;
    const status = !keyed ? 'Anahtar eksik' : !res.length ? 'Okumaya hazır' : res.length >= total ? 'Tamamlandı' : 'Okuma sürüyor';
    return `<a class="exam-card" style="${classColor(e.classId)}" href="#/exam/${e.id}">
      <div class="exam-card-top"><span class="class-badge">${esc(c?.name || 'Sınıf silinmiş')}</span><span class="exam-date">${fmtDate(e.date)}</span><span class="exam-card-arrow" aria-hidden="true">↗</span></div>
      <h3>${esc(e.name)}</h3><div class="exam-card-detail"><span>${e.questionCount} soru</span><span> ${Store.bookletCount(e) > 1 ? Store.bookletCount(e) + ' kitapçık' : 'Tek kitapçık'}</span>${Papers.has(e.id) ? '<span class="paper-flag">Kâğıt ekli</span>' : ''}</div>
      <div class="exam-card-bottom"><span class="exam-status ${keyed ? '' : 'needs-key'}">${status}</span><span><b>${res.length}</b><span class="read-divider">/</span>${total} okundu</span></div>
      <span class="exam-progress" aria-hidden="true"><i style="width:${percent}%"></i></span></a>`;
  }

  function examsView() {
    setTop('Sınavlar', null, Store.classes().length ? `<button class="btn small primary" data-act="new-exam">+ Sınav</button>` : '');
    if (!Store.classes().length) return `<div class="card empty">Sınav oluşturmak için önce bir sınıf ekleyin.<br><br><a class="btn primary" href="#/classes">Sınıflara git</a></div>`;
    const list = Store.exams();
    if (!list.length) return `<div class="card empty"><p style="font-size:40px;margin:0">📝</p><p>Henüz sınav yok.</p><button class="btn primary" data-act="new-exam">Sınav oluştur</button></div>`;
    if (examClassFilter && !Store.getClass(+examClassFilter)) examClassFilter = '';
    const read = list.reduce((n, e) => n + Store.results(e.id).length, 0);
    return `<div class="exam-editorial"><div><span class="eyebrow">ÖLÇME & DEĞERLENDİRME</span><h2>Sınav defteri<span>.</span></h2><p>Her değerlendirme, yeni bir adım.</p></div><div class="exam-links"><a class="exam-insight-link" href="#/analytics" aria-label="İstatistikleri aç"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 20h16M7 16v-5m5 5V4m5 12V8" stroke-linecap="round"/></svg><span>Analizler ↗</span></a><a class="exam-insight-link" href="#/papers" aria-label="Sınav kâğıtlarını aç"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg><span>Kâğıtlar ↗</span></a></div></div>
      <div class="exam-overview"><span><b>${list.length}</b> sınav</span><span><b>${Store.classes().length}</b> sınıf</span><span><b>${read}</b> okunan form</span></div>
      <div class="exam-tools"><label class="exam-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="exam-search" type="search" aria-label="Sınav veya sınıf ara" placeholder="Sınav veya sınıf ara…" value="${esc(examSearch)}"></label>
      <div class="class-filters" role="group" aria-label="Sınıfa göre filtrele"><button data-exam-class="" aria-pressed="${!examClassFilter}">Tüm sınıflar <span>${list.length}</span></button>${Store.classes().map(c => `<button style="${classColor(c.id)}" data-exam-class="${c.id}" aria-pressed="${examClassFilter === String(c.id)}"><i aria-hidden="true"></i>${esc(c.name)}<span>${Store.exams(c.id).length}</span></button>`).join('')}</div></div>
      <div class="collection-count"><span id="exam-result-count" role="status">${filteredExams().length} sınav</span><span>En yeni önce</span></div><div class="exam-grid" id="exam-results">${examResultsHTML()}</div>`;
  }

  function examForm(e, classId) {
    const isNew = !e;
    const classes = Store.classes();
    e = e || { name: '', classId: classId || classes[0].id, date: today(), penalty: 0, questionCount: 20, optionCount: 5, format: 'a6' };
    const hasResults = !isNew && Store.results(e.id).length > 0;
    const F = Layout.FORMATS;
    const form = modal(isNew ? 'Yeni sınav' : 'Sınavı düzenle', `
      <label class="field"><span>Sınav adı (formun üstüne yazılır)</span><input type="text" name="name" required value="${esc(e.name)}" placeholder="Örn. Matematik Testi 3"></label>
      <div class="row"><label class="field grow"><span>Sınıf</span><select name="classId" ${isNew ? '' : 'disabled'}>${classes.map((c) => `<option value="${c.id}" ${c.id === e.classId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label class="field grow"><span>Tarih</span><input type="date" name="date" value="${e.date || today()}"></label></div>
      <div class="row"><label class="field grow"><span>Soru sayısı</span><input type="number" name="q" min="1" max="${F.a4.maxQ}" value="${e.questionCount}" required inputmode="numeric"></label>
        <label class="field grow"><span>Şık</span>${seg('k', e.optionCount, [[4, 'A–D'], [5, 'A–E']])}</label></div>
      <label class="field"><span>Form boyutu</span>${seg('format', e.format, Object.values(F).map((f) => [f.key, `${f.label} · ${f.perPage}'li`]))}</label>
      <label class="field"><span>Kitapçık</span>${seg('booklets', e.booklets || 1, [[1, 'Yok'], [2, 'A–B'], [3, 'A–C'], [4, 'A–D']])}</label>
      <label class="field"><span>Sonuç</span>${seg('scoring', e.scoring || 'net', [['net', 'Net'], ['puan', '100 üzerinden puan']])}</label>
      <p class="small muted" id="fmt-hint"></p>
      <label class="field"><span>Yanlışlar doğruyu götürsün mü?</span>${seg('penalty', e.penalty || 0, [[0, 'Hayır'], [4, '4Y = 1D'], [3, '3Y = 1D']])}</label>
      ${hasResults ? '<p class="small muted">⚠️ Bu sınavın okutulmuş sonuçları var. Soru sayısını, şıkkı, form boyutunu veya kitapçık sayısını değiştirirseniz basılmış formlar artık doğru okunmaz.</p>' : ''}`,
    (fd) => {
      const fmt = Layout.fmtOf(fd.get('format'));
      const q = parseInt(fd.get('q'), 10) || 0;
      if (q < 1 || q > fmt.maxQ) { toast(`${fmt.label} form en çok ${fmt.maxQ} soru alır`); return false; }
      const k = +fd.get('k'), nb = +fd.get('booklets') || 1;
      // Anahtarları yeni soru ve şık sayısına uydur
      const fit = (key) => Array.from({ length: q }, (_, i) => { const a = key?.[i]; return a != null && a < k ? a : null; });
      const saved = Store.saveExam({
        id: e.id, name: fd.get('name').trim(), classId: isNew ? +fd.get('classId') : e.classId, date: fd.get('date'),
        questionCount: q, optionCount: k, format: fmt.key, penalty: +fd.get('penalty'), booklets: nb, scoring: fd.get('scoring'),
        points: e.points ? e.points.slice(0, q) : undefined,
        topics: e.topics ? e.topics.filter((t) => t.from <= q).map((t) => ({ ...t, to: Math.min(t.to, q) })) : undefined,
        key: fit(e.key), extraKeys: Array.from({ length: nb - 1 }, (_, b) => fit(e.extraKeys?.[b])),
      });
      if (isNew) location.hash = `#/exam/${saved.id}`;
      else render();
    });
    // Soru sayısı seçilen boyuta sığmıyorsa sığan en küçük boyuta geç
    const hint = () => {
      const q = parseInt(form.elements.q.value, 10) || 0;
      let fmt = Layout.fmtOf(form.elements.format.value);
      if (q > fmt.maxQ) {
        const fit = Object.values(F).filter((f) => f.maxQ >= q).sort((a, b) => b.perPage - a.perPage)[0];
        if (fit) {
          fmt = fit;
          form.elements.format.value = fit.key;
          form.querySelectorAll('.seg[data-name=format] button').forEach((b) => b.classList.toggle('on', b.dataset.v === fit.key));
        }
      }
      const n = Store.students(isNew ? +form.elements.classId.value : e.classId).length;
      $('#fmt-hint').textContent = `A6 en çok ${F.a6.maxQ}, A5 en çok ${F.a5.maxQ}, A4 en çok ${F.a4.maxQ} soru alır. `
        + (n ? `${n} öğrenci için ${Math.ceil(n / fmt.perPage)} sayfa A4 kâğıt gerekir.` : '');
    };
    form.elements.q.addEventListener('input', hint);
    form.elements.classId.addEventListener('change', hint);
    form.querySelector('.seg[data-name=format]').addEventListener('click', () => setTimeout(hint));
    hint();
  }

  // Aynı sınavı (ayarlar, cevap anahtarı, puanlar, konular) başka sınıflara kopyalar; sınav kâğıdı
  // bağlıysa yeni sınavlara da bağlanır. Aynı kademedeki sınıflar (5A → 5B, 5C) seçili gelir.
  function copyExamForm(id) {
    const e = Store.getExam(id);
    const gradeOf = (c) => c.name.match(/^\s*(\d+)/)?.[1] || '';
    const grade = gradeOf(Store.getClass(e.classId));
    const same = (c) => Store.exams(c.id).some((x) => x.name.trim().toLocaleLowerCase('tr-TR') === e.name.trim().toLocaleLowerCase('tr-TR'));
    const others = Store.classes().filter((c) => c.id !== e.classId);
    if (!others.length) return toast('Kopyalamak için önce başka bir sınıf ekleyin');
    modal('Diğer sınıflara kopyala', `
      <p class="small muted" style="margin-top:0"><b>${esc(e.name)}</b> seçtiğiniz sınıflar için de oluşturulur: soru sayısı, şıklar, form, cevap anahtarı, puanlar ve konular aynen kopyalanır.</p>
      <div class="paper-exam-list">${others.map((c) => { const dup = same(c); return `<label class="paper-exam" style="${classColor(c.id)}">
        <input type="checkbox" name="cls" value="${c.id}" ${grade && gradeOf(c) === grade && !dup ? 'checked' : ''}><span class="paper-exam-class">${esc(c.name)}</span>
        <span class="grow"><b>${Store.students(c.id).length} öğrenci</b>${dup ? '<small>Bu adla bir sınavı zaten var</small>' : ''}</span></label>`; }).join('')}</div>`,
    (fd) => {
      const ids = fd.getAll('cls').map(Number);
      if (!ids.length) { toast('En az bir sınıf seçin'); return false; }
      const { id: _, classId: __, absent: ___, ...fields } = JSON.parse(JSON.stringify(e));
      const copies = ids.map((classId) => Store.saveExam({ ...JSON.parse(JSON.stringify(fields)), classId }));
      for (const p of Store.examPapers(e.id)) Store.savePaper({ id: p.id, examIds: [...p.examIds, ...copies.map((x) => x.id)] });
      toast(`${ids.map((c) => Store.getClass(c).name).join(', ')} için sınav oluşturuldu`);
      render();
    }, 'Kopyala');
  }

  function examStats(exam) {
    const rows = Store.results(exam.id).map((r) => { const s = Store.scoreResult(exam, r); return { r, s, m: Store.mainScore(exam, s), st: Store.getStudent(r.studentId) }; }).filter((x) => x.st);
    rows.sort((a, b) => b.m - a.m || a.st.name.localeCompare(b.st.name, 'tr'));
    const nets = rows.map((x) => x.m);
    const avg = nets.length ? nets.reduce((a, b) => a + b, 0) / nets.length : 0;
    return { rows, avg, max: nets.length ? Math.max(...nets) : 0, min: nets.length ? Math.min(...nets) : 0 };
  }

  function examView(id) {
    const e = Store.getExam(id);
    if (!e) return notFound();
    const c = Store.getClass(e.classId);
    setTop(e.name, '#/exams', `<button class="btn small" data-act="edit-exam" data-id="${id}">Düzenle</button>`);
    const nb = Store.bookletCount(e);
    const counts = Array.from({ length: nb }, (_, b) => keyCount(Store.keyFor(e, b)));
    const keyDone = counts.every((n) => n === e.questionCount), keyAny = counts.some((n) => n > 0);
    const st = examStats(e);
    const all = Store.students(e.classId);
    const done = new Set(st.rows.map((x) => x.st.id));
    const missing = all.filter((s) => !done.has(s.id) && !Store.isAbsent(e, s.id));
    const absent = all.filter((s) => !done.has(s.id) && Store.isAbsent(e, s.id));
    const lbl = Store.mainLabel(e);
    const toCheck = st.rows.filter((x) => x.r.uncertain?.length);
    return `
      <div class="small muted" style="margin:0 4px 10px">${esc(c.name)} · ${fmtDate(e.date)} · ${e.questionCount} soru · ${e.optionCount} şık · ${fmtLabel(e.format)}${e.penalty ? ` · ${e.penalty} yanlış 1 doğruyu götürür` : ''}${Store.usesPoints(e) ? ' · 100 üzerinden puan' : ''}</div>
      <button class="btn primary big" data-act="scan" data-id="${id}">📷 Optik okut</button>
      <button class="btn block" style="margin-top:10px" data-act="pdf" data-id="${id}" ${all.length ? '' : 'disabled'}>📄 Optik formları PDF olarak al (${all.length} öğrenci)</button>
      <button class="btn block" style="margin-top:10px" data-act="copy-exam" data-id="${id}">⧉ Diğer sınıflara kopyala</button>
      <a class="card pad row" href="#/exam/${id}/key" style="margin-top:12px;color:inherit">
        <div class="grow"><b>Cevap anahtarı${nb > 1 ? 'ları' : ''}</b><div class="small muted">${nb > 1
          ? counts.map((n, b) => `${L[b]}: ${n}/${e.questionCount}`).join(' · ')
          : keyDone ? 'Tüm sorular girildi' : `${counts[0]}/${e.questionCount} soru girildi`}</div></div>
        ${keyDone ? '<span class="pill ok">Hazır</span>' : keyAny ? '<span class="pill warn">Eksik</span>' : '<span class="pill warn">Girilmedi</span>'}<span class="chev muted">›</span></a>
      ${Papers.examSection(e)}

      <h2>Özet</h2>
      <div class="stats">
        <div class="stat"><b>${st.rows.length}<small class="muted" style="font-size:13px">/${all.length - absent.length}</small></b><span>Okunan</span></div>
        <div class="stat"><b>${fmt(st.avg)}</b><span>Ort. ${lbl.toLocaleLowerCase('tr-TR')}</span></div>
        <div class="stat"><b>${fmt(st.max)}</b><span>En yüksek</span></div>
        <div class="stat"><b>${fmt(st.min)}</b><span>En düşük</span></div>
      </div>
      ${st.rows.length ? `<div class="btns"><a class="btn" href="#/exam/${id}/stats">📊 Sınav analizi</a><button class="btn" data-act="csv" data-id="${id}">⬇︎ Excel (CSV)</button></div>
        <a class="btn block" style="margin-top:10px" href="#/exam/${id}/send">📨 Sonuçları velilere gönder${(() => { const n = st.rows.filter((x) => x.r.sentAt).length; return n ? ` (${n}/${st.rows.length} gönderildi)` : ''; })()}</a>` : ''}

      ${toCheck.length ? `<div class="card pad small" style="margin-top:12px;border:1.5px solid var(--warn)">⚠ <b>${toCheck.length} öğrencide</b> okuyucunun emin olamadığı işaret var. Satırlardaki ⚠ işaretine dokunup kontrol edin.</div>` : ''}
      <h2>Sonuçlar</h2>
      <div class="card">${st.rows.length ? `<table class="tbl"><thead><tr><th>#</th><th class="l">Öğrenci</th><th>D</th><th>Y</th><th>B</th><th>Net</th><th>${Store.usesPoints(e) ? 'Puan' : '%'}</th></tr></thead><tbody>
        ${st.rows.map((x, i) => `<tr data-go="#/result/${id}/${x.st.id}"><td class="muted">${i + 1}</td><td class="l">${x.r.uncertain?.length ? '<span title="Kontrol edilecek soru var" style="color:var(--warn)">⚠</span> ' : ''}${x.r.manual ? '<span title="Elle girildi">✍️</span> ' : ''}${esc(x.st.name)}</td><td style="color:var(--ok)">${x.s.correct}</td><td style="color:var(--bad)">${x.s.wrong}</td><td class="muted">${x.s.blank}</td><td>${Store.usesPoints(e) ? fmt(x.s.net) : `<b>${fmt(x.s.net)}</b>`}</td><td class="${Store.usesPoints(e) ? '' : 'muted'}">${Store.usesPoints(e) ? `<b>${fmt(x.s.points, 1)}</b>` : fmt(x.s.pct, 1)}</td></tr>`).join('')}
        </tbody></table>` : '<div class="empty">Henüz okutulan optik yok</div>'}</div>
      ${missing.length ? `<h2>Okutulmayanlar (${missing.length})</h2><div class="card pad small"><p class="muted" style="margin:0 0 8px">Formu okunamayan öğrencinin cevaplarını elle girmek için adına dokunun. Sınava hiç girmeyecek öğrenciyi “Girmeyecek” ile ayırın; ortalamaya katılmaz, bu listede beklemez.</p>
        <div class="chips">${missing.map((s) => `<span class="chip absent-chip"><a href="#/result/${id}/${s.id}">✍️ ${esc(s.name)}</a><button data-act="absent" data-id="${id}" data-s="${s.id}" data-on="1">Girmeyecek</button></span>`).join('')}</div></div>` : ''}
      ${absent.length ? `<h2>Sınava girmeyecekler (${absent.length})</h2><div class="card pad small"><p class="muted" style="margin:0 0 8px">Ortalamaya ve okuma oranına katılmazlar. Formu okutulursa bu listeden kendiliğinden çıkar.</p>
        <div class="chips">${absent.map((s) => `<span class="chip absent-chip"><span>${esc(s.name)}</span><button data-act="absent" data-id="${id}" data-s="${s.id}">↩ Geri al</button></span>`).join('')}</div></div>` : ''}
      <button class="btn danger block" style="margin-top:28px" data-act="del-exam" data-id="${id}">Sınavı sil</button>`;
  }

  // ---------- Cevap anahtarı ----------
  function keyView(id, bk = 0) {
    const e = Store.getExam(id);
    if (!e) return notFound();
    const c = Store.getClass(e.classId);
    setTop('Cevap anahtarı', `#/exam/${id}`);
    const k = e.optionCount;
    if (bk >= Store.bookletCount(e)) bk = 0;
    const key = Store.keyFor(e, bk);
    return `
      ${bookletTabs(e, bk, (b) => `#/exam/${id}/key/${b}`)}
      <div class="card pad">
        <div class="small muted" style="margin-bottom:8px">${esc(e.name)} · ${e.questionCount} soru · harfe dokunarak işaretleyin; tekrar dokunmak siler. Boş bırakılan soru iptal sayılır.</div>
        <div class="row"><input type="text" id="key-text" class="grow" placeholder="Hızlı giriş: ABCDA BDCE…" autocapitalize="characters" autocomplete="off" style="flex:1;min-width:0;text-transform:uppercase">
          <button class="btn" data-act="key-text" data-id="${id}" data-b="${bk}">Uygula</button></div>
        <button class="btn block" style="margin-top:10px" data-act="scan-key" data-id="${id}">📷 Anahtarı doldurulmuş bir optikten okut</button>
      </div>
      <div class="card pad" style="margin-top:12px"><div class="qgrid" id="keygrid">
        ${key.map((a, i) => `<div class="qrow"><span class="qn">${i + 1}</span>${Array.from({ length: k }, (_, j) =>
          `<button class="opt ${a === j ? 'on' : ''}" data-act="key-set" data-id="${id}" data-b="${bk}" data-q="${i}" data-o="${j}">${L[j]}</button>`).join('')}</div>`).join('')}
      </div></div>
      ${Store.bookletCount(e) > 1 && bk < Store.bookletCount(e) - 1
        ? `<a class="btn primary block" style="margin-top:14px" href="#/exam/${id}/key/${bk + 1}">Sonraki: ${L[bk + 1]} kitapçığı ›</a>`
        : `<a class="btn primary block" style="margin-top:14px" href="#/exam/${id}">Tamam</a>`}
      <h2>Konular ve soru puanları (isteğe bağlı)</h2>
      <div class="card pad">
        ${Topics.editor(e)}
        ${Store.usesPoints(e) ? `<label class="field"><span>Soru puanları — boş bırakırsanız hepsi eşit. Örn. <i>1-10 4</i> ve <i>11-20 6</i></span>
          <textarea id="points" placeholder="1-10 4&#10;11-20 6" style="min-height:70px">${esc(pointsText(e))}</textarea></label>`
          : '<p class="small muted">Sorulara farklı puan vermek için sınav ayarlarında Sonuç: "100 üzerinden puan" seçin.</p>'}
        <button class="btn block" data-act="save-meta" data-id="${id}">Kaydet</button>
      </div>`;
  }

  // "1-5 Kesirler" satırları ↔ [{name, from, to}]
  function parseRanges(text, q, needName) {
    const out = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const m = line.match(/^(\d+)\s*(?:[-–—]\s*(\d+))?\s*[:.)]?\s*(.+)$/);
      if (!m) throw new Error(`Anlaşılamadı: "${line}" (örnek: 1-5 Kesirler)`);
      const from = +m[1], to = m[2] ? +m[2] : from;
      if (from < 1 || to < from || to > q) throw new Error(`Soru aralığı geçersiz: "${line}" (1–${q})`);
      out.push({ from, to, name: m[3].trim() });
    }
    return out;
  }
  function pointsText(e) {
    if (!e.points) return '';
    const lines = [];
    let start = 0;
    for (let i = 1; i <= e.questionCount; i++) {
      if (i === e.questionCount || e.points[i] !== e.points[start]) {
        lines.push(`${start + 1 === i ? start + 1 : start + 1 + '-' + i} ${fmt(e.points[start] ?? 1)}`);
        start = i;
      }
    }
    return lines.join('\n');
  }
  function saveMeta(id) {
    const e = Store.getExam(id);
    try {
      const topics = Topics.readEditor(e);
      let points = e.points;
      const pEl = $('#points');
      if (pEl) {
        const ranges = parseRanges(pEl.value, e.questionCount);
        if (ranges.length) {
          const pts = Array(e.questionCount).fill(null);
          for (const r of ranges) {
            const v = parseFloat(r.name.replace(',', '.'));
            if (!(v >= 0)) throw new Error(`Puan sayı olmalı: "${r.from}-${r.to} ${r.name}"`);
            for (let i = r.from - 1; i < r.to; i++) pts[i] = v;
          }
          if (pts.some((v) => v == null)) throw new Error('Puanı yazılmayan sorular var; tüm soruları kapsayan aralıklar yazın.');
          points = pts;
        } else points = undefined;
      }
      e.topics = topics;
      if (points) e.points = points; else delete e.points;
    } catch (err) { return toast(err.message); }
    Store.saveExam(e);
    Topics.saved(id);
    const total = e.points ? e.points.reduce((a, b) => a + b, 0) : null;
    toast(`Kaydedildi${e.topics.length ? ` · ${e.topics.length} konu` : ''}${total != null ? ` · toplam ${fmt(total)} puan${total !== 100 ? ' (100 üzerinden oranlanır)' : ''}` : ''}`);
    render(true);
  }

  // Öğrencinin cevaplarını harf dizisiyle girer: A–E, '-' ya da '.' boş, '*' çift işaret; boşluklar yok sayılır
  function applyAnswerText(examId, studentId) {
    const e = Store.getExam(examId), r = Store.getResult(examId, studentId);
    const letters = $('#ans-text').value.toLocaleUpperCase('tr-TR').replace(/[^A-E_\-*.]/g, '');
    if (!letters) return toast('Harfleri yazın, örn. ADABB-DC');
    const answers = r ? r.answers.slice(0, e.questionCount) : [];
    while (answers.length < e.questionCount) answers.push(null);
    const n = Math.min(letters.length, e.questionCount);
    [...letters].slice(0, n).forEach((ch, i) => {
      const j = L.indexOf(ch);
      answers[i] = ch === '*' ? -1 : j >= 0 && j < e.optionCount ? j : null;
    });
    Store.saveResult(examId, studentId, answers, r ? r.booklet ?? null : null, (r?.uncertain || []).filter((i) => i >= n), !r || !!r.manual);
    toast(`${n} soru girildi${letters.length > e.questionCount ? ` (fazla ${letters.length - e.questionCount} harf yok sayıldı)` : ''}`);
    render(true);
  }

  function applyKeyText(id, bk) {
    const e = Store.getExam(id);
    const key = Store.keyFor(e, bk).slice();
    const k = e.optionCount;
    const letters = $('#key-text').value.toLocaleUpperCase('tr-TR').replace(/[^A-E_\-*.]/g, '');
    if (!letters) return toast('Harfleri yazın, örn. ABCDA');
    [...letters].slice(0, e.questionCount).forEach((ch, i) => {
      const j = L.indexOf(ch);
      key[i] = j >= 0 && j < k ? j : null;
    });
    Store.setKey(e, bk, key);
    Store.saveExam(e);
    toast(`${Math.min(letters.length, e.questionCount)} soru girildi`);
    render();
  }

  // ---------- Sonuç detayı (elle düzeltme) ----------
  function resultView(examId, studentId) {
    const e = Store.getExam(examId), s = Store.getStudent(studentId);
    if (!e || !s) return notFound();
    const r = Store.getResult(examId, studentId);
    const k = e.optionCount;
    setTop(s.name, `#/exam/${examId}`);
    const answers = r ? r.answers : Array(e.questionCount).fill(null);
    const nb = Store.bookletCount(e);
    const bk = Store.bookletOf(e, r);
    const sc = Store.score(e, answers, bk);
    const keyArr = Store.keyFor(e, bk);
    const unsure = new Set(r?.uncertain || []);
    const topics = r ? Store.topicScores(e, r) : null;
    const bkNote = nb < 2 || !r ? '' : r.booklet >= 0 && r.booklet != null ? ''
      : `<p class="small" style="color:var(--bad);margin:8px 0 0">Öğrenci kitapçığı ${r.booklet === -1 ? 'iki kez işaretlemiş' : 'işaretlememiş'}; A kitapçığı sayıldı. Doğrusunu seçin:</p>`;
    return `
      <div class="result-identity"><span class="student-avatar" aria-hidden="true">${esc(s.name.split(/\s+/).map((x) => x[0]).slice(0, 2).join(''))}</span><div><span class="eyebrow">Öğrenci sonuç raporu</span><h2>${esc(s.name)}</h2><p>${esc(e.name)} · ${fmtDate(e.date)}</p></div></div>
      <div class="analysis-hero result-score"><div><span class="eyebrow">${Store.mainLabel(e)} sonucu</span><div class="hero-value">${fmt(Store.mainScore(e, sc), 1)}<small>/ ${Store.usesPoints(e) ? 100 : sc.counted}</small></div><p class="hero-caption">${!r ? 'Henüz okutulmadı · cevapları aşağıdan elle girebilirsiniz' : r.manual ? 'Elle girildi' : 'Optik form değerlendirildi'}</p></div><div class="hero-aside"><b>%${fmt(sc.pct, 1)}</b><span>Net başarı oranı</span><div class="hero-meter"><i style="width:${Math.max(0, Math.min(100, sc.pct))}%"></i></div></div></div>
      <div class="stats">
        <div class="stat"><b style="color:var(--ok)">${sc.correct}</b><span>Doğru</span></div>
        <div class="stat"><b style="color:var(--bad)">${sc.wrong}</b><span>Yanlış</span></div>
        <div class="stat"><b>${sc.blank}</b><span>Boş</span></div>
        <div class="stat"><b>${fmt(Store.mainScore(e, sc))}</b><span>${Store.usesPoints(e) ? `Puan · ${fmt(sc.net)} net` : `Net · %${fmt(sc.pct, 1)}`}</span></div>
      </div>
      ${unsure.size ? `<div class="card pad small" style="margin-top:12px;border:1.5px solid var(--warn)">⚠ Okuyucu <b>${[...unsure].map((i) => i + 1).join(', ')}</b> numaralı ${unsure.size > 1 ? 'sorulardaki' : 'sorudaki'} işaretten emin olamadı (sarı çerçeveli). Kâğıda bakıp gerekiyorsa düzeltin.
        <button class="btn small block" style="margin-top:8px" data-act="checked" data-e="${examId}" data-s="${studentId}">✓ Kontrol ettim, doğru</button></div>` : ''}
      ${topics && topics.length ? `<h2>Konular</h2><div class="card list">${topics.map((t) => topicRow(t.name, t.total ? t.correct / t.total : null, `${t.correct}/${t.total}`)).join('')}</div>` : ''}
      ${nb > 1 ? `<h2>Kitapçık</h2><div class="card pad">${bkNote ? bkNote.replace('margin:8px 0 0', 'margin:0 0 8px') : ''}<div class="seg">${Array.from({ length: nb }, (_, b) =>
        `<button class="${r && b === bk && r.booklet >= 0 && r.booklet != null ? 'on' : ''}" data-act="set-booklet" data-e="${examId}" data-s="${studentId}" data-b="${b}">${L[b]}</button>`).join('')}</div></div>` : ''}
      <h2>Cevaplar</h2>
      <div class="card pad"><div class="small muted" style="margin-bottom:6px">${r && !r.manual ? 'Okuma hatası varsa harfe dokunarak düzeltin.' : 'Öğrencinin işaretlediği harflere dokunun ya da harfleri sırayla yazın (<b>-</b> boş, <b>*</b> çift işaret).'} Tekrar dokunmak siler. Yeşil çerçeve doğru cevabı gösterir.</div>
      <div class="row" style="margin-bottom:8px"><input type="text" id="ans-text" class="grow" placeholder="Hızlı giriş: ADAB-C…" autocapitalize="characters" autocomplete="off" style="flex:1;min-width:0;text-transform:uppercase">
        <button class="btn" data-act="ans-text" data-e="${examId}" data-s="${studentId}">Uygula</button></div>
      <div class="qgrid">${answers.slice(0, e.questionCount).map((a, i) => {
        const key = keyArr[i] ?? null, p = sc.per[i];
        const mark = p === 'd' ? '<span style="color:var(--ok)">✓</span>' : p === 'y' ? '<span style="color:var(--bad)">✗</span>' : p === 'x' ? '<span class="muted small">iptal</span>' : '';
        return `<div class="qrow${unsure.has(i) ? ' unsure' : ''}"><span class="qn">${i + 1}</span>${Array.from({ length: k }, (_, j) => {
          const on = a === j || a === -1;
          const cls = [on ? 'on' : '', key === j ? 'right' : '', on && a === -1 ? 'multi' : on && key != null && key !== j ? 'wrong' : ''].join(' ');
          return `<button class="opt ${cls}" data-act="ans-set" data-e="${examId}" data-s="${studentId}" data-q="${i}" data-o="${j}">${L[j]}</button>`;
        }).join('')}<span class="mark">${mark}</span></div>`;
      }).join('')}</div></div>
      ${r ? sendButtons(e, s, r, 'block') : ''}
      ${r ? `<button class="btn danger block" style="margin-top:28px" data-act="del-result" data-e="${examId}" data-s="${studentId}">Bu sonucu sil</button>` : ''}`;
  }

  const rateClass = (v) => (v < 0.4 ? 'bad' : v < 0.7 ? 'warn' : 'ok');
  function topicRow(name, rate, note) {
    return `<div><div class="grow" style="min-width:0"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name)}</div>
      <div class="bar ${rate == null ? '' : rateClass(rate)}" style="margin-top:6px"><i style="width:${(rate || 0) * 100}%"></i></div></div>
      <span class="small" style="min-width:64px;text-align:right">${rate == null ? '–' : '%' + Math.round(rate * 100)}<br><span class="muted">${note}</span></span></div>`;
  }

  // ---------- Velilere gönderme ----------
  // Mesaj seçenekleri cihazda hatırlanır. format: 'image' (JPG karne) | 'text'
  const SEND_KEY = 'optik-veli-ayar';
  function sendOpts() {
    const def = { avg: true, rank: false, wrong: true, topics: true, format: 'image' };
    try { return Object.assign(def, JSON.parse(localStorage.getItem(SEND_KEY) || '{}')); } catch (e) { return def; }
  }

  // Sade metin mesajı. Puan her zaman 100 üzerindendir (netli sınavda net 100'e oranlanır).
  // Ek seçenekler (ortalama, sıralama, konular…) yalnızca karneyi etkiler.
  function parentMessage(exam, student, r) {
    const sc = Store.scoreResult(exam, r);
    return [
      `Sınav : ${exam.name}`,
      `İsim : ${student.name}`,
      `Doğru Sayısı : ${sc.correct}`,
      `Yanlış Sayısı : ${sc.wrong}`,
      `Boş Sayısı : ${sc.blank}`,
      `Puan : ${fmt(Store.usesPoints(exam) ? sc.points : sc.pct, 1)}`,
      ...(student.parentCode ? ['', `Tüm sınav sonuçları: ${PARENT_SITE} · Veli kodu: ${student.parentCode}`] : []),
    ].join('\n');
  }
  // Karnenin yanında giden kısa yazı
  const captionText = (exam, student) => `Sayın Veli, ${student.name} adlı öğrencimizin "${exam.name}" sınav sonuç karnesi ektedir.${window.Cloud?.name ? '\n' + window.Cloud.name : ''}`;

  // Karne resmi (tuval)
  function reportCanvas(exam, student, r, opts) {
    const sc = Store.scoreResult(exam, r);
    const st = examStats(exam);
    const pts = Store.usesPoints(exam);
    const nb = Store.bookletCount(exam);
    const topics = opts.topics ? Store.topicScores(exam, r) : null;
    return ReportCard.render({
      examName: exam.name, dateText: fmtDate(exam.date), className: Store.getClass(exam.classId)?.name,
      studentName: student.name, number: student.number, booklet: nb > 1 && r.booklet >= 0 && r.booklet != null ? L[r.booklet] : '',
      mainValue: Store.mainScore(exam, sc), mainLabel: Store.mainLabel(exam), mainMax: pts ? 100 : sc.counted,
      ratio: pts ? sc.points / 100 : sc.pct / 100, correct: sc.correct, wrong: sc.wrong, blank: sc.blank, net: sc.net, showNet: pts,
      avg: opts.avg ? st.avg : null,
      rank: opts.rank ? st.rows.findIndex((x) => x.st.id === student.id) + 1 : null, of: st.rows.length,
      topics: topics || [], wrongList: opts.wrong ? sc.per.map((p, i) => (p === 'y' ? i + 1 : 0)).filter(Boolean) : [],
      teacher: window.Cloud?.name || '',
    });
  }
  const reportFileName = (exam, student) => `${student.name} - ${exam.name}.jpg`.replace(/[\\/:*?"<>|]/g, '_');

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isPhone = () => matchMedia('(pointer: coarse)').matches;
  // Veli telefonu tutulmaz: WhatsApp/Mesajlar hazır metinle açılır, kişiyi öğretmen seçer
  function sendLinks(text) {
    const t = encodeURIComponent(text);
    return { wa: `https://wa.me/?text=${t}`, sms: `sms:${isIOS ? '&' : '?'}body=${t}` };
  }

  // Bir öğrenci için gönderme düğmeleri (gönderme ekranında ve sonuç sayfasında).
  // Karne modunda: Paylaş (telefonun paylaşım menüsü) ve WhatsApp (karne panoya kopyalanır,
  // WhatsApp sonuç metniyle açılır). Metin modunda: WhatsApp ve SMS.
  function sendButtons(e, s, r, layout) {
    const o = sendOpts();
    const big = layout === 'block';
    const cls = `btn ${big ? '' : 'small'}`;
    const ids = `data-e="${e.id}" data-s="${s.id}"`;
    let html;
    if (o.format === 'image') {
      const share = `<button class="${cls}" data-img="${isPhone() ? 'share' : 'dl'}" ${ids}>${isPhone() ? (big ? '📷 Karneyi paylaş' : 'Paylaş') : (big ? '⬇︎ Karneyi indir' : 'İndir')}</button>`;
      const wa = `<button class="${cls}" data-img="wa" ${ids}>${big ? '💬 Veliye WhatsApp' : 'WhatsApp'}</button>`;
      html = big ? `<div class="btns">${share}${wa}</div>` : `<div class="row" style="flex-wrap:nowrap">${share}${wa}</div>`;
    } else {
      const links = sendLinks(parentMessage(e, s, r));
      const a = (ch, label) => `<a class="${cls}" href="${esc(links[ch])}" target="_blank" rel="noopener" data-sent="${ch}" ${ids}>${label}</a>`;
      html = big ? `<div class="btns">${a('wa', '💬 Veliye WhatsApp')}${a('sms', '✉️ Veliye SMS')}</div>` : `<div class="row" style="flex-wrap:nowrap">${a('wa', 'WhatsApp')}${a('sms', 'SMS')}</div>`;
    }
    if (big && r.sentAt) html += `<p class="small muted" style="text-align:center">Veliye gönderildi: ${new Date(r.sentAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</p>`;
    return html;
  }

  // Karne düğmeleri. Paylaşım ve panoya kopyalama kullanıcı dokunuşunun içinde, beklemeden başlar.
  function sendImage(mode, examId, studentId) {
    const e = Store.getExam(examId), s = Store.getStudent(studentId), r = Store.getResult(examId, studentId);
    if (!e || !s || !r) return;
    const canvas = reportCanvas(e, s, r, sendOpts());
    const mark = () => { Store.markSent(examId, studentId, mode === 'wa' ? 'wa-img' : 'img'); setTimeout(() => render(true), 300); };
    if (mode === 'dl') {
      download(reportFileName(e, s), ReportCard.toBlob(canvas), 'image/jpeg');
      return mark();
    }
    if (mode === 'share') {
      const file = new File([ReportCard.toBlob(canvas)], reportFileName(e, s), { type: 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] })) {
        navigator.share({ files: [file], text: captionText(e, s) }).then(mark).catch((err) => { if (err.name !== 'AbortError') toast('Paylaşılamadı: ' + err.message); });
      } else {
        download(file.name, file, 'image/jpeg');
        mark();
      }
      return;
    }
    // WhatsApp: karneyi panoya kopyala (PNG; Safari yalnız PNG kabul eder), WhatsApp'ı aç (kişiyi öğretmen seçer)
    try {
      navigator.clipboard.write([new ClipboardItem({ 'image/png': ReportCard.toBlob(canvas, 'image/png') })])
        .then(() => toast('Karne kopyalandı. WhatsApp\'ta mesaj alanına basılı tutup "Yapıştır" deyin.'))
        .catch(() => toast('Karne kopyalanamadı; "Paylaş" düğmesini kullanın.'));
    } catch (err) { toast('Bu cihaz resim kopyalamayı desteklemiyor; "Paylaş" düğmesini kullanın.'); }
    // Sohbet sonuçların tam metniyle açılır; karne yapıştırılmasa da veli sonucu almış olur
    window.open(sendLinks(parentMessage(e, s, r)).wa, '_blank', 'noopener');
    mark();
  }

  // Tüm karneler: telefonda tek seferde paylaşım (ör. Fotoğraflar'a kaydet), bilgisayarda tek tek indirme
  function sendAllImages(examId) {
    const e = Store.getExam(examId);
    const o = sendOpts();
    const rows = examStats(e).rows;
    const files = rows.map((x) => new File([ReportCard.toBlob(reportCanvas(e, x.st, x.r, o))], reportFileName(e, x.st), { type: 'image/jpeg' }));
    if (isPhone() && navigator.canShare?.({ files })) {
      navigator.share({ files }).catch((err) => { if (err.name !== 'AbortError') toast('Paylaşılamadı: ' + err.message); });
    } else {
      files.forEach((f, i) => setTimeout(() => download(f.name, f, 'image/jpeg'), i * 300));
      toast(`${files.length} karne indiriliyor`);
    }
  }

  function sendView(id) {
    const e = Store.getExam(id);
    if (!e) return notFound();
    setTop('Velilere gönder', `#/exam/${id}`);
    const st = examStats(e);
    if (!st.rows.length) return '<div class="card empty">Henüz okutulan optik yok</div>';
    const o = sendOpts();
    const img = o.format === 'image';
    const sent = st.rows.filter((x) => x.r.sentAt).length;
    const sample = st.rows[0];
    const chk = (k, label) => `<label class="row" style="padding:6px 0"><input type="checkbox" data-opt="${k}" ${o[k] ? 'checked' : ''}> ${label}</label>`;
    const ordered = st.rows.slice().sort((a, b) => (+a.st.number || 1e9) - (+b.st.number || 1e9) || a.st.name.localeCompare(b.st.name, 'tr'));
    const how = img
      ? (isPhone()
        ? '<b>WhatsApp</b> sonuç mesajıyla açılır ve karne kopyalanır: veliyi seçip mesaj alanına basılı tutun, <b>Yapıştır</b> deyin. <b>Paylaş</b> karneyi telefonun paylaşım menüsüyle gönderir (kişiyi siz seçersiniz).'
        : 'Bilgisayarda karneler JPG olarak indirilir. Telefondan açarsanız doğrudan paylaşabilirsiniz.')
      : 'Düğmeye basınca WhatsApp ya da Mesajlar hazır mesajla açılır; veliyi seçip <b>Gönder</b>\'e basın ve uygulamaya geri dönün.';
    return `
      <div class="page-intro"><span class="eyebrow">Veli iletişimi</span><h2>Başarıyı paylaşın.</h2><p>${esc(e.name)} · ${st.rows.length} öğrenci karnesi</p></div>
      <div class="seg" style="margin-bottom:16px"><button class="${img ? 'on' : ''}" data-fmt="image">Sonuç karnesi</button><button class="${img ? '' : 'on'}" data-fmt="text">Metin mesajı</button></div>
      <div class="card pad small">${how} Gönderilenler işaretlenir.</div>
      ${img ? `<h2>Karnede olsun</h2>
      <div class="card pad report-options">${chk('avg', 'Sınıf ortalaması')}${chk('rank', 'Sınıf sıralaması')}${chk('wrong', 'Yanlış yaptığı soru numaraları')}${e.topics?.length ? chk('topics', 'Konulara göre başarı') : ''}
        ${window.Cloud?.name ? '' : '<p class="small muted" style="margin-bottom:0">İpucu: Ayarlar\'dan adınızı girerseniz karnenin sonuna imza olarak eklenir.</p>'}</div>` : ''}
      <h2>Karne önizlemesi <span class="small muted">· ${esc(sample.st.name)}</span></h2>
      ${img ? `<div class="card report-preview"><img alt="Örnek karne" src="${reportCanvas(e, sample.st, sample.r, o).toDataURL('image/jpeg', 0.85)}"></div>`
        : `<div class="card pad small" style="white-space:pre-wrap">${esc(parentMessage(e, sample.st, sample.r))}</div>`}
      ${img ? `<button class="btn block" style="margin-top:12px" data-act="send-all" data-id="${id}">${isPhone() ? '📤 Tüm karneleri paylaş / kaydet' : '⬇︎ Tüm karneleri indir'} (${st.rows.length})</button>` : ''}
      <h2>Öğrenciler · ${sent}/${st.rows.length} gönderildi</h2>
      <div class="card list">${ordered.map((x) => `<div>
        <div class="grow"><div>${x.r.sentAt ? '<span style="color:var(--ok)">✓</span> ' : ''}${esc(x.st.name)}</div>
          <div class="sub">${fmt(x.m)} ${Store.mainLabel(e).toLocaleLowerCase('tr-TR')} · veli kodu ${fmtCode(x.st.parentCode)}${x.r.sentAt ? ' · gönderildi ' + new Date(x.r.sentAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}</div></div>
        ${sendButtons(e, x.st, x.r, 'row')}</div>`).join('')}</div>`;
  }

  // ---------- Sınav analizi ----------
  const difficulty = (rate) => (rate >= 0.7 ? ['Kolay', 'ok'] : rate >= 0.4 ? ['Orta', 'warn'] : ['Zor', 'bad']);
  // Ayırt edicilik (üst %27 ile alt %27'nin doğru oranı farkı) için yaygın yorum aralıkları
  const discLabel = (d) => (d >= 0.4 ? ['Çok iyi', 'ok'] : d >= 0.3 ? ['İyi', 'ok'] : d >= 0.2 ? ['Orta', 'warn'] : ['Zayıf', 'bad']);

  // Bir kitapçık grubundaki her sorunun istatistiği. rows: examStats satırları
  function questionStats(e, rows, bk) {
    const k = e.optionCount;
    const key = Store.keyFor(e, bk);
    const sorted = rows.slice().sort((a, b) => b.m - a.m);
    const g = Math.floor(sorted.length * 0.27);
    const upper = g >= 3 ? sorted.slice(0, g) : null, lower = g >= 3 ? sorted.slice(-g) : null;
    return key.map((kk, i) => {
      const counts = Array(k).fill(0);
      const who = { right: [], wrong: [], blank: [] };
      rows.forEach((x) => {
        const a = x.r.answers[i];
        if (a == null) { who.blank.push(x); return; }
        if (a >= 0 && a < k) counts[a]++;
        if (kk != null) (a === kk ? who.right : who.wrong).push(x);
      });
      const n = rows.length;
      const rate = kk == null || !n ? null : who.right.length / n;
      let disc = null;
      if (upper && kk != null) {
        const p = (grp) => grp.filter((x) => x.r.answers[i] === kk).length / g;
        disc = p(upper) - p(lower);
      }
      // En çok seçilen yanlış şık (çeldirici)
      let distractor = null;
      counts.forEach((c, j) => { if (j !== kk && c > 0 && (!distractor || c > distractor.count)) distractor = { opt: j, count: c }; });
      return { i, key: kk, counts, right: who.right.length, wrong: who.wrong.length, blank: who.blank.length, n, rate, disc, distractor, who };
    });
  }

  // Doğru / yanlış / boş yığılmış çubuk (dilimler arasında 2px boşluk)
  function stackBar(q) {
    const seg = (v, cls, label) => (v ? `<i class="${cls}" style="flex:${v}" title="${label}: ${v}"></i>` : '');
    return `<span class="stack">${seg(q.right, 'ok', 'Doğru')}${seg(q.wrong, 'bad', 'Yanlış')}${seg(q.blank, 'none', 'Boş')}</span>`;
  }
  const stackLegend = '<div class="legend"><span><i class="ok"></i>Doğru</span><span><i class="bad"></i>Yanlış</span><span><i class="none"></i>Boş</span></div>';

  function statsView(id, bk = 0) {
    const e = Store.getExam(id);
    if (!e) return notFound();
    const k = e.optionCount;
    setTop('Sınav analizi', `#/exam/${id}`);
    const st = examStats(e);
    const n = st.rows.length;
    if (!n) return '<div class="card empty">Henüz sonuç yok</div>';
    const pts = Store.usesPoints(e);
    const lbl = Store.mainLabel(e).toLocaleLowerCase('tr-TR');

    // Özet istatistikler
    const vals = st.rows.map((x) => x.m).sort((a, b) => a - b);
    const median = n % 2 ? vals[n >> 1] : (vals[n / 2 - 1] + vals[n / 2]) / 2;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - st.avg) ** 2, 0) / n);
    const success = st.rows.reduce((s, x) => s + (pts ? x.s.points : x.s.pct), 0) / n;

    // Dağılım
    const buckets = 10, top = Math.max(1, keyCount(Store.keyFor(e, 0)));
    const hist = Array(buckets).fill(0);
    st.rows.forEach((x) => { const v = pts ? x.s.points / 100 : x.s.net / top; hist[Math.min(buckets - 1, Math.max(0, Math.floor(v * buckets)))]++; });
    const hmax = Math.max(...hist);

    // Soru numaraları kitapçığa göre değiştiği için soru analizi her kitapçık için ayrı yapılır
    const nb = Store.bookletCount(e);
    if (bk >= nb) bk = 0;
    const group = st.rows.filter(({ r }) => nb < 2 || Store.bookletOf(e, r) === bk);
    const qs = questionStats(e, group, bk);
    const valid = qs.filter((q) => q.rate != null);
    const mostWrong = valid.filter((q) => q.wrong > 0).sort((a, b) => b.wrong - a.wrong || b.blank - a.blank || a.i - b.i).slice(0, 8);
    const diff = { Kolay: 0, Orta: 0, Zor: 0 };
    valid.forEach((q) => diff[difficulty(q.rate)[0]]++);
    const hasDisc = valid.some((q) => q.disc != null);
    const qd = (q) => `data-act="q-detail" data-id="${id}" data-b="${bk}" data-q="${q.i}"`;

    // Konu başarısı
    let topicsHtml = '';
    if (e.topics?.length) {
      const topicList = Store.examTopics(e);
      const sums = topicList.map(() => [0, 0]);
      let used = 0;
      st.rows.forEach(({ r }) => { const t = Store.topicScores(e, r); if (!t) return; used++; t.forEach((x, i) => { sums[i][0] += x.correct; sums[i][1] += x.total; }); });
      if (used) {
        topicsHtml = `<h2>Konulara göre sınıf başarısı${nb > 1 ? ' (A kitapçığı)' : ''}</h2><div class="card list">${topicList.map((t, i) =>
          topicRow(`${t.name} (${Topics.formatQuestions(t.questions)})`, sums[i][1] ? sums[i][0] / sums[i][1] : null, `${used} öğrenci`)).join('')}</div>`;
      }
    }

    // Öğrenci × soru haritası
    const matrix = `<div class="card scroll-x" tabindex="0" role="region" aria-label="Öğrenci soru haritası; yatay kaydırılabilir"><table class="matrix"><thead><tr><th class="l">Öğrenci</th>${qs.map((q) => `<th><button ${qd(q)} aria-label="${q.i + 1}. soru ayrıntıları">${q.i + 1}</button></th>`).join('')}<th>${Store.mainLabel(e)}</th></tr></thead><tbody>
      ${group.map((x) => `<tr><td class="l"><a href="#/result/${id}/${x.st.id}">${esc(x.st.name)}</a></td>${qs.map((q) => {
        const a = x.r.answers[q.i];
        const st2 = q.key == null ? 'x' : a == null ? 'b' : a === q.key ? 'd' : 'y';
        const letter = a == null ? '' : a === -1 ? '✱' : L[a];
        const tip = `${x.st.name} · ${q.i + 1}. soru: ${a == null ? 'boş' : letter}${q.key != null ? ` (doğrusu ${L[q.key]})` : ' (iptal)'}`;
        return `<td class="m-${st2}" title="${esc(tip)}">${st2 === 'y' || st2 === 'd' ? letter : ''}</td>`;
      }).join('')}<td><b>${fmt(x.m)}</b></td></tr>`).join('')}
      </tbody></table></div>
      <div class="legend" style="margin:8px 4px 0"><span><i class="ok"></i>Doğru</span><span><i class="bad"></i>Yanlış (işaretlediği şık)</span><span><i class="none"></i>Boş</span></div>`;

    return `
      <div class="page-intro"><span class="eyebrow">Ölçme & değerlendirme</span><h2>${esc(e.name)}</h2><p>${esc(Store.getClass(e.classId)?.name || '')} <span aria-hidden="true">·</span> ${fmtDate(e.date)} <span aria-hidden="true">·</span> ${n} öğrenci değerlendirildi</p></div>
      <section class="analysis-hero" aria-label="Sınıf başarı özeti">
        <div><span class="eyebrow">Sınıf ortalaması</span><div class="hero-value">${fmt(st.avg, 1)}<small>${lbl}</small></div><p class="hero-caption">En yüksek ${fmt(st.max, 1)} <span aria-hidden="true">/</span> En düşük ${fmt(st.min, 1)}</p></div>
        <div class="hero-aside"><b>%${Math.round(success)}</b><span>Başarı oranı</span><div class="hero-meter"><i style="width:${Math.max(0, Math.min(100, success))}%"></i></div></div>
      </section>
      <div class="analysis-metrics"><div><span>Katılım</span><b>${n}<span style="display:inline;font-size:12px;font-weight:400"> / ${Store.roster(e).length}</span></b></div><div><span>Medyan ${lbl}</span><b>${fmt(median, 1)}</b></div><div><span>Standart sapma</span><b>${fmt(sd, 1)}</b></div></div>
      <div class="analytics-grid">
        <section class="card pad"><div class="section-head"><div><h2>${pts ? 'Puan' : 'Net'} dağılımı</h2><p>Sınıfın genel performans görünümü</p></div><span class="section-index">01</span></div>
          <div class="hist" role="img" aria-label="${esc(hist.map((v, i) => `%${i * 10}–${i * 10 + 10}: ${v} öğrenci`).join('; '))}">${hist.map((v, i) => `<div class="${v && v === hmax ? 'peak' : ''}" title="%${i * 10}–${i * 10 + 10}: ${v} öğrenci"><div class="hist-column"><b>${v || ''}</b><i style="height:${hmax ? v / hmax * 106 : 0}px"></i></div><small>${i * 10}</small></div>`).join('')}</div>
          <div class="chart-foot"><span>${pts ? 'Puan aralığı · 100 üzerinden' : 'Net / soru sayısı (%)'}</span><span>${n} öğrenci</span></div>
        </section>
        <section class="card pad"><div class="section-head"><div><h2>Soruların zorluk dengesi</h2><p>${nb > 1 ? L[bk] + ' kitapçığı · ' : ''}${valid.length} değerlendirilen soru</p></div><span class="section-index">02</span></div>
          ${['Kolay', 'Orta', 'Zor'].map((d, i) => `<div class="difficulty-row"><span>${d}</span><div class="bar ${['ok', 'warn', 'bad'][i]}"><i style="width:${valid.length ? diff[d] / valid.length * 100 : 0}%"></i></div><b>${diff[d]} soru</b></div>`).join('')}
          <p class="insight-note">Doğru cevap oranı %70 ve üzeri kolay, %40’ın altı zor olarak değerlendirilir.</p>
        </section>
      </div>
      ${nb > 1 ? `<h2>Kitapçık bazında inceleme</h2>${bookletTabs(e, bk, (b) => `#/exam/${id}/stats/${b}`)}<p class="small muted">${L[bk]} kitapçığı · ${group.length} öğrenci</p>` : ''}
      <section class="analysis-section"><div class="section-head"><div><h2>Birlikte gözden geçirelim</h2><p>En çok yanlış yapılan sorular · Ayrıntı için dokunun</p></div><span class="section-index">03</span></div>
        ${mostWrong.length ? `<div class="question-cards">${mostWrong.map((q) => `<button type="button" class="question-card" ${qd(q)} aria-label="${q.i + 1}. soru: ${q.wrong} yanlış, ${q.right} doğru, ${q.blank} boş. Ayrıntıları aç"><span class="question-number">${String(q.i + 1).padStart(2, '0')}</span><span class="question-body"><strong>${q.wrong} öğrenci yanlış yanıtladı</strong>${stackBar(q)}<small>${q.right} doğru · ${q.blank} boş · Cevap ${L[q.key]}</small>${q.distractor ? `<small>En çok seçilen yanlış: ${L[q.distractor.opt]} (${q.distractor.count})</small>` : ''}</span><span class="question-arrow" aria-hidden="true">›</span></button>`).join('')}</div>` : '<div class="card empty">Yanlış yanıt bulunmuyor. Soru ayrıntılarını aşağıdan inceleyebilirsiniz.</div>'}
      </section>

      ${topicsHtml}

      <h2>Ayrıntılı inceleme</h2>
      <details class="card detail-disclosure"><summary>Tüm sorular<span>${e.questionCount} soru · Cevap ve şık dağılımları</span></summary>
      <div class="scroll-x" tabindex="0" role="region" aria-label="Soru analizi tablosu; yatay kaydırılabilir"><table class="tbl"><thead><tr><th>Soru</th><th>Cvp</th><th>D</th><th>Y</th><th>B</th><th class="l" style="min-width:96px">Doğru oranı</th>${hasDisc ? '<th>Ayırt.</th>' : ''}${L.slice(0, k).map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>
        ${qs.map((q) => `<tr ${q.rate == null ? '' : qd(q)} class="${q.rate == null ? '' : 'tap'}"><td><button class="question-link" ${qd(q)} aria-label="${q.i + 1}. soru ayrıntıları">${q.i + 1}</button></td><td class="key">${q.key == null ? '<span class="muted">iptal</span>' : L[q.key]}</td>
          <td style="color:var(--ok)">${q.key == null ? '' : q.right}</td><td style="color:var(--bad)">${q.key == null ? '' : q.wrong}</td><td class="muted">${q.blank}</td>
          <td class="l">${q.rate == null ? '' : `<div class="row" style="flex-wrap:nowrap"><div class="grow bar ${rateClass(q.rate)}"><i style="width:${q.rate * 100}%"></i></div><span class="small">%${Math.round(q.rate * 100)}</span></div>`}</td>
          ${hasDisc ? `<td>${q.disc == null ? '' : `<span class="pill ${discLabel(q.disc)[1]}" title="${discLabel(q.disc)[0]}">${fmt(q.disc, 2)}</span>`}</td>` : ''}
          ${q.counts.map((v, j) => `<td class="${j === q.key ? 'key' : ''}">${v}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
      <p class="small muted" style="margin:8px 4px 0">Bir soruya dokunarak kimin hangi şıkkı işaretlediğini görün.${hasDisc ? ' <b>Ayırt edicilik</b>: en başarılı %27 ile en başarısız %27 arasındaki doğru oranı farkı; 0,30 ve üzeri iyi, 0,20\'nin altı zayıf (soru gözden geçirilmeli).' : ' Ayırt edicilik için en az 12 öğrenci gerekir.'}</p>

      </details>
      <details class="card detail-disclosure"><summary>Öğrenci & soru haritası<span>${group.length} öğrenci · Tüm yanıtları karşılaştırın</span></summary>${matrix}</details>`;
  }

  // Bir sorunun ayrıntısı: şık dağılımı ve kimin ne işaretlediği
  function questionDetail(examId, bk, qi) {
    const e = Store.getExam(examId);
    const st = examStats(e);
    const nb = Store.bookletCount(e);
    const group = st.rows.filter(({ r }) => nb < 2 || Store.bookletOf(e, r) === bk);
    const q = questionStats(e, group, bk)[qi];
    const max = Math.max(1, ...q.counts, q.blank);
    const names = (list, showOpt) => list.length
      ? `<div class="chips">${list.map((x) => `<a class="chip" href="#/result/${examId}/${x.st.id}" data-close>${esc(x.st.name)}${showOpt ? ` <b>${x.r.answers[qi] === -1 ? '✱' : L[x.r.answers[qi]]}</b>` : ''}</a>`).join('')}</div>`
      : '<p class="small muted" style="margin:4px 0">Yok</p>';
    const dist = q.counts.map((c, j) => `<div class="optbar"><b class="${j === q.key ? 'right' : ''}">${L[j]}</b>
        <div class="grow bar ${j === q.key ? 'ok' : 'bad'}"><i style="width:${c / max * 100}%"></i></div><span>${c}${j === q.key ? ' ✓' : ''}</span></div>`).join('')
      + `<div class="optbar"><b class="muted">–</b><div class="grow bar"><i style="width:${q.blank / max * 100}%;background:var(--muted)"></i></div><span>${q.blank} boş</span></div>`;
    const [dl, dc] = q.rate == null ? ['', ''] : difficulty(q.rate);
    const m = $('#modal');
    m.innerHTML = `<div class="sheet-modal">
      <h3>${qi + 1}. soru${nb > 1 ? ` · ${L[bk]} kitapçığı` : ''}</h3>
      <div class="row small" style="margin:-6px 0 12px">${q.key == null ? '<span class="pill">İptal</span>' : `<span class="pill ok">Doğru cevap ${L[q.key]}</span>`}
        ${q.rate == null ? '' : `<span class="pill ${dc}">${dl} · %${Math.round(q.rate * 100)} doğru</span>`}
        ${q.disc == null ? '' : `<span class="pill ${discLabel(q.disc)[1]}">Ayırt edicilik ${fmt(q.disc, 2)} · ${discLabel(q.disc)[0]}</span>`}</div>
      <div class="small muted" style="margin-bottom:6px">Şıkların seçilme sayısı (${q.n} öğrenci)</div>
      ${dist}
      ${q.distractor && q.key != null ? `<p class="small" style="margin:10px 0 0">En çok seçilen yanlış şık <b>${L[q.distractor.opt]}</b> (${q.distractor.count} kişi). Bu şıktaki yanılgı sınıfta konuşulabilir.</p>` : ''}
      <h2 style="margin-top:16px">Yanlış yapanlar (${q.wrong})</h2>${names(q.who.wrong, true)}
      <h2>Boş bırakanlar (${q.blank})</h2>${names(q.who.blank, false)}
      <h2>Doğru yapanlar (${q.right})</h2>${names(q.who.right, false)}
      <button class="btn block" style="margin-top:16px" data-close>Kapat</button></div>`;
    m.hidden = false;
    m.onclick = (ev) => {
      const a = ev.target.closest('a[href]');
      if (a) { ev.preventDefault(); closeModal(); location.hash = a.getAttribute('href'); return; }
      if (ev.target === m || ev.target.closest('[data-close]')) closeModal();
    };
  }

  function exportCSV(id) {
    const e = Store.getExam(id), c = Store.getClass(e.classId);
    const st = examStats(e);
    const nb = Store.bookletCount(e);
    const qh = Array.from({ length: e.questionCount }, (_, i) => 'S' + (i + 1));
    const head = ['Sıra', 'No', 'Ad Soyad', ...(nb > 1 ? ['Kitapçık'] : []), 'Doğru', 'Yanlış', 'Boş', 'Net', Store.usesPoints(e) ? 'Puan' : 'Yüzde', ...qh];
    const lines = [head];
    for (let b = 0; b < nb; b++) {
      lines.push(['', '', nb > 1 ? `CEVAP ANAHTARI (${L[b]})` : 'CEVAP ANAHTARI', ...(nb > 1 ? [L[b]] : []), '', '', '', '', '', ...Store.keyFor(e, b).map(ansLabel)]);
    }
    const bkLabel = (r) => (r.booklet >= 0 && r.booklet != null ? L[r.booklet] : r.booklet === -1 ? 'çift (A sayıldı)' : 'yok (A sayıldı)');
    st.rows.forEach((x, i) => lines.push([i + 1, x.st.number, x.st.name, ...(nb > 1 ? [bkLabel(x.r)] : []), x.s.correct, x.s.wrong, x.s.blank, fmt(x.s.net), fmt(Store.usesPoints(e) ? x.s.points : x.s.pct, 1),
      ...x.r.answers.slice(0, e.questionCount).map(ansLabel)]));
    const csv = '﻿' + lines.map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    download(`${c.name} - ${e.name}.csv`.replace(/[\\/:*?"<>|]/g, '_'), csv, 'text/csv;charset=utf-8');
  }

  // ---------- Öğrenci geçmişi ----------
  function studentView(id) {
    const s = Store.getStudent(id);
    if (!s) return notFound();
    const c = Store.getClass(s.classId);
    setTop(s.name, `#/class/${s.classId}`, `<button class="btn small" data-act="edit-student" data-id="${id}">Düzenle</button>`);
    const rows = Store.studentResults(id).map((r) => {
      const e = Store.getExam(r.examId);
      if (!e) return null;
      const st = examStats(e);
      const sc = Store.scoreResult(e, r);
      const rank = st.rows.findIndex((x) => x.st.id === id) + 1;
      return { e, sc, rank, of: st.rows.length, avg: st.avg };
    }).filter(Boolean).sort((a, b) => (a.e.date || '').localeCompare(b.e.date || ''));
    // Başarı yüzdesi: puanlı sınavda puan, netli sınavda netin soru sayısına oranı
    rows.forEach((x) => { x.p = Store.usesPoints(x.e) ? x.sc.points : x.sc.pct; });
    const avgPct = rows.length ? rows.reduce((t, x) => t + x.p, 0) / rows.length : 0;
    return `
      <div class="small muted" style="margin:0 4px 10px">${esc(c?.name)} · ${s.number ? 'No ' + esc(s.number) + ' · ' : ''}Optik kodu #${s.id} · Veli kodu <b>${fmtCode(s.parentCode)}</b> (${PARENT_SITE})</div>
      <div class="stats" style="grid-template-columns:repeat(2,1fr)">
        <div class="stat"><b>${rows.length}</b><span>Sınav</span></div>
        <div class="stat"><b>%${fmt(avgPct, 1)}</b><span>Ortalama başarı</span></div>
      </div>
      ${rows.length ? `<h2>Başarı grafiği</h2><div class="card pad"><div class="hist">${rows.map((x) =>
        `<div><b>${Math.round(x.p)}</b><i style="height:${x.p}%"></i><small>${esc(x.e.name.slice(0, 8))}</small></div>`).join('')}</div></div>` : ''}
      <h2>Sınavlar</h2>
      <div class="card list">${rows.slice().reverse().map((x) => `<a href="#/result/${x.e.id}/${id}"><div class="grow"><div><b>${esc(x.e.name)}</b></div>
        <div class="sub">${fmtDate(x.e.date)} · ${x.sc.correct}D ${x.sc.wrong}Y ${x.sc.blank}B · sınıf ort. ${fmt(x.avg)} net</div></div>
        <div style="text-align:right"><b>${fmt(Store.mainScore(x.e, x.sc))}</b><div class="sub">${x.rank}/${x.of}. sıra</div></div><span class="chev"></span></a>`).join('') || '<div class="empty">Henüz sonuç yok</div>'}</div>
      `;
  }

  // ---------- Ana ekrana ekleme ----------
  // Android/bilgisayar Chrome'u yükleme penceresini sayfaya verir (beforeinstallprompt), düğme onu açar.
  // iPhone Safari buna izin vermez: ekleme yalnızca Paylaş menüsünden yapılır, düğme adımları gösterir.
  const INSTALL_HIDE = 'optik-yukle-gizle';
  let installPrompt = null;
  const isStandalone = () => window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const canInstall = () => !isStandalone() && (!!installPrompt || isIOS);
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    if ($('#modal').hidden) render(true);
  });
  window.addEventListener('appinstalled', () => { installPrompt = null; render(true); });

  function installBanner() {
    let hidden = false;
    try { hidden = !!localStorage.getItem(INSTALL_HIDE); } catch (e) { /* yok say */ }
    if (hidden || !canInstall()) return '';
    return `<div class="install-banner"><img src="icons/icon-192.png" alt="" width="44" height="44">
      <div class="grow"><b>Uygulama gibi kullanın</b><span>Ana ekrana ekleyin, tek dokunuşla tam ekran açılsın.</span></div>
      <button class="btn small primary" data-act="install">Ekle</button>
      <button class="install-x" data-act="install-hide" aria-label="Kapat">×</button></div>`;
  }

  function installApp() {
    if (installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.finally(() => { installPrompt = null; render(true); });
      return;
    }
    const ico = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const SHARE = ico('<path d="M12 15V3m0 0L8 7m4-4 4 4"/><path d="M8 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-2"/>');
    const DOTS = ico('<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>');
    const ADD = ico('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8m-4-4h8"/>');
    const m = $('#modal');
    m.innerHTML = `<div class="sheet-modal"><h3>Ana ekrana ekleyin</h3>
      <p class="muted small" style="margin-top:0">iPhone bu işlemi yalnızca Safari'nin kendi menüsünden yaptırıyor. Üç adım:</p>
      <ol class="install-steps">
        <li><span class="step-ico">${DOTS}</span><div>Ekranın altındaki <b>•••</b> düğmesine, o yoksa <b>Paylaş</b> ${SHARE} düğmesine dokunun.</div></li>
        <li><span class="step-ico">${SHARE}</span><div><b>Paylaş</b>'ı seçin, açılan listeyi aşağı kaydırın (gerekirse <b>Daha Fazla</b>).</div></li>
        <li><span class="step-ico">${ADD}</span><div><b>Ana Ekrana Ekle</b>'ye, sonra sağ üstteki <b>Ekle</b>'ye dokunun. <i>Web Uygulaması Olarak Aç</i> seçeneği varsa açık kalsın.</div></li>
      </ol>
      <p class="small muted">Ana ekranda <b>Optik</b> simgesi belirir. Oradan açınca tarayıcı çubukları olmadan, uygulama gibi açılır. İlk açılışta bir kez giriş yapmanız gerekir.</p>
      <button class="btn primary block" data-close>Tamam</button></div>`;
    m.hidden = false;
    m.querySelector('[data-close]').onclick = closeModal;
    m.onclick = (e) => { if (e.target === m) closeModal(); };
  }

  // ---------- Ayarlar ----------
  function settingsView() {
    setTop('Ayarlar', null);
    const cloud = window.Cloud;
    return `
      <h2>Hesap</h2>
      <div class="card pad">${cloud?.email ? `
        <div class="row"><div class="grow"><b>${esc(cloud.name || cloud.email)}</b>${cloud.name ? `<div class="small muted">${esc(cloud.email)}</div>` : ''}<div class="small muted" id="sync-status">${esc(cloud.status)}</div></div>
          <button class="btn small" data-act="logout">Çıkış yap</button></div>
        <button class="btn block" style="margin-top:12px" data-act="edit-name">✎ Adımı ${cloud.name ? 'değiştir' : 'ekle'} (velilere giden mesajlarda imza)</button>
        <p class="small muted" style="margin-bottom:0">Veriler bu hesapta bulutta saklanır. Aynı hesapla telefondan ve bilgisayardan girebilirsiniz.</p>`
        : '<p class="small muted" style="margin:0">Bulut bağlantısı kurulamadı; veriler şimdilik yalnızca bu cihazda.</p>'}</div>
      ${cloud?.isAdmin && cloud?.canCreateUsers ? `<h2>Kullanıcı yönetimi</h2><div class="card pad"><p class="small muted" style="margin-top:0">Yeni kullanıcıların e-posta adresini ve giriş şifresini tanımlayın.</p><button class="btn primary block" data-act="create-user">+ Yeni kullanıcı oluştur</button></div>` : ''}
      <h2>Ortak konu listesi</h2>
      <div class="card pad"><p class="small muted" style="margin-top:0">Matematik konularını tüm öğretmenlerle birlikte yönetin. Konu ekleyebilir, başlıkları düzenleyebilir ve silebilirsiniz.</p><a class="btn block" href="#/topics">Konu kütüphanesini aç</a></div>
      <h2>Yedekleme</h2>
      <div class="card pad">
        <p class="small muted" style="margin-top:0">Veriler bulutta saklanır. İsterseniz ayrıca bir yedek dosyası alabilirsiniz. Yedekten yüklemek, hesaptaki tüm verilerin yerine yedektekileri koyar.</p>
        <div class="btns"><button class="btn" data-act="backup">⬇︎ Yedek al</button><label class="btn">⬆︎ Yedekten yükle<input type="file" id="restore" accept=".json,application/json" hidden></label></div>
      </div>
      ${isStandalone() ? '' : `<h2>Ana ekrana ekle</h2><div class="card pad small">
        <p style="margin-top:0">Uygulamayı ana ekrana eklerseniz simgesine dokununca tam ekran açılır ve veriler cihazda kalıcı olur.</p>
        <button class="btn primary block" data-act="install">📲 Ana ekrana ekle</button></div>`}
      <h2>Nasıl kullanılır?</h2>
      <div class="card pad small"><ol style="margin:0;padding-left:20px;line-height:1.7">
        <li><b>Sınıflar</b>'dan sınıf ekleyip öğrencileri girin.</li>
        <li><b>Sınavlar</b>'dan sınav oluşturun: soru sayısı, şık ve form boyutunu (A4 tekli, A5 ikili, A6 dörtlü) seçin.</li>
        <li><b>Optik formları PDF olarak al</b> ile her öğrencinin adını taşıyan formları basın; çoklu sayfaları kesik çizgiden kesin.</li>
        <li>Cevap anahtarını girin.</li>
        <li><b>Optik okut</b>'a basın, formu düz bir zemine koyup kamerayı tutun. Dört siyah köşe görününce form kendiliğinden okunur.</li>
        <li>Sonuçlar, sıralama ve soru analizi sınav sayfasında görünür.</li>
      </ol>
      <p class="muted"><b>Otomatik kayıt</b> açıkken formları art arda gösterin; okuyucu emin olamadığı bir işaret görürse durup sarı halkayla gösterir. Sonuç sayfasında ⚠ ile işaretli soruları kâğıtla karşılaştırın.</p>
      <p class="muted"><b>Puan ve konular:</b> Sınav ayarlarında "100 üzerinden puan" seçebilir, cevap anahtarı sayfasında konu aralıklarını (ör. <i>1-5 Kesirler</i>) ve soru puanlarını girebilirsiniz. Konu başarısı sonuç, soru analizi ve veli mesajında görünür.</p>
      <p class="muted">İpuçları: Formu iyi ışıkta, gölge düşürmeden okutun. Kurşun kalemle tam doldurulmuş işaretler en iyi sonucu verir. Hatalı okunan cevabı sonuç sayfasından elle düzeltebilirsiniz.</p></div>`;
  }

  function notFound() {
    setTop('Bulunamadı', '#/classes');
    return '<div class="card empty">Kayıt bulunamadı.</div>';
  }

  // ---------- Genel istatistikler ----------
  // analyticsClasses / analyticsExams: seçili sınıf ve sınav kimlikleri; boş liste = hepsi
  let analyticsClasses = [], analyticsExams = [];
  const gradeOfClass = (c) => c?.name.match(/^\s*(\d+)/)?.[1] || '';
  // Ortak sınav: aynı sınıf düzeyinde aynı adı taşıyan sınavlar
  const commonKey = (e) => { const g = gradeOfClass(Store.getClass(e.classId)); return g ? `n:${g}|${e.name.trim().toLocaleLowerCase('tr-TR')}` : `e:${e.id}`; };
  function analyticsGrades() {
    const grades = new Map();
    for (const c of Store.classes()) {
      const g = gradeOfClass(c);
      if (g) grades.set(g, [...(grades.get(g) || []), c]);
    }
    for (const [g, list] of grades) if (list.length < 2) grades.delete(g);
    return grades;
  }
  const analyticsAvailable = () => Store.exams().filter(e => !analyticsClasses.length || analyticsClasses.includes(e.classId));
  // En az iki sınıfta yapılmış ortak sınavlar
  function analyticsCommon(exams) {
    const common = new Map();
    for (const e of exams) {
      const key = commonKey(e);
      if (!common.has(key)) common.set(key, { key, name: e.name.trim(), exams: [] });
      common.get(key).exams.push(e);
    }
    for (const [key, group] of common) if (new Set(group.exams.map(e => e.classId)).size < 2) common.delete(key);
    return common;
  }
  const pickCheck = '<i class="pick-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 12.5 4 4 8-9"/></svg></i>';
  function analyticsClassPicker() {
    const grades = analyticsGrades();
    const form = modal('Sınıf seçin', `
      <p class="pick-hint">İstediğiniz sınıfları işaretleyin. Hiçbirini seçmezseniz tüm sınıflar birlikte gösterilir.</p>
      ${grades.size ? `<div class="pick-chips">${[...grades].map(([g, list]) => `<button type="button" class="pick-chip" data-grade="${list.map(c => c.id).join(',')}">Tüm ${g}. sınıflar</button>`).join('')}</div>` : ''}
      <div class="pick-list">${Store.classes().map(c => `<label class="pick-row" style="${classColor(c.id)}">
        <input type="checkbox" name="cls" value="${c.id}" ${analyticsClasses.includes(c.id) ? 'checked' : ''}><span class="pick-badge">${esc(c.name)}</span>
        <span class="pick-text"><b>${esc(c.name)}</b><small>${Store.students(c.id).length} öğrenci · ${Store.exams(c.id).length} sınav</small></span>${pickCheck}</label>`).join('')}</div>
      <button type="button" class="pick-clear" data-pick-clear>Seçimi temizle</button>`,
    (fd) => {
      analyticsClasses = fd.getAll('cls').map(Number);
      const available = analyticsAvailable().map(e => e.id);
      analyticsExams = analyticsExams.filter(id => available.includes(id));
      render(true);
    }, 'Uygula');
    pickerSetup(form);
  }
  function analyticsExamPicker() {
    const available = analyticsAvailable();
    if (!available.length) return toast('Seçili sınıflarda sınav yok');
    const common = analyticsCommon(available);
    const className = id => esc(Store.getClass(id)?.name || '');
    const examRow = e => `<label class="pick-row" style="${classColor(e.classId)}" data-search="${esc(`${e.name} ${Store.getClass(e.classId)?.name || ''}`.toLocaleLowerCase('tr-TR'))}">
        <input type="checkbox" name="exam" value="${e.id}" data-group="${esc(commonKey(e))}" ${analyticsExams.includes(e.id) ? 'checked' : ''}><span class="pick-badge">${className(e.classId)}</span>
        <span class="pick-text"><b>${esc(e.name)}</b><small>${fmtDate(e.date)} · ${Store.results(e.id).length} form</small></span>${pickCheck}</label>`;
    const form = modal('Sınav seçin', `
      <p class="pick-hint">Birden çok sınav seçebilirsiniz. Hiçbirini seçmezseniz tüm sınavlar gösterilir.</p>
      ${available.length > 8 ? '<input type="search" class="pick-search" placeholder="Sınav ya da sınıf ara">' : ''}
      ${common.size ? `<div class="pick-section">Ortak sınavlar<small>Sınıflar birlikte değerlendirilir</small></div><div class="pick-list">${[...common.values()].map(g => `<label class="pick-row pick-common" data-search="${esc(g.name.toLocaleLowerCase('tr-TR'))}">
        <input type="checkbox" data-common="${esc(g.key)}"><span class="pick-badge">${new Set(g.exams.map(e => e.classId)).size} sınıf</span>
        <span class="pick-text"><b>${esc(g.name)}</b><small>${Store.classes().filter(c => g.exams.some(e => e.classId === c.id)).map(c => esc(c.name)).join(', ')}</small></span>${pickCheck}</label>`).join('')}</div>
      <div class="pick-section">Sınıf sınavları</div>` : ''}
      <div class="pick-list">${available.map(examRow).join('')}</div>
      <button type="button" class="pick-clear" data-pick-clear>Seçimi temizle</button>`,
    (fd) => { analyticsExams = fd.getAll('exam').map(Number); render(true); }, 'Uygula');
    pickerSetup(form);
  }
  // Sınıf düzeyi düğmeleri ve ortak sınav satırları kendi satırlarını birlikte işaretler
  function pickerSetup(form) {
    const boxes = [...form.querySelectorAll('input[name]')];
    const sync = () => {
      form.querySelectorAll('[data-grade]').forEach(chip => {
        const ids = chip.dataset.grade.split(',');
        chip.classList.toggle('on', boxes.filter(b => ids.includes(b.value)).every(b => b.checked));
      });
      form.querySelectorAll('[data-common]').forEach(box => {
        const own = boxes.filter(b => b.dataset.group === box.dataset.common);
        box.checked = own.every(b => b.checked);
        box.indeterminate = !box.checked && own.some(b => b.checked);
      });
    };
    form.addEventListener('click', (ev) => {
      const chip = ev.target.closest('[data-grade]');
      if (chip) {
        const ids = chip.dataset.grade.split(','), on = !chip.classList.contains('on');
        boxes.forEach(b => { if (ids.includes(b.value)) b.checked = on; });
        sync();
      }
      if (ev.target.closest('[data-pick-clear]')) { boxes.forEach(b => { b.checked = false; }); sync(); }
    });
    form.addEventListener('change', (ev) => {
      const key = ev.target.dataset.common;
      if (key) boxes.forEach(b => { if (b.dataset.group === key) b.checked = ev.target.checked; });
      sync();
    });
    form.querySelector('.pick-search')?.addEventListener('input', (ev) => {
      const q = ev.target.value.trim().toLocaleLowerCase('tr-TR');
      form.querySelectorAll('[data-search]').forEach(row => { row.hidden = !!q && !row.dataset.search.includes(q); });
    });
    sync();
    document.activeElement?.blur(); // telefonda klavye açılmasın
  }
  function analyticsView() {
    setTop('İstatistikler', null);
    const grades = analyticsGrades();
    analyticsClasses = analyticsClasses.filter(id => Store.getClass(id));
    const classIds = analyticsClasses.length ? analyticsClasses : null;
    const available = analyticsAvailable();
    analyticsExams = analyticsExams.filter(id => available.some(e => e.id === id));
    const examIds = analyticsExams.length ? analyticsExams : null;
    const selected = examIds ? available.filter(e => examIds.includes(e.id)) : available;
    // Seçimde aynı ortak sınavı paylaşan sınavların soruları birlikte değerlendirilir
    const common = analyticsCommon(selected);
    const commonSel = examIds && common.size === 1 && [...common.values()][0].exams.length === selected.length ? [...common.values()][0] : null;
    const gradeSel = classIds && [...grades].find(([, list]) => list.length === classIds.length && list.every(c => classIds.includes(c.id)))?.[0];
    const data = Analytics.summarize(classIds, examIds, e => common.has(commonKey(e)) ? commonKey(e) : `e:${e.id}`);
    const score = n => n == null ? '—' : fmt(n, 1);
    const className = id => esc(Store.getClass(id)?.name || '');
    const head = (title, note = '') => `<div class="insight-heading"><h2>${title}</h2>${note ? `<span>${note}</span>` : ''}</div>`;
    const classLabel = !classIds ? 'Tüm sınıflar' : gradeSel ? `Tüm ${gradeSel}. sınıflar` : Store.classes().filter(c => classIds.includes(c.id)).map(c => esc(c.name)).join(', ');
    const examLabel = !examIds ? 'Tüm sınavlar' : commonSel ? `${esc(commonSel.name)} · ortak` : selected.length === 1 ? `${className(selected[0].classId)} · ${esc(selected[0].name)}` : `${selected.length} sınav`;
    const trigger = (act, label, value, count) => `<button type="button" class="filter-trigger ${count ? 'on' : ''}" data-act="${act}"><span>${label}</span><b>${value}</b>${count > 1 ? `<em>${count}</em>` : ''}<i aria-hidden="true"></i></button>`;
    const intro = `<div class="exam-editorial"><div><span class="eyebrow">ÖĞRENMEYE GENEL BAKIŞ</span><h2>Veriden içgörüye<span>.</span></h2><p>Sınıfınızın güçlü yanlarını ve ihtiyaçlarını keşfedin.</p></div></div>
      <div class="analytics-filters">${trigger('pick-classes', 'Sınıf', classLabel, analyticsClasses.length)}${trigger('pick-exams', 'Sınav', examLabel, analyticsExams.length)}</div>`;
    const exclusion = data.excluded ? `<div class="analytics-note">${data.excluded} form analize alınmadı: ${[
      data.excludedReasons.key ? `${data.excludedReasons.key} cevap anahtarı eksik` : '',
      data.excludedReasons.booklet ? `${data.excludedReasons.booklet} kitapçığı belirsiz` : '',
      data.excludedReasons.uncertain ? `${data.excludedReasons.uncertain} okuması kontrol bekliyor` : ''
    ].filter(Boolean).join(' · ')}. Sınav detayından kontrol edebilirsiniz.</div>` : '';
    if (!data.entries.length) return `${intro}<div class="analytics-empty"><span class="analytics-empty-icon" aria-hidden="true">▥</span><h3>Sonuçlar geldikçe tablo netleşir.</h3><p>${data.read ? 'Analiz için cevap anahtarını ve kontrol bekleyen formları tamamlayın.' : 'Optik formları okuttuğunuzda sınıf ortalamaları, öğrenci sıralaması ve soru analizleri burada oluşacak.'}</p><a class="btn primary" href="#/exams">Sınavlara git ↗</a></div>${exclusion}`;
    const timeline = data.summaries.filter(s => s.count).slice().reverse().slice(-10);
    const totalAnswers = data.correct + data.wrong + data.blank;
    const trend = timeline.length > 1 ? timeline[timeline.length - 1].average - timeline[timeline.length - 2].average : null;
    const distMax = Math.max(...data.distribution, 1);
    const rankRow = row => `<a class="ranking-row" href="#/student/${row.student.id}"><span class="rank-position ${row.rank <= 3 ? 'rank-top' : ''}">${row.rank.toString().padStart(2, '0')}</span><span class="ranking-person"><b>${esc(row.student.name)}</b><small>${className(row.student.classId)} · ${row.count}/${row.expected} sınav değerlendirildi</small></span><strong>${score(row.average)}<small>/100</small></strong></a>`;
    return `${intro}${exclusion}
      <section class="analytics-hero"><div><span class="eyebrow">${commonSel ? `${esc(commonSel.name.toLocaleUpperCase('tr-TR'))} · ORTAK ORTALAMA` : gradeSel ? `${gradeSel}. SINIFLAR ORTALAMASI` : classIds?.length > 1 ? 'SEÇİLİ SINIFLAR ORTALAMASI' : classIds ? 'SINIF ORTALAMASI' : 'GENEL ORTALAMA'}</span><div class="analytics-value">${score(data.average)}<span>/100</span></div><p>${data.entries.length} değerlendirilmiş form · ${data.summaries.filter(s => s.count).length} sınav</p></div><div class="analytics-hero-detail"><span>Ortanca değer<strong>${score(data.median)}</strong></span><span>Okuma oranı<strong>%${Math.round(data.read / Math.max(1, data.expected) * 100)}</strong></span></div></section>
      <div class="analytics-kpis"><div><span>Öğrenci</span><b>${data.ranking.length}</b><small>sonucu değerlendirilen</small></div><div><span>Okunan form</span><b>${data.read}<small> / ${data.expected}</small></b><small>seçili sınavlarda</small></div><div><span>Doğru yanıt</span><b>%${Math.round(data.correct / totalAnswers * 100)}</b><small>${totalAnswers} yanıt üzerinden</small></div></div>
      <div class="insight-layout"><section class="insight-panel trend-panel">${head('Sınav ortalamaları', '100 üzerinden')}
        ${timeline.length > 1 ? `<div class="trend-summary"><strong>${trend >= 0 ? '+' : ''}${score(trend)}</strong><span>son iki sınav arasındaki fark</span></div>` : '<p class="insight-caption">Yeni sonuçlar eklendikçe sınavları karşılaştırabilirsiniz.</p>'}
        <div class="trend-chart" aria-label="Son sınavların ortalamaları">${timeline.map((s, i) => `<a href="#/exam/${s.exam.id}/stats" class="trend-column" title="${esc(s.exam.name)} · ${score(s.average)}/100"><span>${score(s.average)}</span><div><i style="height:${Math.max(1, s.average)}%"></i></div><small>${i + 1}</small></a>`).join('')}</div>
        <div class="trend-key">${timeline.map((s, i) => `<a href="#/exam/${s.exam.id}/stats"><span>${i + 1}</span><div>${esc(s.exam.name)}<small>${className(s.exam.classId)} · ${fmtDate(s.exam.date)} · ${s.count} form</small></div><b>${score(s.average)}</b></a>`).join('')}</div>
        <p class="insight-caption">Son ${timeline.length} sınav, tarih sırasıyla. Farklı sınav ve katılımcılar sonuçları etkileyebilir.</p></section>
      <section class="insight-panel">${head('Başarı dağılımı', `${data.entries.length} form`)}<div class="distribution">${data.distribution.map((n, i) => `<div><span>${['0–19', '20–39', '40–59', '60–79', '80–100'][i]}</span><i><b style="width:${n / distMax * 100}%"></b></i><strong>${n}</strong></div>`).join('')}</div>
        <div class="answer-breakdown">${[['Doğru', data.correct, 'ok'], ['Yanlış', data.wrong, 'bad'], ['Boş', data.blank, 'muted']].map(([label, n, color]) => `<div><i style="background:var(--${color})"></i><span>${label}</span><b>${n}</b><small>%${Math.round(n / totalAnswers * 100)}</small></div>`).join('')}</div></section></div>
      ${!classIds || classIds.length > 1 ? `<section class="insight-panel">${head('Sınıflara bakış', commonSel ? esc(commonSel.name) : 'Form ortalamaları')}<div class="class-comparison">${data.classes.filter(c => !examIds || data.exams.some(e => e.classId === c.cls.id)).map(c => `<button data-analytics-class="${c.cls.id}" data-analytics-exam="${examIds ? selected.filter(e => e.classId === c.cls.id).map(e => e.id).join(',') : ''}" style="${classColor(c.cls.id)}"><span class="class-badge">${esc(c.cls.name)}</span><span class="comparison-meter"><i style="width:${c.average || 0}%"></i></span><span><b>${score(c.average)}</b><small>${c.count} form</small></span></button>`).join('')}</div></section>` : ''}
      <section class="insight-panel">${head('En çok yanlış yapılan sorular', 'Yanlış oranına göre')}
        ${data.questions.length ? `<div class="difficult-questions">${data.questions.slice(0, 8).map(q => {
          const merged = q.exams.length > 1;
          const booklet = q.exams.some(e => Store.bookletCount(e) > 1) ? ` · ${L[q.booklet]} kitapçığı` : '';
          // Ortak sınavda soru tüm sınıfların öğrencileri üzerinden; altında sınıf sınıf yanlış oranı
          const where = merged ? [...q.byClass].map(([id, c]) => `${className(id)} %${Math.round(c.wrong / c.total * 100)}`).join(' · ') : className(q.exam.classId);
          const body = `<span class="question-number">${q.q + 1}<small>SORU</small></span><span class="question-context"><b>${esc(q.exam.name)}</b><small>${where}${booklet} · ${q.wrong}/${q.total} yanlış · ${q.blank} boş</small><span class="question-error-bar"><i style="width:${q.wrong / q.total * 100}%"></i></span></span><strong>%${Math.round(q.wrong / q.total * 100)}</strong>`;
          return merged ? `<div class="difficult-question">${body}</div>` : `<a class="difficult-question" href="#/exam/${q.exam.id}/stats/${q.booklet}">${body}</a>`;
        }).join('')}</div><p class="insight-caption">${common.size ? 'Ortak sınavda her soru, sınava giren tüm sınıfların öğrencileri birlikte değerlendirilerek sıralanır.' : 'Her soru kendi sınavı ve kitapçığı içinde değerlendirilir. Sınav analizini açmak için dokunun.'}</p>` : '<p class="insight-caption">Değerlendirilen formlarda yanlış yanıt bulunmuyor.</p>'}</section>
      <section class="insight-panel">${head('Öğrenci sıralaması', `${data.ranking.length} öğrenci`)}<p class="insight-caption">Öğrencinin değerlendirilen sınavlarının ortalaması. Katılım sayıları farklı olabilir; eşit ortalamalar aynı sırayı paylaşır.</p><div class="ranking-list">${data.ranking.slice(0, 10).map(rankRow).join('')}</div>${data.ranking.length > 10 ? `<details class="ranking-more"><summary>Tüm öğrencileri göster (${data.ranking.length})</summary><div class="ranking-list">${data.ranking.slice(10).map(rankRow).join('')}</div></details>` : ''}</section>
      <section class="insight-panel">${head('Konu & kazanım analizi', 'En çok desteğe ihtiyaç duyulan')}${data.topics.length ? data.topics.slice(0, 8).map(t => `<a class="topic-insight" href="#/exam/${t.exam.id}/stats"><div><b>${esc(t.name)}</b><small>${className(t.exam.classId)} · ${esc(t.exam.name)} · ${t.students} form</small><span class="comparison-meter"><i style="width:${t.correct / t.total * 100}%"></i></span></div><strong>%${Math.round(t.correct / t.total * 100)}</strong></a>`).join('') : '<p class="insight-caption">Sınav ayarlarında konu ve soru aralıklarını tanımladığınızda kazanım başarıları burada görünür.</p>'}<p class="insight-caption">Konu eşleştirmesi A kitapçığına göre yapılır.</p></section>
      <details class="analytics-method"><summary>Bu değerler nasıl hesaplanıyor?</summary><p>Puanlı sınavlarda ağırlıklı puan; netli sınavlarda netin geçerli soru sayısına oranı kullanılır. Sonuçlar 0–100 aralığındadır ve yanlış götürme ayarı uygulanır. Genel ve sınıf ortalaması değerlendirilen formların eşit ağırlıklı ortalamasıdır; öğrenci sıralaması her öğrencinin sınav ortalamasına göre yapılır. Anahtarı boş sorular iptal kabul edilir. Katılınmayan sınavlar sıfır sayılmaz; sınav sayfasında “Girmeyecek” olarak ayrılan öğrenciler okuma oranına da katılmaz. Ortak sınav seçildiğinde aynı sınıf düzeyindeki aynı adlı sınavların tüm formları birlikte ortalanır. Kitapçığı belirsiz, okuması kontrol bekleyen veya değerlendirilebilir anahtarı olmayan formlar analize alınmaz. Okuma oranı bu formları da kapsar.</p></details>`;
  }

  // ---------- Yönlendirme ----------
  // keepScroll: başka cihazdan gelen değişiklikle yenilenirken kaydırma yeri korunur
  function render(keepScroll) {
    const y = window.scrollY;
    const parts = (location.hash || '#/classes').slice(2).split('/');
    const [page, a, b, c] = parts;
    view.dataset.page = page === 'exam' && b ? b : page;
    const id = a ? +a : null;
    const tab = { classes: 'classes', class: 'classes', student: 'classes', analytics: 'analytics', settings: 'settings', topics: 'settings' }[page] || 'exams';
    document.querySelectorAll('#tabs a').forEach((x) => x.classList.toggle('active', x.dataset.tab === tab));
    let html;
    switch (page) {
      case 'class': html = classView(id); break;
      case 'student': html = studentView(id); break;
      case 'exams': html = examsView(); break;
      case 'papers': html = Papers.libraryView(); break;
      case 'analytics': html = analyticsView(); break;
      case 'topics': setTop('Konu kütüphanesi', id ? `#/exam/${id}/key` : '#/settings'); html = Topics.libraryView(); break;
      case 'exam': html = b === 'key' ? keyView(id, +c || 0) : b === 'stats' ? statsView(id, +c || 0) : b === 'send' ? sendView(id) : examView(id); break;
      case 'result': html = resultView(id, +b); break;
      case 'settings': html = settingsView(); break;
      default: html = classesView();
    }
    view.innerHTML = html;
    if (keepScroll === true) window.scrollTo(0, y);
  }

  let lastHash = '';
  window.addEventListener('hashchange', () => {
    render();
    if (location.hash !== lastHash) window.scrollTo(0, 0);
    lastHash = location.hash;
  });

  view.addEventListener('click', (ev) => {
    const analyticsFilter = ev.target.closest('[data-analytics-class]');
    if (analyticsFilter) { analyticsClasses = [+analyticsFilter.dataset.analyticsClass]; analyticsExams = analyticsFilter.dataset.analyticsExam.split(',').filter(Boolean).map(Number); render(true); return; }
    const filter = ev.target.closest('[data-exam-class]');
    if (filter) { examClassFilter = filter.dataset.examClass; updateExamResults(); return; }
    if (ev.target.closest('[data-reset-exams]')) {
      examClassFilter = ''; examSearch = ''; $('#exam-search').value = ''; updateExamResults(); return;
    }
    const sent = ev.target.closest('[data-sent]');
    if (sent) {
      // Bağlantı yeni sekmede/uygulamada açılır; burada yalnızca gönderildi olarak işaretle
      Store.markSent(+sent.dataset.e, +sent.dataset.s, sent.dataset.sent);
      setTimeout(() => render(true), 300);
      return;
    }
    const img = ev.target.closest('[data-img]');
    if (img) { sendImage(img.dataset.img, +img.dataset.e, +img.dataset.s); return; }
    const fmtBtn = ev.target.closest('[data-fmt]');
    if (fmtBtn) {
      const o = sendOpts();
      o.format = fmtBtn.dataset.fmt;
      try { localStorage.setItem(SEND_KEY, JSON.stringify(o)); } catch (e) { /* yok say */ }
      render(true);
      return;
    }
    const go = ev.target.closest('[data-go]');
    if (go) { location.hash = go.dataset.go; return; }
    const t = ev.target.closest('[data-act]');
    if (!t) return;
    const d = t.dataset, id = +d.id;
    switch (d.act) {
      case 'new-class': classForm(null); break;
      case 'edit-class': classForm(Store.getClass(id)); break;
      case 'pdf': makePDF(id); break;
      case 'codes-pdf': makeCodesPDF(id); break;
      case 'add-students': addStudents(id); break;
      case 'edit-student': studentForm(id); break;
      case 'del-class': confirmBox('Sınıf silinsin mi?', 'Sınıftaki tüm öğrenciler, sınavlar ve sonuçlar silinecek. Bu işlem geri alınamaz.', 'Sil', () => { Store.deleteClass(id); location.hash = '#/classes'; }); break;
      case 'new-exam': examForm(null, d.class ? +d.class : null); break;
      case 'edit-exam': examForm(Store.getExam(id)); break;
      case 'copy-exam': copyExamForm(id); break;
      case 'pick-classes': analyticsClassPicker(); break;
      case 'pick-exams': analyticsExamPicker(); break;
      case 'absent': Store.setAbsent(id, +d.s, !!d.on); render(true); break;
      case 'del-exam': confirmBox('Sınav silinsin mi?', 'Bu sınavın tüm sonuçları silinecek.', 'Sil', () => { Store.deleteExam(id); location.hash = '#/exams'; }); break;
      case 'scan': {
        const e = Store.getExam(id);
        if (Store.keyEmpty(e)) toast('Not: cevap anahtarı girilmemiş; sonuçlar anahtar girilince hesaplanır');
        Scanner.open(id, 'grade', render);
        break;
      }
      case 'scan-key': Scanner.open(id, 'key', () => { render(); }); break;
      case 'key-set': {
        const e = Store.getExam(id), q = +d.q, o = +d.o, bk = +d.b || 0;
        const key = Store.keyFor(e, bk).slice();
        key[q] = key[q] === o ? null : o;
        Store.setKey(e, bk, key);
        Store.saveExam(e);
        t.parentElement.querySelectorAll('.opt').forEach((b, j) => b.classList.toggle('on', key[q] === j));
        break;
      }
      case 'set-booklet': {
        const e = Store.getExam(+d.e);
        if (Store.getResult(e.id, +d.s)) Store.setBooklet(e.id, +d.s, +d.b);
        else Store.saveResult(e.id, +d.s, Array(e.questionCount).fill(null), +d.b, [], true);
        render(true);
        break;
      }
      case 'ans-text': applyAnswerText(+d.e, +d.s); break;
      case 'key-text': applyKeyText(id, +d.b || 0); break;
      case 'ans-set': {
        const e = Store.getExam(+d.e), sid = +d.s, q = +d.q, o = +d.o;
        const r = Store.getResult(e.id, sid);
        const answers = r ? r.answers.slice() : Array(e.questionCount).fill(null);
        answers[q] = answers[q] === o ? null : o;
        // Elle düzeltilen soru artık şüpheli sayılmaz
        Store.saveResult(e.id, sid, answers, r ? r.booklet ?? null : null, (r?.uncertain || []).filter((i) => i !== q), !r || !!r.manual);
        const y = window.scrollY;
        render();
        window.scrollTo(0, y);
        break;
      }
      case 'del-result': confirmBox('Sonuç silinsin mi?', 'Öğrencinin bu sınavdaki sonucu silinecek.', 'Sil', () => { Store.deleteResult(+d.e, +d.s); location.hash = `#/exam/${d.e}`; }); break;
      case 'csv': exportCSV(id); break;
      case 'save-meta': saveMeta(id); break;
      case 'send-all': sendAllImages(id); break;
      case 'q-detail': questionDetail(id, +d.b || 0, +d.q); break;
      case 'checked': Store.clearUncertain(+d.e, +d.s); render(true); break;
      case 'edit-name':
        modal('Adınız', `<label class="field"><span>Ad Soyad (velilere giden mesajların sonuna eklenir)</span><input type="text" name="name" value="${esc(window.Cloud?.name || '')}" placeholder="Örn. Ahmet Yılmaz (Matematik Öğretmeni)"></label>`,
          (fd) => { window.Cloud?.setName(fd.get('name').trim()).then(() => toast('Kaydedildi')); });
        break;
      case 'create-user': {
        if (!window.Cloud?.isAdmin) break;
        modal('Yeni kullanıcı oluştur', `<label class="field"><span>Ad soyad (isteğe bağlı)</span><input type="text" name="name" maxlength="100"></label><label class="field"><span>E-posta</span><input type="email" name="email" required autocomplete="off"></label><label class="field"><span>Giriş şifresi (en az 8 karakter)</span><input type="password" name="password" required minlength="8" maxlength="128" autocomplete="new-password"></label><p class="small muted">Kullanıcı bu e-posta ve şifreyle giriş yapabilecek.</p>`, (fd, form) => {
          const button = form.querySelector('.btn.primary'); button.disabled = true;
          window.Cloud.createTeacher({ name: fd.get('name').trim(), email: fd.get('email').trim(), password: fd.get('password') }).then(account => { closeModal(); toast(`${account.email} kullanıcısı oluşturuldu.`); }).catch(error => { button.disabled = false; toast(error.message || 'Kullanıcı oluşturulamadı.'); });
          return false;
        }, 'Kullanıcı oluştur');
        break;
      }
      case 'logout': confirmBox('Çıkış yapılsın mı?', 'Veriler bulutta kalır; tekrar giriş yapınca geri gelir.', 'Çıkış yap', () => { window.Cloud.logout(); location.hash = '#/classes'; }); break;
      case 'install': installApp(); break;
      case 'install-hide':
        try { localStorage.setItem(INSTALL_HIDE, '1'); } catch (e) { /* yok say */ }
        render(true);
        break;
      case 'backup': download(`optik-yedek-${today()}.json`, Store.exportJSON(), 'application/json'); break;
    }
  });

  $('#top-actions').addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-act]');
    if (!t) return;
    const id = +t.dataset.id;
    if (t.dataset.act === 'new-class') classForm(null);
    else if (t.dataset.act === 'edit-class') classForm(Store.getClass(id));
    else if (t.dataset.act === 'new-exam') examForm(null);
    else if (t.dataset.act === 'edit-exam') examForm(Store.getExam(id));
    else if (t.dataset.act === 'edit-student') studentForm(id);
  });

  view.addEventListener('input', (ev) => {
    if (ev.target.id === 'exam-search') { examSearch = ev.target.value; updateExamResults(); }
  });
  view.addEventListener('change', (ev) => {
    if (ev.target.dataset.opt) {
      const o = sendOpts();
      o[ev.target.dataset.opt] = ev.target.checked;
      try { localStorage.setItem(SEND_KEY, JSON.stringify(o)); } catch (e) { /* yok say */ }
      render(true);
      return;
    }
    if (ev.target.id !== 'restore') return;
    const file = ev.target.files[0];
    if (!file) return;
    confirmBox('Yedek yüklensin mi?', 'Hesaptaki mevcut tüm verilerin yerine yedekteki veriler gelecek (bulutta da).', 'Yükle', () => {
      file.text().then((txt) => {
        try { Store.importJSON(txt); toast('Yedek yüklendi'); location.hash = '#/classes'; render(); } catch (e) { toast('Hata: ' + e.message); }
      });
    });
  });

  // Ana ekrana eklenmemiş Safari'de veriler silinebilir; kalıcı depolama iste
  navigator.storage?.persist?.().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  Topics.bind(view, { modal, closeModal, confirmBox, toast, render });
  Papers.bind(view, { modal, closeModal, confirmBox, toast, render, setTop, classColor, fmtDate });
  window.App = { render };
  render();
  lastHash = location.hash;
})();
