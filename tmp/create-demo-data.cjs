const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const context = { console, crypto: crypto.webcrypto, localStorage: { getItem: () => null, setItem() {} } };
vm.createContext(context);
for (const file of ['store', 'analytics']) vm.runInContext(fs.readFileSync(`app/js/${file}.js`, 'utf8'), context);
const result = vm.runInContext(`(() => {
  let seed = 22102026;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const names = ['Ada','Efe','Zeynep','Emir','Defne','Arda','Elif','Kerem','Duru','Mert','Asya','Can','Ece','Kaan','İpek','Deniz','Selin','Ali','Yağmur','Bora','Nehir','Yiğit','Azra','Ozan'];
  const surnames = ['Yılmaz','Demir','Kaya','Çelik','Aydın','Şahin','Arslan','Yıldız','Koç','Aksoy','Öztürk','Güneş','Eren','Çetin','Polat','Sezer','Tekin','Bulut','Uçar','Avcı','Kaplan','Doğan','Kurt','Yalçın'];
  const titles = ['Doğal Sayılar · Hazırbulunuşluk','İşlemler ve Problem Çözme','Kesirler · Kazanım Değerlendirme','Matematik · 1. Genel Deneme','Kesirler ve Ondalık Gösterim','Geometri · Ünite Tarama','Matematik · Kısa Değerlendirme','Matematik · 2. Genel Deneme'];
  const dates = ['2026-09-14','2026-09-21','2026-09-28','2026-10-05','2026-10-12','2026-10-19','2026-10-21','2026-10-26'];
  const classNames = ['5A','5B','5C','6A','6B'];
  classNames.forEach((name, ci) => {
    const cls = Store.saveClass({ name });
    const students = names.map((first, si) => Store.addStudent(cls.id, first + ' ' + surnames[(si * 7 + ci * 3) % surnames.length], String(101 + ci * 100 + si)));
    const skills = students.map((_, si) => .28 + (si / 23) * .58 + rand() * .08);
    titles.forEach((title, ei) => {
      const questionCount = [20,20,25,30,20,20,15,30][ei];
      const keyed = ei !== 6;
      const booklets = ei === 3 ? 2 : 1;
      const key = Array.from({length:questionCount}, () => keyed ? Math.floor(rand() * 4) : null);
      const extraKeys = booklets > 1 ? [key.map(x => (x + 1) % 4)] : [];
      const topics = [
        { name: ei === 5 ? 'Temel geometrik kavramlar' : 'Kavram bilgisi', from: 1, to: Math.floor(questionCount/3) },
        { name: ei === 5 ? 'Açı ölçme' : 'İşlem becerisi', from: Math.floor(questionCount/3)+1, to: Math.floor(questionCount*2/3) },
        { name: ei === 5 ? 'Şekiller ve çevre' : 'Problem çözme', from: Math.floor(questionCount*2/3)+1, to: questionCount }
      ];
      const exam = Store.saveExam({ name: title, classId: cls.id, date: dates[ei], questionCount, optionCount:4, format:'a6', booklets, key, extraKeys, penalty:ei === 3 ? 4 : 0, scoring:ei % 2 ? 'puan' : 'net', topics,
        ...(ei === 3 ? {points:Array.from({length:questionCount},(_,q)=>q>=20?2:1)} : {}) });
      const readCount = ei < 4 ? 24 : ei === 4 ? 13 + ci : ei === 6 ? 5 : 0;
      students.slice(0,readCount).forEach((student, si) => {
        const booklet = booklets > 1 ? si % 2 : 0;
        const activeKey = booklet ? extraKeys[0] : key;
        const answers = activeKey.map((correct, q) => {
          const hard = q === 6 || q === 13 || q === questionCount-2;
          const success = Math.min(.97, skills[si] + ei * .025 + ci * .014 - (hard ? .32 : 0));
          const r = rand();
          if (r > .96) return null;
          if (correct == null) return Math.floor(rand()*4);
          return r < success ? correct : (correct + 1 + Math.floor(rand()*3)) % 4;
        });
        const uncertain = ei === 4 && si === 1 ? [6] : [];
        const result = Store.saveResult(exam.id,student.id,answers,ei === 3 && si === 3 ? null : booklet,uncertain);
        result.scannedAt = dates[ei] + 'T10:' + String(si+10).padStart(2,'0') + ':00.000Z';
      });
    });
  });
  return {data: JSON.parse(Store.exportJSON()), stats: Analytics.summarize()};
})()`, context);
const data = result.data;
fs.writeFileSync('tmp/demo-data.json', JSON.stringify(data, null, 2));
if (!fs.existsSync('tmp/demo-account.json')) {
  const account = { email: 'demo.optik.20261022.' + crypto.randomBytes(2).toString('hex') + '@example.com', password: 'Optik!' + crypto.randomBytes(12).toString('base64url') + '7a', displayName: 'Demo Öğretmen · Örnek Veriler' };
  fs.writeFileSync('tmp/demo-account.json', JSON.stringify(account, null, 2));
  fs.writeFileSync('tmp/demo-auth-request.json', JSON.stringify({email:account.email,password:account.password,returnSecureToken:true}));
}
const stat = result.stats;
if(data.classes.length!==5 || data.students.length!==120 || data.exams.length!==40 || !stat.questions.length || !stat.topics.length || stat.average===null)throw Error('Örnek veri doğrulaması başarısız');
console.log(JSON.stringify({classes:data.classes.length,students:data.students.length,exams:data.exams.length,results:data.results.length,average:stat.average.toFixed(1),excluded:stat.excluded,ranking:stat.ranking.length,topics:stat.topics.length}));
