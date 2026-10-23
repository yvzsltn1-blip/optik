const fs = require('fs'), vm = require('vm');
const sandbox = {};
vm.createContext(sandbox);
const source = 'C:/Users/YAVUZ/Documents/Game/matematik/assets/';
for (const file of ['curriculum.js', 'curriculum7.js']) vm.runInContext(fs.readFileSync(source + file, 'utf8'), sandbox);
const seeds = [5, 7].flatMap(grade => {
  const curriculum = sandbox.MatCurricula[grade];
  return curriculum.topics.map((t, i) => ({ id: `math-${grade}-${t.id}`, grade, name: t.title, unit: curriculum.worlds.find(w => w.id === t.worldId)?.name || '', order: i }));
});
fs.writeFileSync('app/js/topic-seeds.js', '// Kaynak: matematik/assets/curriculum.js ve curriculum7.js konu başlıkları.\nconst TOPIC_SEEDS = ' + JSON.stringify(seeds, null, 2) + ';\n');
console.log(JSON.stringify([5, 7].map(grade => ({grade, count:seeds.filter(t => t.grade === grade).length, topics:seeds.filter(t => t.grade === grade).map(t => t.name)}))));
