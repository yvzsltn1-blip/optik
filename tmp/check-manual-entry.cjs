const fs=require('fs'),vm=require('vm'),assert=require('assert');
const els=new Map();
const el=s=>{if(!els.has(s))els.set(s,{style:{},dataset:{},innerHTML:'',value:'',hidden:false,addEventListener(){},querySelectorAll(){return[]}});return els.get(s)};
const toasts=[];
const ctx={console, crypto: globalThis.crypto, setTimeout,clearTimeout, URL, Blob, Map, Set, Date, Math,localStorage:{getItem(){return null},setItem(){}},navigator:{userAgent:''},location:{hash:'#/exams',protocol:'http:'},document:{querySelector:el,querySelectorAll(){return[]},getElementById:(id)=>el('#'+id)},matchMedia(){return{matches:true}},addEventListener(){},scrollTo(){},scrollY:0};ctx.window=ctx;
vm.createContext(ctx);
for(const f of ['layout','store','topic-seeds','topics','papers'])vm.runInContext(fs.readFileSync('app/js/'+f+'.js','utf8'),ctx);
vm.runInContext(`var c=Store.saveClass({name:'5A'});var s1=Store.addStudent(c.id,'Ali Veli','12');var ex=Store.saveExam({classId:c.id,name:'Deneme',date:'2026-10-23',questionCount:10,optionCount:4,key:[0,1,2,3,0,1,2,3,0,1]});`,ctx);
assert(ctx.s1,'Store.saveStudent bulunamadı');
let app=fs.readFileSync('app/js/app.js','utf8').replace('window.App = { render };','window.App = { render, applyAnswerText };');
vm.runInContext(app,ctx);
const {ex,s1}=ctx;const Store=()=>vm.runInContext('Store',ctx);
// Okutulmamış öğrenci: sınav sayfasında elle giriş bağlantısı
ctx.location.hash=`#/exam/${ex.id}`;ctx.App.render();
assert(el('#view').innerHTML.includes(`href="#/result/${ex.id}/${s1.id}"`),'okutulmayan öğrenciye bağlantı yok');
// Sonuç sayfası: hızlı giriş alanı
ctx.location.hash=`#/result/${ex.id}/${s1.id}`;ctx.App.render();
assert(el('#view').innerHTML.includes('id="ans-text"'));
assert(el('#view').innerHTML.includes('Henüz okutulmadı'));
el('#ans-text').value='ab cd-*  b';
ctx.App.applyAnswerText(ex.id,s1.id);
let r=Store().getResult(ex.id,s1.id);
assert.deepEqual([...r.answers],[0,1,2,3,null,-1,1,null,null,null]);
assert.equal(r.manual,true);
assert(el('#view').innerHTML.includes('Elle girildi'));
// Optikten okunan sonuç elle düzeltilince "elle girildi" olmaz, düzeltilen sorunun şüphesi kalkar
Store().saveResult(ex.id,s1.id,[0,0,0,0,0,0,0,0,0,0],null,[1,7]);
el('#ans-text').value='AB';
ctx.App.applyAnswerText(ex.id,s1.id);
r=Store().getResult(ex.id,s1.id);
assert.deepEqual([...r.answers],[0,1,0,0,0,0,0,0,0,0]);
assert.equal(r.manual,undefined);
assert.deepEqual([...r.uncertain],[7]);
console.log('PASS: missing-student links, manual quick entry (blank/multi/spaces), manual flag, scanned result edit keeps flag off and clears uncertain.');
