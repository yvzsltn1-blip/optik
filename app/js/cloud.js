// Firebase: e-posta/şifre ile giriş ve Firestore eşitlemesi.
// Veriler users/{uid}/{classes|students|exams|results}/{id} altında tutulur.
// Firestore'un çevrimdışı önbelleği sayesinde internet yokken de yazılır, bağlantı gelince gönderilir.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut, updateProfile,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, writeBatch, onSnapshot, setDoc, deleteDoc, query, where, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAziiYrvCwYV0J6jPz1Amkr_nFB3NKHPsI',
  authDomain: 'optik-form-903ed.firebaseapp.com',
  projectId: 'optik-form-903ed',
  storageBucket: 'optik-form-903ed.firebasestorage.app',
  messagingSenderId: '590862780167',
  appId: '1:590862780167:web:67c0f1d9bf070e8cb927a2',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const fs = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

const $ = (s) => document.querySelector(s);
let user = null;
let unsubs = [];
let status = 'Bağlanıyor…';

const docId = (kind, obj) => (kind === 'results' ? `${obj.examId}_${obj.studentId}` : String(obj.id));
const colRef = (kind) => collection(fs, 'users', user.uid, kind);

// Firestore iç içe dizi saklayamaz (ör. B/C/D kitapçık anahtarları: extraKeys = [[…], […]]).
// Böyle diziler JSON metni olarak saklanır, okunurken geri çevrilir.
const NESTED = '__json';
function encode(v) {
  if (Array.isArray(v)) return v.some(Array.isArray) ? { [NESTED]: JSON.stringify(v) } : v.map(encode);
  if (v && typeof v === 'object') { const o = {}; for (const k in v) if (v[k] !== undefined) o[k] = encode(v[k]); return o; }
  return v;
}
function decode(v) {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') {
    if (typeof v[NESTED] === 'string' && Object.keys(v).length === 1) return JSON.parse(v[NESTED]);
    const o = {};
    for (const k in v) o[k] = decode(v[k]);
    return o;
  }
  return v;
}

// Buluta ulaştığı henüz onaylanmamış değişiklikler ("kind/id" → 'put' | 'del').
// Bağlantı koparsa ya da yazma reddedilirse kaybolmaz; sonraki açılışta yeniden gönderilir.
const dirtyKey = () => 'optik-bekleyen:' + user.uid;
function loadDirty() { try { return JSON.parse(localStorage.getItem(dirtyKey()) || '{}'); } catch (e) { return {}; } }
function saveDirty(d) { try { localStorage.setItem(dirtyKey(), JSON.stringify(d)); } catch (e) { /* yok say */ } }

// --- Yazma: aynı anda yapılan değişiklikler tek toplu yazmada gönderilir ---
let queue = [];
function enqueue(op, kind, obj) {
  if (!user || !obj) return;
  if (!queue.length) queueMicrotask(flush);
  const id = docId(kind, obj);
  queue.push({ op, kind, id, data: op === 'put' ? encode(JSON.parse(JSON.stringify(obj))) : null });
  const d = loadDirty();
  d[`${kind}/${id}`] = op;
  saveDirty(d);
  publishSoon();
}
function flush() {
  const items = queue;
  queue = [];
  for (let i = 0; i < items.length; i += 450) {
    const part = items.slice(i, i + 450);
    const batch = writeBatch(fs);
    const sent = [];
    for (const it of part) {
      // Tek bir kayıttaki sorun ötekilerin gönderilmesini engellemesin
      try {
        const ref = doc(colRef(it.kind), it.id);
        if (it.op === 'put') batch.set(ref, it.data);
        else batch.delete(ref);
        sent.push(it);
      } catch (e) {
        console.error('Buluta yazılamayan kayıt', it.kind, it.id, e);
        setStatus('Bir kayıt buluta yazılamadı: ' + (e.message || e));
      }
    }
    if (!sent.length) continue;
    batch.commit().then(() => {
      const d = loadDirty();
      for (const it of sent) if (d[`${it.kind}/${it.id}`] === it.op) delete d[`${it.kind}/${it.id}`];
      saveDirty(d);
    }).catch((e) => {
      console.error(e);
      setStatus('Buluta yazılamadı: ' + (e.code || e.message) + ' · değişiklikler cihazda duruyor, tekrar denenecek');
    });
  }
}

