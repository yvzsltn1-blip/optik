const Topics = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let shared = [], libraryGrade = 5, librarySearch = '', hooks;
  try { shared = JSON.parse(localStorage.getItem('optik-ortak-konular') || '[]'); } catch (_) {}
  const drafts = new Map();
  function setShared(items) {
    shared = items;
    try { localStorage.setItem('optik-ortak-konular', JSON.stringify(items)); } catch (_) {}
  }
  function list(grade) {
    const merged = new Map(TOPIC_SEEDS.map(t => [t.id, {...t}]));
    for (const item of shared) merged.set(item.id, {...merged.get(item.id), ...item});
    return [...merged.values()].filter(t => !t.deleted && (!grade || t.grade === grade))
      .sort((a,b) => a.grade-b.grade || (a.order ?? 1000)-(b.order ?? 1000) || a.name.localeCompare(b.name,'tr'));
  }
  function parseQuestions(text, max) {
    const out = new Set();
    for (const segment of text.trim().split(/[,;]/)) {
      const part = segment.trim();
      if (!part) { if (text.trim()) throw Error('Soru seçimini kontrol edin. Örnek: 1-12, 14-20'); else continue; }
      const match = part.match(/^(\d+)\s*(?:[-–—]\s*(\d+))?$/);
      if (!match) throw Error(`Soru seçimi anlaşılamadı: ${part}. Örnek: 1-12, 14, 17-20`);
      const from=+match[1], to=+(match[2]||match[1]);
      if(from<1 || to<from || to>max) throw Error(`Soru numarası 1–${max} arasında olmalı: ${part}`);
      for(let q=from;q<=to;q++) out.add(q);
    }
    return [...out].sort((a,b)=>a-b);
  }
  function formatQuestions(numbers) {
    const sorted=[...new Set(numbers)].sort((a,b)=>a-b), segments=[];
    for(let i=0;i<sorted.length;i++) { const from=sorted[i];let to=from;while(sorted[i+1]===to+1)to=sorted[++i];segments.push(from===to?String(from):`${from}-${to}`); }
    return segments.join(', ');
  }
  function assignments(rows, max) {
    const used=new Map();
    for(const row of rows) {
      if(!row.text.trim()&&!row.name)continue;
      if(!row.name)throw Error('Her soru seçimi için bir konu seçin.');
      const numbers=parseQuestions(row.text,max);
      if(!numbers.length)throw Error(`“${row.name}” için soru veya aralık seçin.`);
      const key=row.topicId || `${row.grade||''}/${row.name.toLocaleLowerCase('tr-TR')}`;
      for(const q of numbers) {
        if(used.has(q)&&used.get(q).key!==key)throw Error(`${q}. soru iki farklı konuya atanmış. Her soruya tek konu seçin.`);
        used.set(q,{key,name:row.name,topicId:row.topicId,grade:row.grade});
      }
    }
    const result=[];
    for(const q of [...used.keys()].sort((a,b)=>a-b)) {
      const value=used.get(q),last=result[result.length-1];
      if(last&&last._key===value.key&&last.to===q-1)last.to=q;
      else result.push({_key:value.key,from:q,to:q,name:value.name,...(value.topicId?{topicId:value.topicId}:{}),...(value.grade?{grade:value.grade}:{})});
    }
    return result.map(({_key,...item})=>item);
  }
  function draft(exam) {
    const signature=JSON.stringify([exam.questionCount,exam.topics||[]]);
    let state=drafts.get(exam.id);
    if(!state||(!state.dirty&&state.signature!==signature)) {
      const inferred=+(Store.getClass(exam.classId)?.name.match(/^\d+/)?.[0]||5);
      state={signature,dirty:false,grade:Math.min(12,Math.max(1,inferred)),rows:Store.examTopics(exam).map(t=>({name:t.name,topicId:t.topicId||'',grade:t.grade,text:formatQuestions(t.questions)}))};
      if(!state.rows.length)state.rows.push({name:'',topicId:'',text:''});
      drafts.set(exam.id,state);
    }
    return state;
  }
  function options(row,grade) {
    const items=list(grade),exists=items.some(t=>t.id===row.topicId);
    return `<option value="">Konu seçin</option>${row.name&&!exists?`<option value="@saved" selected>${esc(row.name)} · kayıtlı eşleştirme</option>`:''}${items.map(t=>`<option value="${esc(t.id)}" ${row.topicId===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}`;
  }
  const gradeOptions=grade=>Array.from({length:12},(_,i)=>`<option value="${i+1}" ${grade===i+1?'selected':''}>${i+1}. sınıf</option>`).join('');
  function rowHTML(row,i,state,exam) {
    let selected=[];try{selected=parseQuestions(row.text,exam.questionCount);}catch(_){}
    return `<div class="topic-assignment" data-topic-row="${i}"><div class="topic-assignment-head"><b>Eşleştirme ${i+1}</b><button type="button" class="topic-remove" data-topic-remove="${i}" aria-label="${i+1}. eşleştirmeyi kaldır">×</button></div>
      <label class="field"><span>Konu</span><select data-topic-select="${i}" aria-label="${i+1}. eşleştirme konusu">${options(row,state.grade)}</select></label>
      <div class="topic-question-controls"><label class="field"><span>Soru / aralık</span><input type="text" data-topic-range="${i}" value="${esc(row.text)}" placeholder="Örn. 1-12, 14-20" aria-label="${i+1}. eşleştirme soruları" autocomplete="off"></label><button type="button" class="btn small" data-topic-pick="${i}">Soruları seç</button></div>
      <div class="topic-question-grid" ${row.picking?'':'hidden'} role="group" aria-label="${i+1}. eşleştirme için soruları seç">${Array.from({length:exam.questionCount},(_,q)=>`<button type="button" data-topic-question="${q+1}" data-topic-index="${i}" aria-label="${q+1}. soru" aria-pressed="${selected.includes(q+1)}">${q+1}</button>`).join('')}</div></div>`;
  }
  function editor(exam) {
    const state=draft(exam);
    return `<div class="topic-editor" data-topic-exam="${exam.id}"><div class="topic-editor-heading"><div><h3>Soruları konularla eşleştirin</h3><p>Aralık yazın ya da soru numaralarına dokunarak seçin.${Store.bookletCount(exam)>1?' A kitapçığının soru numaraları kullanılır.':''}</p></div><a class="btn small" href="#/topics/${exam.id}">Konuları yönet</a></div>
      <label class="field topic-grade"><span>Konu listesinin sınıfı</span><select data-topic-grade>${gradeOptions(state.grade)}</select></label>
      <div class="topic-assignments">${state.rows.map((row,i)=>rowHTML(row,i,state,exam)).join('')}</div>
      <button type="button" class="btn block" data-topic-add>+ Eşleştirme ekle</button><p class="small muted">Örnek: 1–12 ve 14–20 aynı konuya; 13 başka konuya atanabilir.</p></div>`;
  }
  function libraryView() {
    const items=list(libraryGrade).filter(t=>`${t.name} ${t.unit}`.toLocaleLowerCase('tr-TR').includes(librarySearch.toLocaleLowerCase('tr-TR')));
    return `<div class="collection-intro"><span class="eyebrow">ORTAK MATEMATİK KONU LİSTESİ</span><h2>Konu kütüphanesi</h2><p>Giriş yapan tüm öğretmenler konu ekleyebilir, düzenleyebilir ve silebilir. Değişiklikler herkesin listesine yansır.</p></div>
      <div class="topic-library-tools"><label class="field"><span>Sınıf</span><select data-library-grade>${gradeOptions(libraryGrade)}</select></label><button class="btn primary" data-topic-new>+ Konu ekle</button></div>
      <label class="field"><span>Konu ara</span><input type="text" data-library-search value="${esc(librarySearch)}" placeholder="Konu adı veya tema"></label><p class="small muted">${items.length} konu · 5. ve 7. sınıf başlangıç başlıkları matematik projenizden alındı.</p>
      <div class="topic-library-list">${items.map(t=>`<div class="topic-library-row"><div><b>${esc(t.name)}</b><small>${t.grade}. sınıf${t.unit?' · '+esc(t.unit):''}</small></div><button class="topic-icon-button" data-topic-edit="${esc(t.id)}" aria-label="${esc(t.name)} konusunu düzenle">Düzenle</button><button class="topic-icon-button topic-delete" data-topic-delete="${esc(t.id)}" aria-label="${esc(t.name)} konusunu sil">Sil</button></div>`).join('')||'<div class="card empty">Bu sınıfta henüz konu yok. “Konu ekle” ile oluşturabilirsiniz.</div>'}</div>`;
  }
  function editTopic(id) {
    const topic=list().find(t=>t.id===id)||{name:'',unit:'',grade:libraryGrade};
    hooks.modal(id?'Ortak konuyu düzenle':'Ortak listeye konu ekle',`<p class="small muted">Bu değişiklik tüm öğretmenlerin konu listesine yansır. Önceden kaydedilmiş sınav eşleştirmeleri korunur.</p><label class="field"><span>Sınıf</span><select name="grade">${gradeOptions(topic.grade)}</select></label><label class="field"><span>Konu adı</span><input type="text" name="name" required maxlength="140" value="${esc(topic.name)}"></label><label class="field"><span>Tema / ünite (isteğe bağlı)</span><input type="text" name="unit" maxlength="140" value="${esc(topic.unit)}"></label>`,(fd,form)=>{
      const name=fd.get('name').trim();if(!name){hooks.toast('Konu adını yazın.');return false;}
      const button=form.querySelector('.btn.primary');button.disabled=true;
      if(!window.Cloud?.saveTopic){button.disabled=false;hooks.toast('Konu kaydetmek için hesabınıza giriş yapın.');return false;}
      window.Cloud.saveTopic({id:id||`custom-${crypto.randomUUID()}`,name,unit:fd.get('unit').trim(),grade:+fd.get('grade'),deleted:false}).then(()=>{libraryGrade=+fd.get('grade');hooks.closeModal();hooks.render(true);hooks.toast('Ortak konu listesi güncellendi.');}).catch(error=>{button.disabled=false;hooks.toast('Konu kaydedilemedi: '+error.message);});
      return false;
    });
  }
  function bind(view,callbacks) {
    hooks=callbacks;
    const refreshEditor=(exam,state)=>{state.dirty=true;view.querySelector('.topic-editor').outerHTML=editor(exam);};
    view.addEventListener('click',event=>{
      const target=event.target.closest('button');if(!target)return;
      if(target.hasAttribute('data-topic-new')){editTopic();return;}
      if(target.dataset.topicEdit){editTopic(target.dataset.topicEdit);return;}
      if(target.dataset.topicDelete){const topic=list().find(t=>t.id===target.dataset.topicDelete);if(!topic)return;hooks.confirmBox('Konu ortak listeden silinsin mi?',`<b>${esc(topic.name)}</b> tüm öğretmenlerin konu listesinden kaldırılır. Önceden sınavlara eklenmiş eşleştirmeler korunur.`,'Ortak listeden sil',()=>{
        if(!window.Cloud?.saveTopic){hooks.toast('Önce hesabınıza giriş yapın.');return;}
        window.Cloud.saveTopic({...topic,deleted:true}).then(()=>{hooks.render(true);hooks.toast('Konu ortak listeden kaldırıldı.');}).catch(e=>hooks.toast('Konu silinemedi: '+e.message));
      });return;}
      const element=target.closest('[data-topic-exam]');if(!element)return;
      const exam=Store.getExam(+element.dataset.topicExam),state=draft(exam);
      if(target.hasAttribute('data-topic-add')){state.rows.push({name:'',topicId:'',text:''});refreshEditor(exam,state);}
      if(target.hasAttribute('data-topic-remove')){state.rows.splice(+target.dataset.topicRemove,1);refreshEditor(exam,state);}
      if(target.hasAttribute('data-topic-pick')){const row=state.rows[+target.dataset.topicPick];row.picking=!row.picking;refreshEditor(exam,state);}
      if(target.hasAttribute('data-topic-question')){const row=state.rows[+target.dataset.topicIndex];let numbers;try{numbers=parseQuestions(row.text,exam.questionCount);}catch(error){hooks.toast(error.message);return;}const q=+target.dataset.topicQuestion;row.text=formatQuestions(numbers.includes(q)?numbers.filter(n=>n!==q):numbers.concat(q));refreshEditor(exam,state);}
    });
    view.addEventListener('change',event=>{
      const target=event.target;
      if(target.hasAttribute('data-library-grade')){libraryGrade=+target.value;hooks.render(true);return;}
      const element=target.closest('[data-topic-exam]');if(!element)return;
      const exam=Store.getExam(+element.dataset.topicExam),state=draft(exam);
      if(target.hasAttribute('data-topic-grade')){state.grade=+target.value;refreshEditor(exam,state);}
      if(target.hasAttribute('data-topic-select')){const row=state.rows[+target.dataset.topicSelect],topic=list().find(t=>t.id===target.value);if(target.value!=='@saved'){row.topicId=topic?.id||'';row.name=topic?.name||'';row.grade=topic?.grade;}state.dirty=true;}
    });
    view.addEventListener('input',event=>{
      const target=event.target;
      if(target.hasAttribute('data-library-search')){librarySearch=target.value;const start=target.selectionStart;hooks.render(true);const next=view.querySelector('[data-library-search]');next.focus();next.setSelectionRange(start,start);return;}
      const element=target.closest('[data-topic-exam]');if(!element||!target.hasAttribute('data-topic-range'))return;
      const exam=Store.getExam(+element.dataset.topicExam),state=draft(exam),index=+target.dataset.topicRange;state.rows[index].text=target.value;state.dirty=true;
      let numbers=[];try{numbers=parseQuestions(target.value,exam.questionCount);}catch(_){}
      element.querySelectorAll(`[data-topic-index="${index}"]`).forEach(button=>button.setAttribute('aria-pressed',String(numbers.includes(+button.dataset.topicQuestion))));
    });
  }
  return {list,setShared,parseQuestions,formatQuestions,assignments,editor,libraryView,bind,readEditor:exam=>assignments(draft(exam).rows,exam.questionCount),saved:id=>drafts.delete(id)};
})();
