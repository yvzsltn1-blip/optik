(() => {
  const checks = [];
  const check = (name, ok) => { checks.push({name,ok:!!ok}); if(!ok) throw Error(name); };
  try {
    document.querySelector('.question-card').click();
    check('Question detail opens', !document.querySelector('#modal').hidden);
    document.querySelector('#modal button[data-close]').click();
    check('Question detail closes', document.querySelector('#modal').hidden);
    document.querySelector('details summary').click();
    check('Question table expands', document.querySelector('details').open);
    document.querySelector('.question-link').click();
    check('Table question opens detail', !document.querySelector('#modal').hidden);
    document.querySelector('#modal button[data-close]').click();
    location.hash = '#/exam/'+ex1.id+'/send'; App.render();
    check('Report preview is generated', document.querySelector('.report-preview img').src.startsWith('data:image/jpeg'));
    document.querySelector('[data-opt="rank"]').click();
    check('Rank option updates', document.querySelector('[data-opt="rank"]').checked);
    document.querySelector('[data-fmt="text"]').click();
    check('Text format works', !document.querySelector('.report-preview'));
    document.querySelector('[data-fmt="image"]').click();
    check('Image format works', !!document.querySelector('.report-preview img'));

    // Gerçek tuval metin ölçüleriyle kenarlardan taşma ve alt kesilme denetimi.
    const original = CanvasRenderingContext2D.prototype.fillText;
    let bounds = [];
    CanvasRenderingContext2D.prototype.fillText = function(text,x,y,...rest) {
      const w=this.measureText(text).width;
      const left=this.textAlign==='right'?x-w:this.textAlign==='center'?x-w/2:x;
      bounds.push({text,left,right:left+w,y,height:this.canvas.height});
      return original.call(this,text,x,y,...rest);
    };
    const sample = {examName:'Matematik 1. Deneme', dateText:'10 Ekim 2026', className:'8-A',studentName:'Zeynep Kaya',number:'103',booklet:'A',mainValue:82.5,mainMax:100,mainLabel:'Puan',ratio:.825,correct:34,wrong:4,blank:2,net:33,showNet:true,avg:63.9,rank:3,of:24,topics:[{name:'Çarpanlar ve katlar',correct:9,total:10},{name:'Üslü ifadeler',correct:8,total:10},{name:'Kareköklü ifadeler',correct:10,total:10},{name:'Veri analizi ve olasılık',correct:7,total:10}],wrongList:[4,18,25,32],teacher:'Selin Yılmaz'};
    let report,long;
    try {
      report=ReportCard.render(sample);
      check('Report text inside canvas',bounds.every(b=>b.left>=0&&b.right<=1080&&b.y<b.height-10));
      check('JPG blob export', ReportCard.toBlob(report).size>10000);
      bounds=[];
      long=ReportCard.render({...sample,studentName:'Zeynep Abdullah Uzunsoy Demircioğlu Çok Uzun Öğrenci Adı',examName:'2026–2027 Eğitim Öğretim Yılı Matematik ve Fen Bilimleri Genel Değerlendirme Sınavı',teacher:'Öğretmen Selin Yılmaz Demircioğlu Uzun Öğretmen Adı',mainValue:-6.25, mainMax:100,mainLabel:'Net',showNet:false,ratio:0,topics:Array.from({length:12},(_,i)=>({name:'Konu '+(i+1)+' · Çok uzun kazanım açıklaması ve değerlendirme başlığının farklı satırlarda gösterimi',correct:i%10,total:10})),wrongList:Array.from({length:100},(_,i)=>i+1)});
      check('Long report text inside canvas',bounds.every(b=>b.left>=0&&b.right<=1080&&b.y<b.height-10));
      check('All 12 topics included',bounds.filter(b=>/^Konu \d+/.test(b.text)).length===12);
      check('All 100 question numbers included',bounds.some(b=>b.text==='100'));
    } finally {CanvasRenderingContext2D.prototype.fillText=original;}
    fetch('/save-design-check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({report:report.toDataURL('image/png'),'report-long':long.toDataURL('image/png'),checks})});
    parent.postMessage({check:'INTERACTIONS AND REPORT: '+checks.length+' checks passed'},'*');
    location.hash='#/exam/'+ex1.id+'/stats';App.render();
  } catch(e) {parent.postMessage({error:e.message},'*');console.error(e);}
})();
