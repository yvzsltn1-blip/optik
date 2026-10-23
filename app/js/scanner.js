// Kamera ekranı: canlı görüntüden form okur, sonucu gösterir ve kaydeder.
// mode 'grade' → öğrenci sonucu; mode 'key' → okunan form cevap anahtarı olur.
// Okuma ayrı iş parçacığında (omr-worker.js) yapılır. Aynı formun ardışık karelerindeki koyuluk
// değerlerinin ortalaması alınır; kararlar iki kare üst üste aynı çıkınca kabul edilir. Eşiğe çok
// yakın (şüpheli) işaretler varsa birkaç kare daha beklenir, yine de çözülmezse otomatik kayıt
// durur ve öğretmene gösterilir.
// Kesilmemiş bir sayfada birden fazla form görünüyorsa, henüz kaydedilmemiş olan sırayla okunur.
const Scanner = (() => {
  const MAX_DIM = 1280;
  const MIN_FRAMES = 2;        // kabul için en az kare
  const UNSURE_FRAMES = 5;     // şüpheli işaret varsa beklenecek kare
  const $ = (id) => document.getElementById(id);
  const el = {
    root: $('scanner'), video: $('scan-video'), overlay: $('scan-overlay'), exam: $('scan-exam'),
    count: $('scan-count'), status: $('scan-status'), card: $('scan-card'), auto: $('scan-auto'),
    file: $('scan-file'), torch: $('scan-torch'), manual: $('scan-manual'),
    unpeek: $('scan-unpeek'),
  };
  const work = document.createElement('canvas');
  const wctx = work.getContext('2d', { willReadFrequently: true });

  let state = null;

  // Otomatik kayıt ilk kullanımda açık; şüpheli formlarda zaten durur
  try { el.auto.checked = localStorage.getItem('optik-auto') !== '0'; } catch (e) { el.auto.checked = true; }
  el.auto.addEventListener('change', () => {
    try { localStorage.setItem('optik-auto', el.auto.checked ? '1' : '0'); } catch (e) { /* yok say */ }
  });

  // --- Okuyucu: mümkünse Web Worker, değilse ana iş parçacığı ---
  let worker = null, seq = 0;
  const waiting = new Map();
  try {
    worker = new Worker('js/omr-worker.js');
    worker.onmessage = (e) => { const cb = waiting.get(e.data.seq); waiting.delete(e.data.seq); cb?.(e.data.res); };
    worker.onerror = () => { worker = null; waiting.forEach((cb) => cb({ ok: false, reason: 'error' })); waiting.clear(); };
  } catch (e) { worker = null; }
  const knownIds = () => Store.classes().flatMap((c) => Store.students(c.id).map((s) => s.id));
  const specOf = (exam) => ({ format: exam.format, questionCount: exam.questionCount, optionCount: exam.optionCount, booklets: exam.booklets });
  function read(img) {
    const spec = specOf(state.exam), known = knownIds();
    if (!worker) { const ids = new Set(known); return Promise.resolve(OMR.readAll(img, spec, (id) => ids.has(id))); }
    return new Promise((resolve) => {
      const n = ++seq;
      waiting.set(n, resolve);
      worker.postMessage({ seq: n, img, spec, known }, [img.data.buffer]);
    });
  }

  async function open(examId, mode, onDone) {
    const exam = Store.getExam(examId);
    state = {
      exam, mode, onDone, stream: null, frozen: null, pending: null, photo: null, busy: false,
      saved: new Set(), fused: new Map(), quietSince: 0, timer: 0, audio: null, torchOn: false,
    };
    el.root.hidden = false;
    document.body.style.overflow = 'hidden';
    el.exam.textContent = exam.name + (mode === 'key' ? ' · Cevap anahtarı' : '');
    el.card.hidden = true;
    el.status.hidden = false;
    el.auto.parentElement.hidden = mode === 'key';
    el.manual.hidden = mode === 'key';
    updateCount();
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) state.audio = new AC();
    } catch (e) { /* ses isteğe bağlı */ }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus(location.protocol === 'https:' ? 'Bu tarayıcı kamerayı desteklemiyor' : 'Kamera için sayfa HTTPS ile açılmalı. "Fotoğraftan" ile okutabilirsiniz.', 'bad');
      return;
    }
    setStatus('Kamera açılıyor…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (!state) { stream.getTracks().forEach((t) => t.stop()); return; }
      state.stream = stream;
      el.video.srcObject = stream;
      await el.video.play();
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      el.torch.hidden = !caps.torch;
      try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (e) { /* desteklenmiyor */ }
      setStatus('Formu çerçeveye yerleştirin, 4 siyah köşe görünsün');
      loop();
    } catch (e) {
      setStatus('Kamera açılamadı: ' + (e.name === 'NotAllowedError' ? 'izin verilmedi' : e.message) + '. "Fotoğraftan" ile okutabilirsiniz.', 'bad');
    }
  }

  function close() {
    if (!state) return;
    clearTimeout(state.timer);
    state.stream?.getTracks().forEach((t) => t.stop());
    state.audio?.close?.();
    const done = state.onDone;
    state = null;
    el.video.srcObject = null;
    el.root.hidden = true;
    el.torch.hidden = true;
    peek(false);
    document.body.style.overflow = '';
    clearOverlay();
    done?.();
  }

  function setStatus(text, kind) {
    el.status.textContent = text;
    el.status.className = 'scan-status' + (kind ? ' ' + kind : '');
  }

  function updateCount() {
    if (!state || state.mode === 'key') { el.count.textContent = ''; return; }
    const total = Store.students(state.exam.classId).length;
    el.count.textContent = `Okutulan: ${Store.results(state.exam.id).length} / ${total}`;
  }

  function grab(source, sw, sh) {
    const s = Math.min(1, MAX_DIM / Math.max(sw, sh));
    work.width = Math.round(sw * s);
    work.height = Math.round(sh * s);
    wctx.drawImage(source, 0, 0, work.width, work.height);
    return wctx.getImageData(0, 0, work.width, work.height);
  }

  // Bir kare okunurken yenisi alınmaz; okuma biter bitmez sıradaki kare işlenir.
  async function loop() {
    if (!state) return;
    const v = el.video;
    if (!state.busy && !state.frozen && v.readyState >= 2 && v.videoWidth) {
      state.busy = true;
      const img = grab(v, v.videoWidth, v.videoHeight);
      const w = img.width, h = img.height;
      const res = await read(img);
      if (state) {
        state.busy = false;
        if (!state.frozen) handle(res, w, h, false);
      }
    }
    if (state) state.timer = setTimeout(loop, 15);
  }

  // Aynı formun karelerini birleştirir: koyuluk değerlerinin ortalamasından yeniden karar verilir.
  function fuse(form) {
    let f = state.fused.get(form.id);
    if (!f || f.sum.length !== form.scores.length) {
      f = { n: 0, sum: form.scores.map((r) => r.map(() => 0)), bsum: form.bookletScores?.map(() => 0) || null, sig: null, stable: 0 };
      state.fused.set(form.id, f);
    }
    // Eski kareler zamanla unutulur (form oynatılırsa yeni görüntü ağır basar)
    if (f.n >= 8) { f.n /= 2; f.sum.forEach((r) => r.forEach((_, j) => (r[j] /= 2))); f.bsum?.forEach((_, j) => (f.bsum[j] /= 2)); }
    f.n++;
    form.scores.forEach((r, i) => r.forEach((v, j) => (f.sum[i][j] += v)));
    if (f.bsum && form.bookletScores) form.bookletScores.forEach((v, j) => (f.bsum[j] += v));
    const scores = f.sum.map((r) => r.map((v) => v / f.n));
    const bookletScores = f.bsum ? f.bsum.map((v) => v / f.n) : null;
    const d = OMR.decide(scores, bookletScores);
    const sig = d.answers.join(',') + '|' + d.booklet;
    f.stable = sig === f.sig ? f.stable + 1 : 0;
    f.sig = sig;
    f.frames = (f.frames || 0) + 1;
    return { ...form, ...d, scores, bookletScores, frames: f.frames, stable: f.stable };
  }

  const unsureCount = (form) => form.uncertain.length + (form.bookletUnsure && Store.bookletCount(state.exam) > 1 ? 1 : 0);

  function handle(res, w, h, fromPhoto) {
    if (!state) return;
    if (!res.ok) {
      drawOverlay(res, null, w, h, fromPhoto);
      if (res.reason === 'nomarkers') {
        if (!state.quietSince) state.quietSince = Date.now();
        // Form bir süre görünmezse: kaydedilenler yeniden okunabilir, birleştirme sıfırlanır
        if (Date.now() - state.quietSince > 800) { state.saved.clear(); state.fused.clear(); }
        setStatus(fromPhoto ? 'Fotoğrafta form bulunamadı' : 'Formu çerçeveye yerleştirin, 4 siyah köşe görünsün', fromPhoto ? 'bad' : '');
      } else if (res.reason === 'unknown') setStatus(`Bu form kayıtlı değil (#${res.id}). Öğrenci silinmiş olabilir.`, 'bad');
      else if (res.reason === 'partial') setStatus('Formun tamamı görünmüyor, biraz uzaklaşın', 'bad');
      else setStatus('Form okunamadı. Kâğıdı düzleştirip net tutun; olmuyorsa "✍️ Elle gir"', 'bad');
      return;
    }
    state.quietSince = 0;
    const inClass = (f) => state.mode === 'key' || Store.getStudent(f.id).classId === state.exam.classId;
    const todo = res.forms.filter((f) => !state.saved.has(f.id)).sort((a, b) => inClass(b) - inClass(a));
    let form = todo[0];
    if (!form) {
      drawOverlay(res, el.root.classList.contains('peek') ? res.forms[0] : null, w, h, fromPhoto);
      const many = res.forms.length > 1;
      setStatus(many ? 'Görünen formların hepsi kaydedildi ✓' : `${Store.getStudent(res.forms[0].id).name} kaydedildi ✓ Sıradaki formu gösterin`, 'ok');
      if (fromPhoto) setTimeout(() => { if (state?.photo) resume(); }, 1800);
      return;
    }
    const student = Store.getStudent(form.id);
    if (!inClass(form)) {
      drawOverlay(res, form, w, h, fromPhoto);
      setStatus(`${student.name} bu sınavın sınıfında değil`, 'bad');
      return;
    }
    if (!fromPhoto) form = fuse(form);
    drawOverlay(res, form, w, h, fromPhoto);
    if (!fromPhoto) {
      const unsure = unsureCount(form);
      const ready = form.frames >= MIN_FRAMES && form.stable >= 1 && (!unsure || form.frames >= UNSURE_FRAMES);
      if (!ready) {
        setStatus(unsure ? 'Bazı işaretler belirsiz, sabit tutun…' : 'Okunuyor, sabit tutun…');
        return;
      }
    }
    accept(form, student, fromPhoto, todo.length - 1);
  }

  function accept(form, student, fromPhoto, more) {
    beep();
    const exam = state.exam;
    const answers = form.answers.slice(0, exam.questionCount);
    while (answers.length < exam.questionCount) answers.push(null);
    const uncertain = form.uncertain.filter((i) => i < exam.questionCount);
    state.fused.delete(form.id);

    const nb = Store.bookletCount(exam);
    if (state.mode === 'key') {
      state.frozen = true;
      el.video.pause();
      const filled = answers.filter((a) => a != null && a >= 0).length;
      const multi = answers.filter((a) => a === -1).length;
      state.pending = answers.map((a) => (a === -1 ? null : a));
      // Kitapçıklı sınavda okunan kitapçık işareti hangi anahtarın girileceğini belirler
      const read = nb > 1 && form.booklet >= 0 ? form.booklet : null;
      const buttons = nb > 1
        ? Array.from({ length: nb }, (_, b) => `<button class="btn ${b === read ? 'primary' : ''}" data-scan="usekey" data-b="${b}">${Layout.LETTERS[b]} anahtarı yap</button>`).join('')
        : '<button class="btn primary" data-scan="usekey" data-b="0">Anahtar yap</button>';
      showCard(`<div class="name">Cevap anahtarı okundu${read != null ? ` · ${Layout.LETTERS[read]} kitapçığı` : ''}</div>
        <p class="small muted">${filled} soru işaretli${multi ? `, ${multi} soruda birden fazla işaret var (iptal sayılacak)` : ''}. Boş sorular iptal kabul edilir.${nb > 1 && read == null ? ' Formda kitapçık işaretlenmemiş; hangi kitapçığın anahtarı olduğunu seçin.' : ''}</p>
        ${uncertain.length ? `<p class="small" style="color:var(--warn)">⚠ Belirsiz okunan sorular: ${uncertain.map((i) => i + 1).join(', ')} — anahtarı kaydettikten sonra kontrol edin.</p>` : ''}
        <div class="btns">${buttons}</div><button class="btn block" style="margin-top:10px" data-scan="retry">Tekrar oku</button>`);
      return;
    }

    const prev = Store.getResult(exam.id, student.id);
    const booklet = nb > 1 ? form.booklet : null;
    const sc = Store.scoreResult(exam, { answers, booklet });
    state.pending = { student, answers, booklet, uncertain };
    const main = Store.mainScore(exam, sc);
    const grid = answerGrid(exam, answers, Store.bookletOf(exam, { booklet }), sc.per, uncertain);
    const nums = `<div class="nums"><div><b style="color:var(--ok)">${sc.correct}</b><span>Doğru</span></div><div><b style="color:var(--bad)">${sc.wrong}</b><span>Yanlış</span></div><div><b>${sc.blank}</b><span>Boş</span></div><div><b>${fmt(main)}</b><span>${Store.mainLabel(exam)}</span></div></div>`;
    const multi = answers.filter((a) => a === -1).length;
    const bkLabel = nb < 2 ? '' : booklet >= 0 && booklet != null ? `<span class="pill ok">${Layout.LETTERS[booklet]} kitapçığı</span>`
      : `<span class="pill bad">Kitapçık ${booklet === -1 ? 'çift işaretli' : 'işaretlenmemiş'} · A sayıldı</span>`;
    const notes = [
      bkLabel,
      uncertain.length ? `<span class="pill warn">⚠ Kontrol edin: ${uncertain.map((i) => i + 1).join(', ')}</span>` : '',
      form.bookletUnsure && nb > 1 ? '<span class="pill warn">⚠ Kitapçık işareti belirsiz</span>' : '',
      Store.keyEmpty(exam) ? '<span class="pill warn">Cevap anahtarı girilmemiş</span>' : '',
      multi ? `<span class="pill warn">${multi} soruda çift işaret</span>` : '',
      prev ? '<span class="pill">Önceki sonucun üzerine yazılır</span>' : '',
      more > 0 ? `<span class="pill">Sayfada ${more} form daha var</span>` : '',
    ].join(' ');

    // Otomatik kayıt: belirsiz işaret yoksa ve kitapçık sorunu yoksa durmadan kaydet
    const needsLook = uncertain.length || (nb > 1 && (booklet == null || booklet < 0 || form.bookletUnsure));
    if (el.auto.checked && !fromPhoto && !needsLook) {
      Store.saveResult(exam.id, student.id, answers, booklet, uncertain);
      state.saved.add(student.id);
      state.pending = null;
      updateCount();
      showCard(`<div class="row"><div class="grow name">${esc(student.name)}</div><span class="pill ok">Kaydedildi</span></div>${nums}${grid}<div class="row small">${notes}<a href="#/result/${exam.id}/${student.id}" data-scan="edit" class="grow" style="text-align:right">Düzelt ›</a></div>
        <button class="btn block" style="margin-top:8px" data-scan="peek">👁 Formda gör</button>`);
      el.status.hidden = false;
      setStatus(`${student.name} kaydedildi ✓`, 'ok');
      return;
    }
    state.frozen = true;
    el.video.pause();
    showCard(`<div class="name">${esc(student.name)}</div><div class="small muted">${esc(student.number ? 'No ' + student.number : '')}${needsLook && el.auto.checked && !fromPhoto ? ' · otomatik kayıt kontrol için durdu' : ''}</div>${nums}${grid}<div class="row small">${notes}</div>
      <div class="btns"><button class="btn" data-scan="retry">${fromPhoto ? 'Kapat' : 'Tekrar oku'}</button><button class="btn primary" data-scan="save">Kaydet</button></div>
      <div class="btns" style="margin-top:8px"><button class="btn" data-scan="peek">👁 Formda gör</button><button class="btn" data-scan="save-edit">Kaydet ve düzelt ›</button></div>`);
  }

  // Okunamayan form için: okutulmamış öğrenci seçilir, cevaplar sonuç sayfasında elle girilir
  function manualPick() {
    const done = new Set(Store.results(state.exam.id).map((r) => r.studentId));
    const list = Store.students(state.exam.classId).filter((s) => !done.has(s.id));
    state.frozen = true;
    el.video.pause();
    clearOverlay();
    showCard(`<div class="name">Elle giriş</div><p class="small muted">Formu okunamayan öğrenciyi seçin; cevaplarını sonuç sayfasında harflere dokunarak ya da yazarak girersiniz.</p>
      ${list.length ? `<div class="chips" style="max-height:40vh;overflow:auto">${list.map((s) => `<a class="chip" href="#/result/${state.exam.id}/${s.id}" data-scan="edit">${esc(s.name)}</a>`).join('')}</div>`
        : '<p class="small">Bu sınıfta okutulmamış öğrenci kalmadı. Okutulmuş bir sonucu düzeltmek için sınav sayfasındaki listeden öğrenciye dokunun.</p>'}
      <button class="btn block" style="margin-top:10px" data-scan="retry">Vazgeç</button>`);
  }

  // Kartta bütün soruların özeti: işaretlenen şık; yeşil doğru, kırmızı yanlış (yanında doğru cevap),
  // gri boş, çizgili iptal; belirsiz okunanlar sarı çerçeveli
  function answerGrid(exam, answers, bk, per, uncertain) {
    const key = Store.keyFor(exam, bk), unsure = new Set(uncertain), noKey = Store.keyEmpty(exam);
    const L = Layout.LETTERS;
    return `<div class="qa-grid">${answers.map((a, i) => {
      const p = per[i], mark = a == null ? '–' : a === -1 ? '✱' : L[a];
      const cls = a == null ? 'blank' : noKey ? '' : p === 'd' ? 'ok' : p === 'y' ? 'bad' : 'off';
      const fix = p === 'y' && key[i] != null ? `<small>${L[key[i]]}</small>` : '';
      return `<span class="qa ${cls}${unsure.has(i) ? ' unsure' : ''}"><i>${i + 1}</i>${mark}${fix}</span>`;
    }).join('')}</div>`;
  }

  // Önizleme: kart ve düğmeler gizlenir, ekranda yalnız form ve üzerindeki doğru/yanlış işaretleri kalır
  function peek(on) {
    el.root.classList.toggle('peek', on);
    el.unpeek.hidden = !on;
  }

  function showCard(html) {
    peek(false);
    el.card.innerHTML = html;
    el.card.hidden = false;
    el.status.hidden = true;
  }

  function resume() {
    if (!state) return;
    state.frozen = null;
    state.pending = null;
    state.photo = null;
    peek(false);
    el.card.hidden = true;
    el.status.hidden = false;
    clearOverlay();
    el.video.play().catch(() => {});
  }

  // Görüntü koordinatlarından ekran koordinatlarına: video 'cover', fotoğraf 'contain' yerleşir
  function drawOverlay(res, chosen, w, h, fromPhoto) {
    const c = el.overlay;
    const dpr = window.devicePixelRatio || 1;
    const cw = c.clientWidth, ch = c.clientHeight;
    if (c.width !== cw * dpr || c.height !== ch * dpr) { c.width = cw * dpr; c.height = ch * dpr; }
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const s = fromPhoto ? Math.min(cw / w, ch / h) : Math.max(cw / w, ch / h);
    const ox = (cw - w * s) / 2, oy = (ch - h * s) / 2;
    if (fromPhoto) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(work, ox, oy, w * s, h * s);
    }
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    const lw = 3 / s;
    const quad = (pts, color) => {
      ctx.lineWidth = lw;
      ctx.strokeStyle = color;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.stroke();
    };
    if (!res.ok) { if (res.corners) quad(res.corners, '#ffb340'); return; }
    for (const f of res.forms) if (!chosen || f.id !== chosen.id) quad(f.corners, state?.saved.has(f.id) ? 'rgba(60,207,122,.5)' : 'rgba(255,255,255,.6)');
    if (!chosen || !state) return;
    quad(chosen.corners, '#3ccf7a');
    const fmtR = Layout.fmtOf(state.exam.format).grid.r;
    const key = state.mode === 'grade' ? Store.keyFor(state.exam, Store.bookletOf(state.exam, chosen)) : [];
    const [ax, ay] = OMR.project(chosen.H, 50, 70), [bx, by] = OMR.project(chosen.H, 50 + fmtR, 70);
    const r = Math.hypot(bx - ax, by - ay) || 4;
    const unsure = new Set(chosen.uncertain);
    chosen.centers.forEach((row, i) => {
      if (i >= state.exam.questionCount) return;
      const a = chosen.answers[i], k = key[i];
      row.forEach(([mx, my], j) => {
        const marked = a === j || (a === -1 && chosen.scores[i][j] >= chosen.threshold);
        const [x, y] = OMR.project(chosen.H, mx, my);
        if (unsure.has(i) && (marked || chosen.scores[i][j] >= chosen.threshold - 0.08)) {
          // Belirsiz: sarı kalın halka
          ctx.beginPath();
          ctx.arc(x, y, r * 1.45, 0, Math.PI * 2);
          ctx.lineWidth = lw * 1.2;
          ctx.strokeStyle = '#ffd60a';
          ctx.stroke();
        }
        if (!marked && !(k === j && a !== k)) return;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.15, 0, Math.PI * 2);
        if (marked) {
          ctx.fillStyle = a === -1 ? 'rgba(255,179,64,.75)' : k == null ? 'rgba(74,155,255,.7)' : a === k ? 'rgba(60,207,122,.75)' : 'rgba(255,97,89,.8)';
          ctx.fill();
        } else {
          ctx.lineWidth = lw * 0.8;
          ctx.strokeStyle = '#3ccf7a';
          ctx.stroke();
        }
      });
    });
  }

  function clearOverlay() {
    const c = el.overlay;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
  }

  function beep() {
    const a = state?.audio;
    if (!a) return;
    try {
      a.resume?.();
      const o = a.createOscillator(), g = a.createGain();
      o.frequency.value = 1320;
      g.gain.setValueAtTime(0.15, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.15);
      o.connect(g).connect(a.destination);
      o.start();
      o.stop(a.currentTime + 0.16);
    } catch (e) { /* sessiz devam */ }
    navigator.vibrate?.(60);
  }

  async function toggleTorch() {
    const track = state?.stream?.getVideoTracks()[0];
    if (!track) return;
    state.torchOn = !state.torchOn;
    try { await track.applyConstraints({ advanced: [{ torch: state.torchOn }] }); } catch (e) { /* desteklenmiyor */ }
  }

  function readPhoto(file) {
    if (!file || !state) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      URL.revokeObjectURL(url);
      if (!state) return;
      state.frozen = true;
      el.card.hidden = true;
      el.status.hidden = false;
      el.video.pause();
      setStatus('Fotoğraf okunuyor…');
      const data = grab(img, img.naturalWidth, img.naturalHeight);
      const w = data.width, h = data.height;
      const res = await read(data);
      if (!state) return;
      state.photo = { res, w, h };
      handle(res, w, h, true);
      // Okunamadıysa mesajı bir süre gösterip canlı kameraya dön
      if (el.card.hidden && !res.ok) setTimeout(() => { if (state?.photo?.res === res) resume(); }, 2500);
    };
    img.onerror = () => setStatus('Fotoğraf açılamadı', 'bad');
    img.src = url;
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '')).replace('.', ',');

  el.root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-scan]');
    if (!t || !state) return;
    const act = t.dataset.scan;
    if (act === 'close') close();
    else if (act === 'torch') toggleTorch();
    else if (act === 'retry') resume();
    else if (act === 'manual') manualPick();
    else if (act === 'peek') peek(true);
    else if (act === 'unpeek') peek(false);
    else if (act === 'save-edit') {
      const { student, answers, booklet, uncertain } = state.pending;
      const examId = state.exam.id;
      Store.saveResult(examId, student.id, answers, booklet, uncertain);
      close();
      location.hash = `#/result/${examId}/${student.id}`;
    } else if (act === 'save') {
      const { student, answers, booklet, uncertain } = state.pending;
      Store.saveResult(state.exam.id, student.id, answers, booklet, uncertain);
      state.saved.add(student.id);
      updateCount();
      const photo = state.photo;
      if (photo) {
        // Fotoğrafta başka form varsa sıradakini göster
        state.pending = null;
        el.card.hidden = true;
        el.status.hidden = false;
        handle(photo.res, photo.w, photo.h, true);
      } else {
        resume();
        setStatus(`${student.name} kaydedildi ✓ Sıradaki formu gösterin`, 'ok');
      }
    } else if (act === 'usekey') {
      const exam = Store.getExam(state.exam.id);
      Store.setKey(exam, +t.dataset.b, state.pending);
      Store.saveExam(exam);
      close();
    } else if (act === 'edit') {
      e.preventDefault();
      const href = t.getAttribute('href');
      close();
      location.hash = href;
    }
  });
  el.file.addEventListener('change', () => {
    readPhoto(el.file.files[0]);
    el.file.value = '';
  });
  document.addEventListener('visibilitychange', () => {
    if (state && document.visibilityState === 'visible' && !state.frozen) el.video.play().catch(() => {});
  });

  return { open, close };
})();
