// Okuyucuyu ayrı iş parçacığında çalıştırır; kamera görüntüsü ve ekran akıcı kalır.
// Mesaj: {seq, img: ImageData, spec, known: number[]} → {seq, res, ms}
importScripts('layout.js', 'omr.js');

self.onmessage = (e) => {
  const { seq, img, spec, known } = e.data;
  const ids = new Set(known);
  const t0 = performance.now();
  let res;
  try {
    res = OMR.readAll(img, spec, (id) => ids.has(id));
  } catch (err) {
    res = { ok: false, reason: 'error', message: String(err && err.message || err) };
  }
  self.postMessage({ seq, res, ms: performance.now() - t0 });
};
