// Kaynak: matematik/assets/curriculum.js ve curriculum7.js konu başlıkları.
const TOPIC_SEEDS = [
  {
    "id": "math-5-nokta",
    "grade": 5,
    "name": "Nokta, doğru parçası, ışın, doğru",
    "unit": "Geometri Diyarı",
    "order": 0
  },
  {
    "id": "math-5-aci",
    "grade": 5,
    "name": "Açı",
    "unit": "Geometri Diyarı",
    "order": 1
  },
  {
    "id": "math-5-cember",
    "grade": 5,
    "name": "Çember ve daire",
    "unit": "Geometri Diyarı",
    "order": 2
  },
  {
    "id": "math-5-dikme",
    "grade": 5,
    "name": "Dikme ve düzlem",
    "unit": "Geometri Diyarı",
    "order": 3
  },
  {
    "id": "math-5-paralel",
    "grade": 5,
    "name": "Paralel doğrular ve çizim kuralları",
    "unit": "Geometri Diyarı",
    "order": 4
  },
  {
    "id": "math-5-olcme",
    "grade": 5,
    "name": "Açı ölçme",
    "unit": "Geometri Diyarı",
    "order": 5
  },
  {
    "id": "math-5-durum",
    "grade": 5,
    "name": "Doğruların durumları",
    "unit": "Geometri Diyarı",
    "order": 6
  },
  {
    "id": "math-5-cift",
    "grade": 5,
    "name": "Ters, tümler ve bütünler açılar",
    "unit": "Geometri Diyarı",
    "order": 7
  },
  {
    "id": "math-5-cokgen",
    "grade": 5,
    "name": "Çokgenler",
    "unit": "Geometri Diyarı",
    "order": 8
  },
  {
    "id": "math-5-ucgen",
    "grade": 5,
    "name": "Üçgenler",
    "unit": "Geometri Diyarı",
    "order": 9
  },
  {
    "id": "math-5-insa",
    "grade": 5,
    "name": "Üçgen inşası",
    "unit": "Geometri Diyarı",
    "order": 10
  },
  {
    "id": "math-5-okuma",
    "grade": 5,
    "name": "Çok basamaklı sayıları okuma ve yazma",
    "unit": "Sayı Kulesi",
    "order": 11
  },
  {
    "id": "math-5-basamak",
    "grade": 5,
    "name": "Basamak değeri ve çözümleme",
    "unit": "Sayı Kulesi",
    "order": 12
  },
  {
    "id": "math-5-sirala",
    "grade": 5,
    "name": "Karşılaştırma ve sıralama",
    "unit": "Sayı Kulesi",
    "order": 13
  },
  {
    "id": "math-5-islem",
    "grade": 5,
    "name": "Toplama ve çıkarma",
    "unit": "Sayı Kulesi",
    "order": 14
  },
  {
    "id": "math-5-carpan",
    "grade": 5,
    "name": "Çarpma ve bölme",
    "unit": "Sayı Kulesi",
    "order": 15
  },
  {
    "id": "math-5-problem",
    "grade": 5,
    "name": "Gerçek yaşam problemleri",
    "unit": "Sayı Kulesi",
    "order": 16
  },
  {
    "id": "math-5-cevre",
    "grade": 5,
    "name": "Dikdörtgenin çevresi",
    "unit": "Ölçü Şehri",
    "order": 17
  },
  {
    "id": "math-5-alan",
    "grade": 5,
    "name": "Dikdörtgenin alanı",
    "unit": "Ölçü Şehri",
    "order": 18
  },
  {
    "id": "math-5-iliski",
    "grade": 5,
    "name": "Çevre ve alan ilişkisi",
    "unit": "Ölçü Şehri",
    "order": 19
  },
  {
    "id": "math-7-m7-tamsayilar",
    "grade": 7,
    "name": "Tam sayılar",
    "unit": "Sayılar Uzayı",
    "order": 0
  },
  {
    "id": "math-7-m7-rasyonel",
    "grade": 7,
    "name": "Rasyonel sayılar",
    "unit": "Sayılar Uzayı",
    "order": 1
  },
  {
    "id": "math-7-m7-mutlakdeger",
    "grade": 7,
    "name": "Mutlak değer",
    "unit": "Sayılar Uzayı",
    "order": 2
  },
  {
    "id": "math-7-m7-temsiller",
    "grade": 7,
    "name": "Rasyonel sayıların farklı temsilleri",
    "unit": "Sayılar Uzayı",
    "order": 3
  },
  {
    "id": "math-7-m7-siralama",
    "grade": 7,
    "name": "Rasyonel sayıları karşılaştırma ve sıralama",
    "unit": "Sayılar Uzayı",
    "order": 4
  },
  {
    "id": "math-7-m7-tamsayiislemler",
    "grade": 7,
    "name": "Tam sayılarla işlemler ve problemler",
    "unit": "Sayılar Uzayı",
    "order": 5
  },
  {
    "id": "math-7-m7-rasyonelislemler",
    "grade": 7,
    "name": "Rasyonel sayılarla işlemler ve üsler",
    "unit": "Sayılar Uzayı",
    "order": 6
  },
  {
    "id": "math-7-m7-cokadimli",
    "grade": 7,
    "name": "Çok adımlı işlemler",
    "unit": "Sayılar Uzayı",
    "order": 7
  },
  {
    "id": "math-7-m7-gorunumler",
    "grade": 7,
    "name": "Cisimlerin farklı yönlerden görünümleri",
    "unit": "Prizma Diyarı",
    "order": 8
  },
  {
    "id": "math-7-m7-acinim",
    "grade": 7,
    "name": "Prizma açınımı ve yüzey alanı",
    "unit": "Prizma Diyarı",
    "order": 9
  },
  {
    "id": "math-7-m7-hacimyorum",
    "grade": 7,
    "name": "Hacmi eş nesnelerle yorumlama",
    "unit": "Prizma Diyarı",
    "order": 10
  },
  {
    "id": "math-7-m7-hacim",
    "grade": 7,
    "name": "Prizmanın hacim bağıntısı",
    "unit": "Prizma Diyarı",
    "order": 11
  },
  {
    "id": "math-7-m7-birimler",
    "grade": 7,
    "name": "Hacim ve sıvı ölçme birimleri",
    "unit": "Prizma Diyarı",
    "order": 12
  },
  {
    "id": "math-7-m7-problemler",
    "grade": 7,
    "name": "Hacim ve yüzey alanı problemleri",
    "unit": "Prizma Diyarı",
    "order": 13
  },
  {
    "id": "math-7-m7-dagilimlar",
    "grade": 7,
    "name": "Kategorik ve nicel veri dağılımları",
    "unit": "Veri Kâşifleri",
    "order": 14
  },
  {
    "id": "math-7-m7-surec",
    "grade": 7,
    "name": "İstatistiksel araştırma süreci",
    "unit": "Veri Kâşifleri",
    "order": 15
  },
  {
    "id": "math-7-m7-toplama",
    "grade": 7,
    "name": "Veri toplama ve mahremiyet",
    "unit": "Veri Kâşifleri",
    "order": 16
  },
  {
    "id": "math-7-m7-analiz",
    "grade": 7,
    "name": "Veri analizi ve grafikler",
    "unit": "Veri Kâşifleri",
    "order": 17
  },
  {
    "id": "math-7-m7-yorumlama",
    "grade": 7,
    "name": "Merkez, yayılım ve karar verme",
    "unit": "Veri Kâşifleri",
    "order": 18
  },
  {
    "id": "math-7-m7-inceleme",
    "grade": 7,
    "name": "Araştırmaları ve medya yorumlarını inceleme",
    "unit": "Veri Kâşifleri",
    "order": 19
  },
  {
    "id": "math-7-m7-yansima",
    "grade": 7,
    "name": "Yansıma dönüşümü",
    "unit": "Simetri Atölyesi",
    "order": 20
  },
  {
    "id": "math-7-m7-insa",
    "grade": 7,
    "name": "Orta dikme ve açıortay inşası",
    "unit": "Simetri Atölyesi",
    "order": 21
  }
];
