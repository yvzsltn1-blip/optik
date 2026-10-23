from pathlib import Path
import json, re
html = Path('app/index.html').read_text(encoding='utf-8')
html = re.sub(r'<script type="module" src="js/cloud.js"></script>', '', html)
html = html.replace('<head>', '<head><base href="/app/">')
isolation = '''<script>
const memory = new Map();
Object.defineProperty(window, 'localStorage', {value:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}});
Object.defineProperty(navigator, 'serviceWorker', {value:undefined});
window.addEventListener('error', e => parent.postMessage({error:e.message}, '*'));
</script>'''
html = html.replace('<script src="js/layout.js">', isolation+'<script src="js/layout.js">')
seed = Path('tests/seed.html').read_text(encoding='utf-8').split('// Geliştirme için')[1].split('</script>')[0]
seed = '// Geliştirme için' + seed
seed += '''
Store.saveExam({...ex1, scoring:'puan', topics:[{name:'Çarpanlar ve katlar',from:1,to:10},{name:'Üslü ifadeler',from:11,to:20},{name:'Kareköklü ifadeler',from:21,to:30},{name:'Veri analizi ve olasılık',from:31,to:40}]});
window.Cloud = {name:'Selin Yılmaz'};
location.hash = '#/exam/'+ex1.id+'/stats';
'''
html = html.replace('<script src="js/app.js">', '<script>'+seed+'</script><script src="js/app.js">')
html += '''<script>
window.addEventListener('message',e=>{
  if(e.data.route){ location.hash=e.data.route.replace('EXAM', ex1.id).replace('STUDENT', studs[0].id); }
  if(e.data.check){
    const over=document.documentElement.scrollWidth > innerWidth;
    parent.postMessage({check: innerWidth+'px '+location.hash+': '+(over?'OVERFLOW':'OK')}, '*');
  }
});
window.addEventListener('hashchange',()=>parent.postMessage({ready:true},'*'));
parent.postMessage({ready:true},'*');
</script>'''
harness = '''<!doctype html><html><meta charset="utf-8"><title>Optik tasarım kontrolü</title>
<style>body{margin:0;background:#dce2e7;font:14px system-ui}header{padding:10px;display:flex;gap:10px;align-items:center;background:white;position:sticky;top:0}button,select{padding:8px}iframe{display:block;border:0;margin:18px auto;background:white;height:1000px}#log{font-size:11px;max-height:80px;overflow:auto}</style>
<header><select id="width" aria-label="Ekran genişliği"><option>320</option><option>375</option><option selected>390</option><option>430</option><option>768</option><option>1440</option></select>
<button data-route="#/exam/EXAM/stats">Analiz</button><button data-route="#/exam/EXAM/send">Karne</button><button data-route="#/result/EXAM/STUDENT">Öğrenci</button><button data-route="#/exam/EXAM">Sınav</button><button id="check">Kontrol et</button><button id="all">Tüm boyutları kontrol et</button></header><div id="log"></div><iframe id="preview" title="Tasarım önizlemesi" style="width:390px"></iframe>
<script>const frame=document.querySelector('iframe');frame.src='/tmp/preview-app.html';
const log=t=>document.querySelector('#log').textContent+=t+' | ';
const check=()=>frame.contentWindow.postMessage({check:true},'*');
document.querySelector('#width').onchange=e=>{frame.style.width=e.target.value+'px';setTimeout(check,100)};
document.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>frame.contentWindow.postMessage({route:b.dataset.route},'*'));
document.querySelector('#check').onclick=check;
window.addEventListener('message',e=>{if(e.data.error)log('ERROR: '+e.data.error);if(e.data.check)log(e.data.check);if(e.data.ready)setTimeout(check,100)});
document.querySelector('#all').onclick=async()=>{
 for(const w of [320,375,390,430,768,1440]) { frame.style.width=w+'px';
  for(const route of ['#/exam/EXAM/stats','#/exam/EXAM/send','#/result/EXAM/STUDENT','#/exam/EXAM']) {
   frame.contentWindow.postMessage({route},'*');await new Promise(r=>setTimeout(r,160));check();await new Promise(r=>setTimeout(r,60));
  }
 }frame.style.width='390px';frame.contentWindow.postMessage({route:'#/exam/EXAM/stats'},'*');log('ALL CHECKS COMPLETE');
};</script></html>'''.replace('DOC',json.dumps(html,ensure_ascii=False).replace('</script','<\\/script'))
html += '<script src="/tmp/verify-ui.js"></script>'
Path('tmp/preview-app.html').write_text(html,encoding='utf-8')
harness = harness.replace('frame.srcdoc='+json.dumps(html,ensure_ascii=False).replace('</script','<\\/script'), "frame.src='/tmp/preview-app.html'")
Path('tmp/design-preview.html').write_text(harness,encoding='utf-8')