// --- Okuma: dört koleksiyon dinlenir; başka cihazdaki değişiklikler anında gelir ---
function listen() {
  const loaded = new Set();
  let firstLoad = true;
  for (const kind of Store.KINDS) {
    unsubs.push(onSnapshot(colRef(kind), { includeMetadataChanges: true }, (snap) => {
      const remote = snap.docChanges().some((c) => !c.doc.metadata.hasPendingWrites);
      const list = snap.docs.map((d) => decode(d.data()));
      if (firstLoad) {
        // Önbellekteki boş liste "bulut boş" anlamına gelmez; sunucu cevabını bekle
        if (snap.metadata.fromCache) { setStatus('Bulut bağlantısı bekleniyor…'); return; }
        loaded.add(kind);
        if (loaded.size < Store.KINDS.length) { stash[kind] = list; return; }
        firstLoad = false;
        stash[kind] = list;
        initialSync();
        return;
      }
      Store.setCollection(kind, list);
      setStatus(snap.metadata.fromCache ? 'Çevrimdışı · değişiklikler bağlantı gelince gönderilecek' : 'Eşitlendi');
      if (remote) { rerenderSoon(); publishSoon(); }
    }, (err) => {
      console.error(err);
      setStatus('Bulut bağlantı hatası: ' + err.code);
    }));
  }
}
let stash = {};

// İlk yükleme. Bulut boşsa ve cihazda (giriş öncesinden kalma) veri varsa hepsi buluta taşınır.
// Değilse bulut esas alınır; ancak buluta ulaşmamış yerel değişiklikler (bekleyenler) korunup
// yeniden gönderilir. Eşitleme düzeltmesinden önceki sürümde yazılamamış kayıtlar da bu cihazda
// ilk açılışta bir kez buluta yüklenir.
function initialSync() {
  const cloudEmpty = Store.KINDS.every((k) => !stash[k].length);
  if (cloudEmpty && !Store.isEmpty()) {
    Store.all().forEach(({ kind, obj }) => enqueue('put', kind, obj));
    setStatus('Cihazdaki veriler buluta aktarılıyor…');
  } else {
    const dirty = loadDirty();
    const recoverKey = 'optik-kurtarma-v2:' + user.uid;
    let recover = false;
    try { recover = !localStorage.getItem(recoverKey); } catch (e) { /* yok say */ }
    const local = {};
    Store.all().forEach(({ kind, obj }) => { (local[kind] = local[kind] || new Map()).set(docId(kind, obj), obj); });
    let pushed = 0;
    for (const k of Store.KINDS) {
      const cloud = new Map(stash[k].map((o) => [docId(k, o), o]));
      for (const [id, obj] of local[k] || []) {
        const op = dirty[`${k}/${id}`];
        // Bekleyen yerel değişiklik ya da bulutta hiç olmayan kayıt (kurtarma) → yerel sürüm geçerli
        if (op === 'put' || (recover && !cloud.has(id))) { cloud.set(id, obj); enqueue('put', k, obj); pushed++; }
      }
      for (const key of Object.keys(dirty)) {
        const [kind, id] = key.split('/');
        if (kind === k && dirty[key] === 'del' && cloud.has(id)) { enqueue('del', k, cloud.get(id)); cloud.delete(id); }
      }
      Store.setCollection(k, [...cloud.values()]);
    }
    try { localStorage.setItem(recoverKey, '1'); } catch (e) { /* yok say */ }
    setStatus(pushed ? `Eşitlendi · ${pushed} kayıt buluta gönderildi` : 'Eşitlendi');
  }
  stash = {};
  synced = true;
  publishSoon();
  window.App?.render();
}

// --- Veli sayfası (matematik.win) ---
// Her öğrencinin sınav özeti parentResults/{veli kodu} belgesinde durur. Belgeyi kodu bilen herkes
// okuyabilir ama kimse listeleyemez; yalnızca sahibi olan öğretmen yazar (firestore.rules).
// Öğretmenin buluttaki belgeleri dinlenir; cihazdaki verilerden çıkan özetle karşılaştırılıp
// yalnızca farklı olanlar yazılır, artık öğrencisi olmayan kodlar silinir (kod boşa çıkar).
let synced = false;      // initialSync tamamlandı mı
let parentDocs = null;   // kod → kanonik JSON; sunucudan ilk cevap gelene kadar null
let publishTimer = 0;
const parentRef = (code) => doc(fs, 'parentResults', code);
// Alan sırasından bağımsız karşılaştırma için anahtarları sıralı JSON
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));

