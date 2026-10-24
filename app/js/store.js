// Veriler bellekte tutulur, localStorage'a önbelleklenir ve (giriş yapılmışsa) cloud.js
// aracılığıyla Firestore'a yazılır. Her değişiklik emit() ile bildirilir.
const Store = (() => {
  const KEY = 'optik-okuyucu-v1';
  const KINDS = ['classes', 'students', 'exams', 'results', 'papers'];
  let db = load();
  let sink = null; // (op: 'put'|'del', kind, obj) → buluta yazar

  function empty() {
    return { version: 1, nextId: 1, classes: [], students: [], exams: [], results: [], papers: [] };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return migrate(Object.assign(empty(), JSON.parse(raw)));
    } catch (e) { console.error(e); }
    return empty();
  }

  // İlk sürümde şık sayısı sınıfta tutuluyordu; artık form ayarları sınava ait.
  function migrate(d) {
    for (const e of d.exams) {
      if (e.optionCount == null) e.optionCount = d.classes.find((c) => c.id === e.classId)?.optionCount || 5;
      if (!e.format) e.format = 'a4';
      if (!e.booklets) e.booklets = 1;
    }
    recalcNextId(d);
    return d;
  }

  // Kodlar birden fazla cihazda üretilebildiği için sıradaki kod, bilinen en büyük koddan türetilir.
  function recalcNextId(d) {
    let max = 0;
    for (const k of ['classes', 'students', 'exams']) for (const x of d[k]) max = Math.max(max, x.id);
    d.nextId = Math.max(d.nextId || 1, max + 1);
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.error(e); }
  }

  const emit = (op, kind, obj) => sink?.(op, kind, obj);
  const newId = () => db.nextId++;
  const byId = (list, id) => list.find((x) => x.id === id);

  // --- Sınıflar ---
  // Öğretmenin sürükleyerek verdiği sıra (order); sırası olmayanlar eklenme sırasıyla sonda.
  const classes = () => db.classes.slice().sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9));
  // Renk için eklenme sırası: sınıfların yeri değişince renkleri değişmesin
  const classIndex = (id) => db.classes.findIndex((c) => c.id === id);
  const getClass = (id) => byId(db.classes, id);
  function reorderClasses(ids) {
    ids.forEach((id, i) => {
      const c = getClass(id);
      if (!c || c.order === i) return;
      c.order = i;
      emit('put', 'classes', c);
    });
    save();
  }
  function saveClass(c) {
    if (c.id) c = Object.assign(getClass(c.id), c);
    else { c.id = newId(); db.classes.push(c); }
    save();
    emit('put', 'classes', c);
    return c;
  }
  function deleteClass(id) {
    const exams = db.exams.filter((e) => e.classId === id);
    const examIds = new Set(exams.map((e) => e.id));
    db.results.filter((r) => examIds.has(r.examId)).forEach((r) => emit('del', 'results', r));
    exams.forEach((e) => emit('del', 'exams', e));
    db.students.filter((s) => s.classId === id).forEach((s) => {
      db.results.filter((r) => r.studentId === s.id && !examIds.has(r.examId)).forEach((r) => emit('del', 'results', r));
      emit('del', 'students', s);
    });
    emit('del', 'classes', getClass(id));
    const studentIds = new Set(db.students.filter((s) => s.classId === id).map((s) => s.id));
    db.results = db.results.filter((r) => !examIds.has(r.examId) && !studentIds.has(r.studentId));
    db.exams = db.exams.filter((e) => e.classId !== id);
    db.students = db.students.filter((s) => s.classId !== id);
    db.classes = db.classes.filter((c) => c.id !== id);
    unlinkExams(examIds);
    save();
  }

  // --- Öğrenciler (öğrenci id'si optik formdaki kodun kendisidir) ---
  const students = (classId) => db.students
    .filter((s) => s.classId === classId)
    .sort((a, b) => (+a.number || 1e9) - (+b.number || 1e9) || a.name.localeCompare(b.name, 'tr'));
  const getStudent = (id) => byId(db.students, id);
  // Veli kodu: velinin matematik.win'de sonuçları görmek için girdiği 8 haneli rastgele sayı.
  // Kod tahmin edilemesin diye kriptografik rastgelelik kullanılır. Başka öğretmenin aldığı bir
  // koda denk gelinirse cloud.js yenisini verir.
  function newParentCode(taken = new Set()) {
    const used = new Set(db.students.map((s) => s.parentCode));
    const buf = new Uint32Array(1);
    for (;;) {
      crypto.getRandomValues(buf);
      const code = String(10000000 + (buf[0] % 90000000));
      if (!used.has(code) && !taken.has(code)) return code;
    }
  }
  function addStudent(classId, name, number) {
    if (db.nextId > 65535) throw new Error('Kod sınırına ulaşıldı');
    const s = { id: newId(), classId, name, number: number || '', parentCode: newParentCode() };
    db.students.push(s);
    save();
    emit('put', 'students', s);
    return s;
  }
  function updateStudent(id, fields) {
    const s = Object.assign(getStudent(id), fields);
    save();
    emit('put', 'students', s);
  }
  function deleteStudent(id) {
    db.results.filter((r) => r.studentId === id).forEach((r) => emit('del', 'results', r));
    emit('del', 'students', getStudent(id));
    db.results = db.results.filter((r) => r.studentId !== id);
    db.students = db.students.filter((s) => s.id !== id);
    save();
  }

  // --- Sınavlar ---
  const exams = (classId) => db.exams
    .filter((e) => classId == null || e.classId === classId)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
  const getExam = (id) => byId(db.exams, id);
  function saveExam(e) {
    if (e.id) e = Object.assign(getExam(e.id), e);
    else { e.id = newId(); db.exams.push(e); }
    save();
    emit('put', 'exams', e);
    return e;
  }
  function deleteExam(id) {
    db.results.filter((r) => r.examId === id).forEach((r) => emit('del', 'results', r));
    emit('del', 'exams', getExam(id));
    db.results = db.results.filter((r) => r.examId !== id);
    db.exams = db.exams.filter((e) => e.id !== id);
    unlinkExams(new Set([id]));
    save();
  }
  // Sınava hiç girmeyecek öğrenciler (exam.absent): okutulmayanlarda görünmez, ortalamaya ve
  // okuma oranına katılmaz. Öğrencinin sonucu okutulursa işaret kendiliğinden kalkar.
  const isAbsent = (exam, studentId) => !!exam?.absent?.includes(studentId);
  const roster = (exam) => students(exam.classId).filter((s) => !isAbsent(exam, s.id));
  function setAbsent(examId, studentId, on) {
    const e = getExam(examId);
    if (!e || isAbsent(e, studentId) === on) return;
    e.absent = on ? [...(e.absent || []), studentId] : e.absent.filter((x) => x !== studentId);
    save();
    emit('put', 'exams', e);
  }

  // --- Sınav kâğıtları (soru dosyaları) ---
  // Bir kâğıt birden çok sınava bağlanabilir (ör. 5A, 5B, 5C'nin ortak yazılısı); dosyalar bir kez
  // yüklenir. Dosyaların kendisi Firebase Storage'da durur, burada yalnızca adresleri tutulur.
  // Kimlik metindir: optik formdaki öğrenci kodlarıyla aynı sayaçtan pay almasın.
  const papers = () => db.papers.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const getPaper = (id) => db.papers.find((p) => p.id === id);
  const examPapers = (examId) => papers().filter((p) => p.examIds?.includes(examId));
  const newPaperId = () => 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  function savePaper(p) {
    const old = p.id && getPaper(p.id);
    if (old) p = Object.assign(old, p);
    else { p.id = p.id || newPaperId(); p.createdAt = new Date().toISOString(); db.papers.push(p); }
    save();
    emit('put', 'papers', p);
    return p;
  }
  function deletePaper(id) {
    emit('del', 'papers', getPaper(id));
    db.papers = db.papers.filter((p) => p.id !== id);
    save();
  }
  // Silinen sınavlar kâğıtlardan çıkarılır; kâğıdın kendisi arşivde kalır.
  function unlinkExams(ids) {
    for (const p of db.papers) {
      if (!p.examIds?.some((x) => ids.has(x))) continue;
      p.examIds = p.examIds.filter((x) => !ids.has(x));
      emit('put', 'papers', p);
    }
  }

  // --- Sonuçlar ---
  const results = (examId) => db.results.filter((r) => r.examId === examId);
  const studentResults = (studentId) => db.results.filter((r) => r.studentId === studentId);
  const getResult = (examId, studentId) => db.results.find((r) => r.examId === examId && r.studentId === studentId);
  // booklet: okunan kitapçık indeksi; null = işaretlenmemiş, -1 = birden fazla işaret
  // uncertain: okuyucunun emin olamadığı soruların indeksleri (öğretmen kontrol etsin diye)
  // manual: cevaplar optik okutulmadan elle girildi
  function saveResult(examId, studentId, answers, booklet = null, uncertain = [], manual = false) {
    let r = getResult(examId, studentId);
    if (!r) { r = { examId, studentId }; db.results.push(r); }
    r.answers = answers;
    r.booklet = booklet;
    r.uncertain = uncertain;
    if (manual) r.manual = true; else delete r.manual;
    r.scannedAt = new Date().toISOString();
    save();
    emit('put', 'results', r);
    setAbsent(examId, studentId, false);
    return r;
  }
  // Öğretmen kontrol ettiğinde şüpheli işaretini kaldırır (q verilmezse hepsini)
  function clearUncertain(examId, studentId, q) {
    const r = getResult(examId, studentId);
    if (!r || !r.uncertain?.length) return;
    r.uncertain = q == null ? [] : r.uncertain.filter((i) => i !== q);
    save();
    emit('put', 'results', r);
  }

  // Kitapçığı elle düzeltme (öğrenci işaretlemeyi unuttuysa)
  function setBooklet(examId, studentId, booklet) {
    const r = getResult(examId, studentId);
    if (!r) return;
    r.booklet = booklet;
    save();
    emit('put', 'results', r);
  }

  function deleteResult(examId, studentId) {
    const r = getResult(examId, studentId);
    if (r) emit('del', 'results', r);
    db.results = db.results.filter((x) => x !== r);
    save();
  }

  // Kitapçıklar: exam.key A kitapçığının, exam.extraKeys[0..2] B, C, D kitapçıklarının anahtarıdır.
  const bookletCount = (exam) => Math.max(1, Math.min(4, exam.booklets | 0 || 1));
  // Puanlamada kullanılacak kitapçık: işaretlenmemiş ya da çift işaretliyse A varsayılır
  const bookletOf = (exam, r) => (bookletCount(exam) > 1 && r && r.booklet >= 0 && r.booklet < bookletCount(exam) ? r.booklet : 0);
  function keyFor(exam, booklet) {
    if (!booklet) return exam.key;
    const k = exam.extraKeys?.[booklet - 1];
    return k && k.length ? k : Array(exam.questionCount).fill(null);
  }
  function setKey(exam, booklet, key) {
    if (!booklet) { exam.key = key; return; }
    exam.extraKeys = Array.from({ length: bookletCount(exam) - 1 }, (_, i) => exam.extraKeys?.[i] || Array(exam.questionCount).fill(null));
    exam.extraKeys[booklet - 1] = key;
  }
  const keyEmpty = (exam) => Array.from({ length: bookletCount(exam) }, (_, b) => keyFor(exam, b)).every((k) => k.every((x) => x == null));

  // Puanlama. answers/key: seçenek indeksi; null = boş, -1 = birden fazla işaret.
  // Cevap anahtarında boş bırakılan soru iptal sayılır ve hesaba katılmaz.
  // booklet verilirse o kitapçığın anahtarı kullanılır.
  // Puan: 100 üzerinden. exam.points verilmişse soru başına ağırlık (yoksa hepsi eşit);
  // yanlış götürme varsa yanlışların puanı da aynı oranda düşülür.
  function score(exam, answers, booklet = 0) {
    let correct = 0, wrong = 0, blank = 0, counted = 0, earned = 0, lost = 0, possible = 0;
    const per = [];
    const key = keyFor(exam, booklet);
    for (let i = 0; i < exam.questionCount; i++) {
      const k = key[i] ?? null, a = answers[i] ?? null;
      if (k == null) { per.push('x'); continue; }
      const pt = exam.points?.[i] ?? 1;
      counted++;
      possible += pt;
      if (a == null) { blank++; per.push('b'); }
      else if (a === k) { correct++; earned += pt; per.push('d'); }
      else { wrong++; lost += pt; per.push('y'); }
    }
    const net = exam.penalty ? correct - wrong / exam.penalty : correct;
    const pct = counted ? Math.max(0, net) / counted * 100 : 0;
    const points = possible ? Math.max(0, earned - (exam.penalty ? lost / exam.penalty : 0)) / possible * 100 : 0;
    return {
      correct, wrong, blank, counted, per,
      net: Math.round(net * 100) / 100, pct: Math.round(pct * 10) / 10, points: Math.round(points * 10) / 10,
    };
  }
  // Sınavın ana sonucu: "puan" seçiliyse 100 üzerinden puan, değilse net
  const usesPoints = (exam) => exam.scoring === 'puan';
  const mainScore = (exam, sc) => (usesPoints(exam) ? sc.points : sc.net);
  const mainLabel = (exam) => (usesPoints(exam) ? 'Puan' : 'Net');

  // Ayrı aralıklardaki aynı konu tek kazanım olarak değerlendirilir.
  function examTopics(exam) {
    const groups = new Map();
    for (const topic of exam.topics || []) {
      const key = topic.topicId || `${topic.grade || ''}/${topic.name.trim().toLocaleLowerCase('tr-TR')}`;
      if (!groups.has(key)) groups.set(key, { name: topic.name, topicId: topic.topicId, grade: topic.grade, questions: new Set() });
      const group = groups.get(key);
      for (let q = Math.max(1, topic.from); q <= Math.min(topic.to, exam.questionCount); q++) group.questions.add(q);
    }
    return [...groups.values()].map(t => ({ ...t, questions: [...t.questions].sort((a, b) => a - b) })).filter(t => t.questions.length);
  }
  // Konu (kazanım) başarısı: exam.topics = [{name, from, to}] (soru numaraları, 1'den başlar).
  // Konu numaraları A kitapçığına göredir; başka kitapçıktaki öğrenci için null döner.
  function topicScores(exam, r) {
    if (!exam.topics?.length) return [];
    if (bookletCount(exam) > 1 && bookletOf(exam, r) !== 0) return null;
    const sc = scoreResult(exam, r);
    return examTopics(exam).map((t) => {
      let correct = 0, total = 0;
      for (const q of t.questions) {
        const i = q - 1;
        if (sc.per[i] === 'x') continue;
        total++;
        if (sc.per[i] === 'd') correct++;
      }
      return { name: t.name, correct, total };
    });
  }

  const scoreResult = (exam, r) => score(exam, r.answers, bookletOf(exam, r));

  // Veli sayfasında görünen sınav özeti (en yeni sınav başta). Anahtarı girilmemiş sınavlar gösterilmez.
  function parentExams(studentId) {
    return studentResults(studentId).map((r) => {
      const e = getExam(r.examId);
      if (!e || keyEmpty(e)) return null;
      const sc = scoreResult(e, r);
      return {
        name: e.name, date: e.date || '', questions: sc.counted,
        correct: sc.correct, wrong: sc.wrong, blank: sc.blank,
        score: mainScore(e, sc), scoreLabel: mainLabel(e),
      };
    }).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name, 'tr'));
  }

  function exportJSON() {
    return JSON.stringify(db, null, 1);
  }
  // Yedekten yükleme: buluttaki eski kayıtlar silinir, yedektekiler yazılır.
  function importJSON(text) {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.classes) || !Array.isArray(data.students)) throw new Error('Geçersiz yedek dosyası');
    for (const k of KINDS) db[k].forEach((x) => emit('del', k, x));
    db = migrate(Object.assign(empty(), data));
    for (const k of KINDS) db[k].forEach((x) => emit('put', k, x));
    save();
  }

  // --- Bulut eşitlemesi için (cloud.js) ---
  const setSink = (fn) => { sink = fn; };
  const isEmpty = () => KINDS.every((k) => db[k].length === 0);
  const all = () => KINDS.flatMap((k) => db[k].map((obj) => ({ kind: k, obj })));
  // Buluttan gelen bir koleksiyonun tamamıyla yerel kopyayı değiştirir (emit etmez).
  function setCollection(kind, list) {
    db[kind] = list;
    if (kind === 'exams') migrate(db);
    else recalcNextId(db);
    save();
  }
  function clearLocal() {
    db = empty();
    try { localStorage.removeItem(KEY); } catch (e) { /* yok say */ }
  }

  return {
    KINDS, classes, classIndex, getClass, saveClass, deleteClass, reorderClasses,
    students, getStudent, addStudent, updateStudent, deleteStudent, newParentCode, parentExams,
    allStudents: () => db.students,
    exams, getExam, saveExam, deleteExam, isAbsent, roster, setAbsent,
    papers, getPaper, examPapers, newPaperId, savePaper, deletePaper,
    results, studentResults, getResult, saveResult, deleteResult,
    score, scoreResult, mainScore, mainLabel, usesPoints, examTopics, topicScores, clearUncertain, bookletCount, bookletOf, keyFor, setKey, keyEmpty, setBooklet, exportJSON, importJSON,
    setSink, isEmpty, all, setCollection, clearLocal,
  };
})();
