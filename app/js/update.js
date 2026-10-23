// Her yayında bu değer ve release.json birlikte değiştirilir.
(() => {
  const VERSION = '2026-10-22.3';
  let pending = '', remaining = 30, checking = false, refreshing = false;
  let lastTick = 0;
  const banner = document.createElement('aside');
  banner.id = 'update-notice';
  banner.hidden = true;
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  banner.innerHTML = '<span class="update-notice-icon" aria-hidden="true">↻</span><div><strong></strong><small>Yeni sürüm hazır.</small></div>';
  document.body.prepend(banner);
  const title = banner.querySelector('strong');
  const detail = banner.querySelector('small');
  const busy = () => ['modal', 'scanner'].some(id => {
    const element = document.getElementById(id);
    return element && !element.hidden;
  });
  async function latest() {
    const response = await fetch(`release.json?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Sürüm bilgisi alınamadı');
    const data = await response.json();
    if (typeof data.version !== 'string' || !data.version) throw new Error('Geçersiz sürüm');
    return data.version;
  }
  async function check() {
    if (checking || refreshing || document.hidden || navigator.onLine === false) return;
    checking = true;
    try {
      const version = await latest();
      if (version !== VERSION && version !== pending) {
        pending = version;
        remaining = 30;
        lastTick = 0;
        tick();
      } else if (version === VERSION && pending) {
        pending = ''; banner.hidden = true;
      }
    } catch (_) { /* Çevrimdışıyken mevcut sürümle devam et. */ }
    finally { checking = false; }
  }
  async function refresh() {
    refreshing = true;
    try {
      if (await latest() !== pending) { remaining = 30; return; }
      // Güncel dosyaları önbelleğe almak için worker kontrolünü de tetikle.
      navigator.serviceWorker?.getRegistration().then(r => r?.update()).catch(() => {});
      location.reload();
    } catch (_) {
      remaining = 30;
      detail.textContent = 'Bağlantı bekleniyor. Güncelleme tekrar denenecek.';
    } finally { refreshing = false; lastTick = 0; }
  }
  function tick() {
    if (!pending || refreshing) return;
    const now = Date.now();
    if (document.hidden) { lastTick = 0; return; }
    banner.hidden = false;
    if (busy()) {
      lastTick = 0;
      title.textContent = 'Yeni sürüm hazır';
      detail.textContent = 'Formu veya taramayı kapatınca geri sayım devam edecek.';
      return;
    }
    if (navigator.onLine === false) {
      lastTick = 0;
      title.textContent = 'Güncelleme bağlantı bekliyor';
      detail.textContent = 'İnternet geldiğinde geri sayım devam edecek.';
      return;
    }
    // Arka plandaki sekmelerde kullanıcı bildirimi görmeden süre dolmasın.
    if (lastTick) remaining -= Math.min((now - lastTick) / 1000, 1.5);
    lastTick = now;
    title.textContent = `${Math.max(0, Math.ceil(remaining))} sn sonra güncellenecek`;
    detail.textContent = 'Yeni sürüm hazır. Sayfa otomatik yenilenecek.';
    if (remaining <= 0) refresh();
  }
  setInterval(check, 30000);
  setInterval(tick, 1000);
  setTimeout(check, 3000);
  document.addEventListener('visibilitychange', () => { lastTick = 0; if (!document.hidden) { check(); tick(); } });
  window.addEventListener('online', check);
})();
