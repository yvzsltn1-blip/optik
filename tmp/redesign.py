from pathlib import Path

p = Path('app/js/app.js')
s = p.read_text(encoding='utf-8')
start = s.index('    return `\n      <div class="stats">', s.index('  function statsView'))
end = s.index('      ${topicsHtml}', start)
s = s[:start] + '''    return `
      <div class="page-intro"><span class="eyebrow">Ölçme & değerlendirme</span><h2>${esc(e.name)}</h2><p>${esc(Store.getClass(e.classId)?.name || '')} <span aria-hidden="true">·</span> ${fmtDate(e.date)} <span aria-hidden="true">·</span> ${n} öğrenci değerlendirildi</p></div>
      <section class="analysis-hero" aria-label="Sınıf başarı özeti">
        <div><span class="eyebrow">Sınıf ortalaması</span><div class="hero-value">${fmt(st.avg, 1)}<small>${lbl}</small></div><p class="hero-caption">En yüksek ${fmt(st.max, 1)} <span aria-hidden="true">/</span> En düşük ${fmt(st.min, 1)}</p></div>
        <div class="hero-aside"><b>%${Math.round(success)}</b><span>Başarı oranı</span><div class="hero-meter"><i style="width:${Math.max(0, Math.min(100, success))}%"></i></div></div>
      </section>
      <div class="analysis-metrics"><div><span>Katılım</span><b>${n}<span style="display:inline;font-size:12px;font-weight:400"> / ${Store.students(e.classId).length}</span></b></div><div><span>Medyan ${lbl}</span><b>${fmt(median, 1)}</b></div><div><span>Standart sapma</span><b>${fmt(sd, 1)}</b></div></div>
      <div class="analytics-grid">
        <section class="card pad"><div class="section-head"><div><h2>${pts ? 'Puan' : 'Net'} dağılımı</h2><p>Sınıfın genel performans görünümü</p></div><span class="section-index">01</span></div>
          <div class="hist" role="img" aria-label="${esc(hist.map((v, i) => `%${i * 10}–${i * 10 + 10}: ${v} öğrenci`).join('; '))}">${hist.map((v, i) => `<div class="${v && v === hmax ? 'peak' : ''}" title="%${i * 10}–${i * 10 + 10}: ${v} öğrenci"><div class="hist-column"><b>${v || ''}</b><i style="height:${hmax ? v / hmax * 106 : 0}px"></i></div><small>${i * 10}</small></div>`).join('')}</div>
          <div class="chart-foot"><span>${pts ? 'Puan aralığı · 100 üzerinden' : 'Net / soru sayısı (%)'}</span><span>${n} öğrenci</span></div>
        </section>
        <section class="card pad"><div class="section-head"><div><h2>Soruların zorluk dengesi</h2><p>${nb > 1 ? L[bk] + ' kitapçığı · ' : ''}${valid.length} değerlendirilen soru</p></div><span class="section-index">02</span></div>
          ${['Kolay', 'Orta', 'Zor'].map((d, i) => `<div class="difficulty-row"><span>${d}</span><div class="bar ${['ok', 'warn', 'bad'][i]}"><i style="width:${valid.length ? diff[d] / valid.length * 100 : 0}%"></i></div><b>${diff[d]} soru</b></div>`).join('')}
          <p class="insight-note">Doğru cevap oranı %70 ve üzeri kolay, %40’ın altı zor olarak değerlendirilir.</p>
        </section>
      </div>
      ${nb > 1 ? `<h2>Kitapçık bazında inceleme</h2>${bookletTabs(e, bk, (b) => `#/exam/${id}/stats/${b}`)}<p class="small muted">${L[bk]} kitapçığı · ${group.length} öğrenci</p>` : ''}
      <section class="analysis-section"><div class="section-head"><div><h2>Birlikte gözden geçirelim</h2><p>En çok yanlış yapılan sorular · Ayrıntı için dokunun</p></div><span class="section-index">03</span></div>
        ${mostWrong.length ? `<div class="question-cards">${mostWrong.map((q) => `<button type="button" class="question-card" ${qd(q)} aria-label="${q.i + 1}. soru: ${q.wrong} yanlış, ${q.right} doğru, ${q.blank} boş. Ayrıntıları aç"><span class="question-number">${String(q.i + 1).padStart(2, '0')}</span><span class="question-body"><strong>${q.wrong} öğrenci yanlış yanıtladı</strong>${stackBar(q)}<small>${q.right} doğru · ${q.blank} boş · Cevap ${L[q.key]}</small>${q.distractor ? `<small>En çok seçilen yanlış: ${L[q.distractor.opt]} (${q.distractor.count})</small>` : ''}</span><span class="question-arrow" aria-hidden="true">›</span></button>`).join('')}</div>` : '<div class="card empty">Yanlış yanıt bulunmuyor. Soru ayrıntılarını aşağıdan inceleyebilirsiniz.</div>'}
      </section>

''' + s[end:]
s = s.replace('''      <h2>Tüm sorular</h2>
      <div class="card scroll-x"><table class="tbl">''', '''      <h2>Ayrıntılı inceleme</h2>
      <details class="card detail-disclosure"><summary>Tüm sorular<span>${e.questionCount} soru · Cevap ve şık dağılımları</span></summary>
      <div class="scroll-x" tabindex="0" role="region" aria-label="Soru analizi tablosu; yatay kaydırılabilir"><table class="tbl">''')
s = s.replace('''class="${q.rate == null ? '' : 'tap'}"><td><b>${q.i + 1}</b></td>''', '''class="${q.rate == null ? '' : 'tap'}"><td><button class="question-link" ${qd(q)} aria-label="${q.i + 1}. soru ayrıntıları">${q.i + 1}</button></td>''')
s = s.replace('''      <h2>Öğrenci × soru haritası</h2>
      ${matrix}`;''', '''      </details>
      <details class="card detail-disclosure"><summary>Öğrenci & soru haritası<span>${group.length} öğrenci · Tüm yanıtları karşılaştırın</span></summary>${matrix}</details>`;''')
s = s.replace('''const matrix = `<div class="card scroll-x">''', '''const matrix = `<div class="card scroll-x" tabindex="0" role="region" aria-label="Öğrenci soru haritası; yatay kaydırılabilir">''')
s = s.replace('''<th ${qd(q)}>${q.i + 1}</th>''', '''<th><button ${qd(q)} aria-label="${q.i + 1}. soru ayrıntıları">${q.i + 1}</button></th>''')
p.write_text(s, encoding='utf-8')