function listenParents() {
  unsubs.push(onSnapshot(query(collection(fs, 'parentResults'), where('uid', '==', user.uid)), (snap) => {
    // Önbellekteki eksik liste, buluttaki belgeleri silmeye yol açmasın
    if (snap.metadata.fromCache && !parentDocs) return;
    parentDocs = new Map(snap.docs.map((d) => [d.id, canon(d.data())]));
    publishSoon();
  }, (err) => console.error('Veli kayıtları okunamadı', err)));
}

function publishSoon() {
  clearTimeout(publishTimer);
  publishTimer = setTimeout(publish, 1500);
}

function publish() {
  if (!user || !synced || !parentDocs) return;
  const uid = user.uid;
  const want = new Map();
  let assigned = 0;
  for (const s of Store.allStudents()) {
    let code = s.parentCode;
    // Kodu olmayan (eski) öğrenciye ya da aynı kodu taşıyan ikinci öğrenciye yeni kod
    if (!/^\d{8}$/.test(code || '') || want.has(code)) {
      code = Store.newParentCode(new Set([...parentDocs.keys(), ...want.keys()]));
      Store.updateStudent(s.id, { parentCode: code });
      assigned++;
    }
    want.set(code, {
      uid, name: s.name, className: Store.getClass(s.classId)?.name || '',
      teacher: user.displayName || '', exams: Store.parentExams(s.id),
    });
  }
  // Yeni verilen kodlar ekranda "hazırlanıyor…" yerine görünsün
  if (assigned) rerenderSoon();
  for (const [code, data] of want) {
    const json = canon(data);
    if (parentDocs.get(code) === json) continue;
    parentDocs.set(code, json);
    setDoc(parentRef(code), data).catch((e) => {
      if (e.code !== 'permission-denied') return console.error('Veli kaydı yazılamadı', code, e);
      // Kod başka bir öğretmenin öğrencisinde: bu öğrenciye yeni kod ver
      const s = Store.allStudents().find((x) => x.parentCode === code);
      if (s) Store.updateStudent(s.id, { parentCode: Store.newParentCode(new Set([code])) });
    });
  }
  for (const code of [...parentDocs.keys()]) {
    if (want.has(code)) continue;
    parentDocs.delete(code);
    deleteDoc(parentRef(code)).catch((e) => console.error('Veli kaydı silinemedi', code, e));
  }
}

let renderTimer = 0;
function rerenderSoon() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    // Kullanıcı bir şey yazarken ya da okutma yaparken ekranı yenileme
    const busy = !$('#modal').hidden || !$('#scanner').hidden || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (busy) rerenderSoon();
    else window.App?.render(true);
  }, 400);
}

function setStatus(s) {
  status = s;
  const el = $('#sync-status');
  if (el) el.textContent = s;
}

