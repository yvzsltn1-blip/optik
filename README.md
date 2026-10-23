# Optik Okuyucu

Kayıtlar yönetici tarafından açılır. Herkese açık Firebase kaydı `client.permissions.disabledUserSignup=true` ile kapalıdır. `elifslymn@gmail.com`, Ayarlar → Kullanıcı yönetimi üzerinden yeni hesap açar; `functions/createTeacher` sunucuda yöneticinin kimliğini ve hesabının etkin olduğunu doğrular. İşlev `europe-west1` bölgesindedir ve Blaze planı kullanır. Şifreler Firestore'a yazılmaz.

Ortak matematik konu listesi 5. sınıf için 20, 7. sınıf için 22 başlangıç başlığı içerir. Kaynak başlıklar `matematik/assets/curriculum.js` ve `curriculum7.js` dosyalarından alınmıştır. Giriş yapan kullanıcıların ekleme/düzenleme/silme değişiklikleri `topicCatalog` koleksiyonunda tutulur. Silme, başlangıç başlığının tekrar görünmemesi için kaldırma kaydı olarak saklanır; eski sınavların konu adı ve eşleştirme anlık görüntüsü korunur.

Cevap anahtarında tek soru, `1-12` aralığı, `1-12, 14-20` gibi ayrık aralıklar ve dokunarak soru seçimi desteklenir. Bir soruya iki farklı konu atanamaz. Farklı aralıklarda geçen aynı konu analizde birleştirilir. Kitapçıklı sınavlarda konu numaraları A kitapçığına göredir.

iPhone'da (ve her tarayıcıda) çalışan, kurulum gerektirmeyen optik form okuyucu.

- `app/` – öğretmen uygulaması
- `veli/` – veli sayfası (veli kodunu girip sınav sonuçlarını görür)
- `tests/` – geliştirme testleri (yayına **yüklemeyin**; `seed.html` verileri siler)

## Yayın (Firebase)

- Öğretmen uygulaması: https://es.matematik.win (Firebase sitesi `optik-form-903ed`, hedef `ogretmen`)
- Veli sayfası: https://matematik.win (Firebase sitesi `matematik-win`, hedef `veli`)
- Yayınlama: proje kök klasöründe `firebase deploy` (iki site ve `firestore.rules` gider)
- DNS Cloudflare'de; Firebase'e giden kayıtlar "DNS only" (gri bulut) olmalı, yoksa sertifika alınamaz.
- Veli kodu: her öğrenciye 8 haneli rastgele kod (`student.parentCode`). Öğretmen uygulaması her öğrencinin
  sınav özetini `parentResults/{kod}` belgesine yazar (`cloud.js` → `publish`). Bu belgeyi kodu bilen herkes
  okuyabilir ama listeleyemez; öğrenci silinince belge silinir ve kod boşa çıkar.
- Giriş e-posta/şifre ile yapılır (Firebase Authentication). Veriler Firestore'da `users/{uid}/...` altında tutulur ve her öğretmen yalnızca kendi verisine erişebilir (`firestore.rules`).
- Uygulama çevrimdışı da çalışır, bağlantı gelince eşitlenir.

iPhone'da adresi Safari ile açın: **Paylaş → Ana Ekrana Ekle**.

## Testler

```
py -m http.server 8766        # proje kök klasöründe
```

- `http://127.0.0.1:8766/tests/omr-test.html` – sentetik fotoğraflarla okuma testi
- `http://127.0.0.1:8766/tests/seed.html` – örnek veri yükler (**mevcut verileri siler**)
- `http://127.0.0.1:8766/tests/scan-e2e.html#a4` / `#a6` – fotoğraftan okutma akışı (önce `seed.html`)
- `http://127.0.0.1:8766/tests/scan-booklet-e2e.html` – kitapçıklı okutma ve anahtar okutma (önce `seed.html`)
- `tests/real-test.html` – gerçek telefon fotoğraflarıyla okuma (`tests/fixtures/`; `gercek-a6-kivrik.jpeg` ortası kıvrık kâğıt, öğrenci adı kapatıldı)
- `tests/omr-test.html?norefine` – ızgara ince ayarı kapalı karşılaştırma
- `tests/live-frame.html` – sahte kamera videosu (y4m) için kare üretir; Chrome `--use-file-for-fake-video-capture` ile canlı akış testi yapılır
- `http://127.0.0.1:8766/tests/sheet.html?a6` – sayfa önizlemesi (`?a4`, `?a5`, `?a6`)
- `http://127.0.0.1:8766/tests/pdf-test.html` – PDF üretimi
- `http://127.0.0.1:8766/tests/cloud-debug.html` – Firebase modülünün yüklenmesi

