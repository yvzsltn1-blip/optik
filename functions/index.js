const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
initializeApp();
const ADMIN_EMAIL = 'elifslymn@gmail.com';

async function createTeacher(request, auth = getAuth()) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Önce giriş yapın.');
  let admin;
  try { admin = await auth.getUserByEmail(ADMIN_EMAIL); }
  catch (_) { throw new HttpsError('permission-denied', 'Kullanıcı oluşturma yetkiniz yok.'); }
  if (admin.uid !== request.auth.uid || admin.disabled) throw new HttpsError('permission-denied', 'Kullanıcı oluşturma yetkiniz yok.');
  const validAfter = new Date(admin.tokensValidAfterTime || 0).getTime() / 1000;
  if ((request.auth.token.auth_time || 0) < validAfter) throw new HttpsError('unauthenticated', 'Yeniden giriş yapın.');
  const data = request.data || {};
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  const password = typeof data.password === 'string' ? data.password : '';
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new HttpsError('invalid-argument', 'Geçerli bir e-posta yazın.');
  if (password.length < 8 || password.length > 128) throw new HttpsError('invalid-argument', 'Şifre 8–128 karakter olmalı.');
  if (name.length > 100) throw new HttpsError('invalid-argument', 'Ad en fazla 100 karakter olabilir.');
  try {
    const user = await auth.createUser({ email, password, ...(name ? {displayName: name} : {}), disabled: false });
    return { uid: user.uid, email: user.email, name: user.displayName || '' };
  } catch (error) {
    if (error.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'Bu e-posta zaten kayıtlı.');
    if (error.code === 'auth/invalid-password') throw new HttpsError('invalid-argument', 'Şifre koşullara uygun değil.');
    throw new HttpsError('internal', 'Kullanıcı oluşturulamadı.');
  }
}
exports.createTeacher = onCall({ region:'europe-west1', maxInstances:2, timeoutSeconds:30, memory:'256MiB' }, request => createTeacher(request));
// Birim testlerinde gerçek hesap oluşturmadan yetki sınırını denetlemek için.
if (process.env.NODE_ENV === 'test') exports._createTeacher = createTeacher;