// --- Giriş / üye olma ekranı ---
const ERRORS = {
  'auth/invalid-credential': 'E-posta veya şifre hatalı.',
  'auth/wrong-password': 'E-posta veya şifre hatalı.',
  'auth/user-not-found': 'Bu e-posta ile kayıtlı hesap yok.',
  'auth/invalid-email': 'Geçerli bir e-posta adresi yazın.',
  'auth/email-already-in-use': 'Bu e-posta ile zaten üye olunmuş. "Giriş yap" sekmesinden girin.',
  'auth/weak-password': 'Şifre en az 6 karakter olmalı.',
  'auth/missing-password': 'Şifreyi yazın.',
  'auth/too-many-requests': 'Çok fazla deneme yapıldı. Biraz sonra tekrar deneyin.',
  'auth/network-request-failed': 'İnternet bağlantısı yok.',
  'auth/operation-not-allowed': 'E-posta/şifre girişi Firebase konsolunda etkin değil.',
  'auth/configuration-not-found': 'Firebase Authentication henüz etkinleştirilmemiş.',
};
const LS_SEEN = 'optik-hesap-var';
const escHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Yeni hesapları yalnızca yönetici oluşturur; herkese açık kayıt formu yoktur.
function showLogin(mode, email = '') {
  const el = $('#auth');
  el.innerHTML = `<form class="auth-box" novalidate>
    <img src="icons/icon-192.png" alt="" width="72" height="72">
    <h1>Optik Okuyucu</h1><p class="muted small">Hesabınızla giriş yapın. Yeni hesap için yöneticinizle iletişime geçin.</p>
    <label class="field"><span>E-posta</span><input type="email" name="email" autocomplete="username" inputmode="email" autocapitalize="off" value="${escHtml(email)}"></label>
    <label class="field"><span>Şifre</span><span class="pass-wrap"><input type="password" name="pass" autocomplete="current-password"><button type="button" class="pass-eye" data-eye>Göster</button></span></label>
    <p class="auth-msg" id="auth-msg"></p><button class="btn primary block big-ish" data-submit>Giriş yap</button>
    <button type="button" class="link-btn" data-reset>Şifremi unuttum</button></form>`;
  el.hidden = false;
  const form = el.querySelector('form'), f = form.elements;
  const msg = (text, ok) => { $('#auth-msg').textContent = text; $('#auth-msg').className = 'auth-msg' + (ok ? ' ok' : ''); };
  const busy = on => {
    form.querySelectorAll('button,input').forEach(b => b.disabled = on);
    form.querySelector('[data-submit]').textContent = on ? 'Lütfen bekleyin…' : 'Giriş yap';
  };
  form.querySelector('[data-eye]').onclick = e => { const show = f.pass.type === 'password'; f.pass.type = show ? 'text' : 'password'; e.target.textContent = show ? 'Gizle' : 'Göster'; };
  form.querySelector('[data-reset]').onclick = async () => {
    const address = f.email.value.trim();
    if (!address) { f.email.focus(); return msg('Şifre sıfırlama bağlantısı için e-posta adresinizi yazın.'); }
    busy(true);
    try { await sendPasswordResetEmail(auth, address); msg('Hesap kayıtlıysa şifre sıfırlama bağlantısı e-posta adresine gönderildi.', true); }
    catch (error) { msg(ERRORS[error.code] || 'İşlem tamamlanamadı.'); }
    busy(false);
  };
  form.onsubmit = async e => {
    e.preventDefault();
    const address = f.email.value.trim(), pass = f.pass.value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { f.email.focus(); return msg('Geçerli bir e-posta yazın.'); }
    if (!pass) { f.pass.focus(); return msg('Şifrenizi yazın.'); }
    busy(true); msg('');
    try { await signInWithEmailAndPassword(auth, address, pass); }
    catch (error) { busy(false); msg(['auth/invalid-credential','auth/user-not-found','auth/wrong-password'].includes(error.code) ? 'E-posta veya şifre hatalı.' : ERRORS[error.code] || 'Giriş yapılamadı.'); }
  };
  setTimeout(() => (email ? f.pass : f.email).focus(), 50);
}

// Ad soyad değişince ayarlar ekranını yenile
function onProfile() { if (location.hash.startsWith('#/settings')) window.App?.render(true); }

onAuthStateChanged(auth, (u) => {
  unsubs.forEach((f) => f());
  unsubs = [];
  queue = [];
  synced = false;
  parentDocs = null;
  clearTimeout(publishTimer);
  if (user && (!u || u.uid !== user.uid)) {
    // Başka hesaba geçildi ya da çıkış yapıldı: önceki hesabın verisi cihazda kalmasın
    Store.clearLocal();
  }
  user = u;
  if (!u) {
    Store.setSink(null);
    showLogin();
    window.App?.render();
    return;
  }
  try { localStorage.setItem(LS_SEEN, '1'); } catch (e) { /* yok say */ }
  $('#auth').hidden = true;
  $('#auth').innerHTML = '';
  Store.setSink(enqueue);
  setStatus('Eşitleniyor…');
  listen();
  listenParents();
  unsubs.push(onSnapshot(collection(fs, 'topicCatalog'), snap => {
    Topics.setShared(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    rerenderSoon();
  }, err => { console.error('Ortak konular okunamadı', err); }));
});

window.Cloud = {
  get email() { return user?.email || ''; },
  get name() { return user?.displayName || ''; },
  get isAdmin() { return user?.email?.toLowerCase() === 'elifslymn@gmail.com'; },
  get canCreateUsers() { return true; },
  async createTeacher(data) {
    if (user?.email?.toLowerCase() !== 'elifslymn@gmail.com') throw new Error('Kullanıcı oluşturma yetkiniz yok.');
    return (await httpsCallable(getFunctions(app, 'europe-west1'), 'createTeacher')(data)).data;
  },
  async setName(name) { if (user) { await updateProfile(user, { displayName: name }); onProfile(); publishSoon(); } },
  async saveTopic(topic) {
    if (!user) throw new Error('Önce hesabınıza giriş yapın.');
    const data = { name: topic.name.trim(), grade: topic.grade, unit: (topic.unit || '').trim(), deleted: !!topic.deleted, updatedBy: user.uid, updatedAt: serverTimestamp() };
    await setDoc(doc(fs, 'topicCatalog', topic.id), data);
    // Sunucu dinleyicisi aynı kaydı diğer açık hesaplara da iletir.
  },
  get status() { return status; },
  logout: () => signOut(auth),
};