## Notlar

- Form boyutları: A4 (sayfada 1, en çok 100 soru), A5 (sayfada 2, en çok 52), A6 (sayfada 4, en çok 30). Soru sayısı, şık ve boyut her sınav için ayrı seçilir; formlar sınav sayfasından PDF olarak alınır.
- Kitapçık: sınavda 2–4 kitapçık seçilebilir. Formun başlığına kitapçık yuvarlakları basılır; her kitapçığın ayrı anahtarı vardır (`exam.key` = A, `exam.extraKeys` = B, C, D). İşaretlenmemiş kitapçık A sayılır ve uyarı verilir.
- Okuyucu (`app/js/omr.js`), kamera ekranında `app/js/omr-worker.js` içinde ayrı iş parçacığında çalışır. Köşeler yarım çözünürlükte aranır, tam çözünürlükte düzeltilir; her soru satırı basılı çerçevelere göre ince ayarlanır (kâğıt kıvrımı). Kamera ekranı birkaç karenin ortalamasından karar verir; eşiğe yakın işaretler "şüpheli" olarak kaydedilir ve otomatik kayıt o formda durur.
- Puanlama: sınavda `scoring: 'puan'` ise 100 üzerinden puan (`exam.points` ile soru ağırlıkları); `exam.topics` = konu aralıkları.
- Sınav analizi: özet (ortalama, medyan, std. sapma), en çok yanlış yapılan sorular ve en çok seçilen yanlış şık, zorluk dağılımı, ayırt edicilik (üst/alt %27), soru ayrıntısında kimin ne işaretlediği, öğrenci × soru haritası.
- Veli karnesi: `app/js/report.js` tuvalde JPG karne çizer; telefonda paylaşım menüsüyle ya da panoya kopyalanıp WhatsApp sohbetiyle gönderilir.
- Form geometrisi `app/js/layout.js` dosyasında. Burada yapılacak bir değişiklik, basılmış tüm formları geçersiz kılar.
- Her öğrencinin formunda, öğrenciyi tanıtan bir kod şeridi (16 bit + kontrol biti) bulunur. Okutma sırasında öğrenci bu şeritten otomatik olarak tanınır.
- Kıvrık kâğıt: köşelerden hesaplanan konum kâğıdın ortasında birkaç mm kayabilir. Normal okumada hiçbir form bulunamazsa ikinci tur çalışır: kod şeridi kaydırılıp ölçeklenerek aranır (yalnız kayıtlı öğrenci kodu kabul edilir), ızgara sütun sütun geniş kaydırma ve yatay ölçekle oturtulur. Normal formlarda bu tur hiç çalışmaz, hız değişmez.
- Elle giriş: okunamayan formun cevapları sonuç sayfasında harflere dokunarak ya da `ADAB-C*` gibi yazılarak girilir (`-` boş, `*` çift işaret). Sınav sayfasındaki "Okutulmayanlar" listesinden ya da kamera ekranındaki "✍️ Elle gir" düğmesinden açılır. Elle girilen sonuç `manual: true` ile işaretlenir, listede ✍️ görünür. Okutulmuş bir sonuç aynı sayfada düzeltilir; kamera kartındaki "Kaydet ve düzelt" doğrudan bu sayfaya götürür.

## Açık sayfalarda yayın bildirimi

Öğretmen uygulaması `release.json` dosyasını 30 saniyede bir kontrol eder. Yeni sürümde üst bildirim 30 saniye geri sayar ve sayfayı yeniler. Form/tarama açıkken, sekme arka plandayken veya internet yokken geri sayım bekler.

Her öğretmen uygulaması yayınında:
1. `app/release.json` içindeki `version` ve `app/js/update.js` içindeki `VERSION` değerlerini aynı yeni sürüme yükseltin.
2. `app/sw.js` içindeki `CACHE` sürümünü yükseltin.
3. `node tmp/check-update.cjs`, `node tmp/check-manual-entry.cjs` ve JavaScript sözdizimi kontrollerini çalıştırın.
4. `firebase.cmd deploy --only hosting:ogretmen --project optik-form-903ed --non-interactive` ile dosyaları birlikte yayınlayın.

Bildirim desteği 2026-10-22.1 sürümünde eklendi. Daha eski sürümle açık kalan sayfalarda bu mekanizma olmadığından bir kez elle yenileme gerekir.
