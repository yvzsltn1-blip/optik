const fs=require('fs'),vm=require('vm'),assert=require('assert');
const ctx={console,localStorage:{getItem(){return null},setItem(){}},crypto:require('crypto').webcrypto};
vm.createContext(ctx);
for (const f of ['store','analytics']) vm.runInContext(fs.readFileSync(`app/js/${f}.js`,'utf8'),ctx);
vm.runInContext(`
const a=Store.saveClass({name:'5A'}),b=Store.saveClass({name:'5B'});
const s1=Store.addStudent(a.id,'Ada','1'),s2=Store.addStudent(a.id,'Bora','2'),s3=Store.addStudent(b.id,'Cem','3');
const e1=Store.saveExam({classId:a.id,name:'Short',date:'2026-10-01',questionCount:2,optionCount:4,key:[0,0]});
Store.saveResult(e1.id,s1.id,[0,1]); Store.saveResult(e1.id,s2.id,[0,0]);
const e2=Store.saveExam({classId:a.id,name:'Long',date:'2026-10-02',questionCount:4,optionCount:4,key:[0,0,0,null],topics:[{name:'Topic',from:1,to:4}]});
Store.saveResult(e2.id,s1.id,[0,0,0,1]);Store.saveResult(e2.id,s2.id,[0,null,1,0]);
const eb=Store.saveExam({classId:b.id,name:'Booklets',date:'2026-10-03',questionCount:2,optionCount:4,key:[0,0],booklets:2,extraKeys:[[1,1]]});
Store.saveResult(eb.id,s3.id,[1,1],null);
`,ctx);
const run=code=>vm.runInContext(code,ctx);
let d=run('Analytics.summarize()');
assert.equal(d.entries.length,4);assert.equal(d.excludedReasons.booklet,1);
assert.equal(d.expected,5);assert.equal(d.read,5);assert.equal(d.correct,7);assert.equal(d.wrong,2);assert.equal(d.blank,1);
assert(Math.abs(d.average-70.825)<.001);
assert.equal(d.ranking[0].student.name,'Ada');assert.equal(d.ranking[0].average,75);
assert.equal(d.questions.length,2);assert.equal(d.topics[0].total,6);
assert.equal(run('Analytics.summarize(b.id)').entries.length,0);
assert.equal(run('Analytics.summarize(a.id,e1.id)').average,75);
run('Store.setBooklet(eb.id,s3.id,1)');assert.equal(run('Analytics.summarize(b.id)').average,100);
run('Store.saveResult(e1.id,s1.id,[0,0])');run('Store.saveResult(e2.id,s2.id,[0,0,0,0])');
d=run('Analytics.summarize(a.id)');assert.equal(d.ranking[0].rank,1);assert.equal(d.ranking[1].rank,1);
run('Store.saveResult(e1.id,s1.id,[0,0],null,[1])');assert.equal(run('Analytics.summarize(a.id)').excludedReasons.uncertain,1);
run('Store.saveExam({...e1,key:[null,null]})');assert.equal(run('Analytics.summarize(a.id)').excludedReasons.key,1);
run('Store.saveExam({...eb,scoring:"puan",points:[3,1],penalty:4});Store.saveResult(eb.id,s3.id,[1,0],1)');
assert.equal(run('Analytics.summarize(b.id)').average,68.8);
run('Store.deleteResult(eb.id,s3.id)');assert.equal(run('Analytics.summarize(b.id)').average,null);
// Ortak sınav: 5A ve 5B'nin aynı adlı sınavı birlikte ortalanır
run('Store.saveExam({...e1,key:[0,0]});Store.clearUncertain(e1.id,s1.id)');
run('globalThis.ec=Store.saveExam({classId:b.id,name:"Short",date:"2026-10-01",questionCount:2,optionCount:4,key:[0,0]});Store.saveResult(ec.id,s3.id,[1,1])');
d=run('Analytics.summarize([a.id,b.id],[e1.id,ec.id])');assert.equal(d.entries.length,3);assert.equal(Math.round(d.average*10)/10,66.7);assert.equal(d.classes.length,2);
assert.equal(d.questions.length,2);assert.equal(d.questions[0].total,1);
d=run('Analytics.summarize([a.id,b.id],[e1.id,ec.id],e=>e.name)');assert.equal(d.questions.length,2);assert.equal(d.questions[0].total,3);assert.equal(d.questions[0].wrong,1);assert.equal(d.questions[0].byClass.get(run("b.id")).wrong,1);
// Sınava girmeyecek öğrenci beklenen sayıdan düşülür; okutulunca işaret kalkar
const s4=run('globalThis.s4=Store.addStudent(a.id,"Deniz","4")');
assert.equal(run('Analytics.summarize(a.id,e1.id)').expected,3);
run('Store.setAbsent(e1.id,s4.id,true)');d=run('Analytics.summarize(a.id,e1.id)');assert.equal(d.expected,2);assert.equal(d.read,2);
assert.equal(run('Store.roster(e1).length'),2);
run('Store.saveResult(e1.id,s4.id,[0,0])');assert.equal(run('Store.isAbsent(e1,s4.id)'),false);
console.log('PASS: normalization, exclusions, class/exam filters, cancelled questions, booklet keys, weighted score and penalty, ranking ties, empty states, live result edits, common exams, merged common questions, absent students.');

