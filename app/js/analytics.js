// Öğretmen genel görünümü. Netli ve puanlı sınavlar 100'lük ölçekte karşılaştırılır.
const Analytics = (() => {
  const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const rounded = n => Math.round(n * 10) / 10;
  // classIds / examIds: tek kimlik ya da kimlik dizisi (ör. 5A, 5B, 5C'nin ortak sınavı); null = hepsi.
  const idSet = v => v == null ? null : new Set([].concat(v));
  // questionGroup: sınavın soru grubu (ör. ortak sınavın anahtarı). Aynı gruptaki sınavların aynı kitapçıktaki
  // aynı sorusu tüm sınıflarda tek soru olarak toplanır; verilmezse her sınav kendi başına değerlendirilir.
  function summarize(classIds = null, examIds = null, questionGroup = exam => exam.id) {
    const classSet = idSet(classIds), examSet = idSet(examIds);
    const exams = Store.exams().filter(e => (!classSet || classSet.has(e.classId)) && (!examSet || examSet.has(e.id)));
    const classes = Store.classes().filter(c => !classSet || classSet.has(c.id));
    const entries = [], questions = [], topics = [], summaries = [];
    let read = 0, expected = 0, excluded = 0;
    const excludedReasons = { booklet: 0, key: 0, uncertain: 0 };
    const questionMap = new Map();
    for (const exam of exams) {
      const roster = Store.roster(exam); // sınava girmeyecek öğrenciler hesaba katılmaz
      const studentIds = new Set(roster.map(s => s.id));
      const results = Store.results(exam.id).filter(r => studentIds.has(r.studentId));
      const rows = [], topicMap = new Map(), group = questionGroup(exam);
      read += results.length; expected += roster.length;
      for (const result of results) {
        const multi = Store.bookletCount(exam) > 1;
        if (multi && (!Number.isInteger(result.booklet) || result.booklet < 0 || result.booklet >= Store.bookletCount(exam))) {
          excluded++; excludedReasons.booklet++; continue;
        }
        if (result.uncertain?.length) { excluded++; excludedReasons.uncertain++; continue; }
        const score = Store.scoreResult(exam, result);
        if (!score.counted) { excluded++; excludedReasons.key++; continue; }
        const value = Store.usesPoints(exam) ? score.points : score.pct;
        const row = { exam, result, score, value, student: Store.getStudent(result.studentId) };
        entries.push(row); rows.push(row);
        const booklet = Store.bookletOf(exam, result);
        score.per.forEach((answer, q) => {
          if (answer === 'x') return;
          const id = `${group}/${booklet}/${q}`;
          if (!questionMap.has(id)) questionMap.set(id, { exam, exams: [], byClass: new Map(), booklet, q, correct: 0, wrong: 0, blank: 0, total: 0 });
          const item = questionMap.get(id);
          if (!item.exams.includes(exam)) item.exams.push(exam);
          if (!item.byClass.has(exam.classId)) item.byClass.set(exam.classId, { wrong: 0, total: 0 });
          const cls = item.byClass.get(exam.classId);
          item.total++; cls.total++;
          if (answer === 'y') cls.wrong++;
          item[answer === 'd' ? 'correct' : answer === 'y' ? 'wrong' : 'blank']++;
        });
        (Store.topicScores(exam, result) || []).forEach((topic, i) => {
          if (!topic.total) return;
          if (!topicMap.has(i)) topicMap.set(i, { exam, name: topic.name, correct: 0, total: 0, students: 0 });
          const item = topicMap.get(i);
          item.correct += topic.correct; item.total += topic.total; item.students++;
        });
      }
      topics.push(...topicMap.values());
      summaries.push({ exam, average: mean(rows.map(r => r.value)), count: rows.length, read: results.length, expected: roster.length });
    }
    questions.push(...questionMap.values());
    const studentMap = new Map();
    for (const row of entries) {
      if (!studentMap.has(row.student.id)) studentMap.set(row.student.id, { student: row.student, values: [], count: 0 });
      const student = studentMap.get(row.student.id);
      student.values.push(row.value); student.count++;
    }
    const ranking = [...studentMap.values()].map(s => ({ ...s, average: mean(s.values), expected: exams.filter(e => e.classId === s.student.classId && !Store.isAbsent(e, s.student.id)).length }))
      .sort((a, b) => rounded(b.average) - rounded(a.average) || a.student.name.localeCompare(b.student.name, 'tr'));
    ranking.forEach((row, i) => { row.rank = i && rounded(row.average) === rounded(ranking[i - 1].average) ? ranking[i - 1].rank : i + 1; });
    const classRows = classes.map(cls => {
      const rows = entries.filter(r => r.exam.classId === cls.id);
      return { cls, average: mean(rows.map(r => r.value)), count: rows.length, students: new Set(rows.map(r => r.student.id)).size };
    });
    const values = entries.map(r => r.value).sort((a, b) => a - b);
    const median = values.length ? (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2 : null;
    const distribution = [0, 0, 0, 0, 0];
    entries.forEach(r => distribution[Math.min(4, Math.max(0, Math.floor(r.value / 20)))]++);
    return {
      exams, entries, summaries, classes: classRows, ranking, read, expected, excluded, excludedReasons,
      average: mean(values), median, distribution,
      correct: entries.reduce((n, r) => n + r.score.correct, 0),
      wrong: entries.reduce((n, r) => n + r.score.wrong, 0),
      blank: entries.reduce((n, r) => n + r.score.blank, 0),
      questions: questions.filter(q => q.wrong).sort((a, b) => b.wrong / b.total - a.wrong / a.total || b.wrong - a.wrong || a.exam.id - b.exam.id || a.q - b.q),
      topics: topics.sort((a, b) => a.correct / a.total - b.correct / b.total),
    };
  }
  return { summarize };
})();
