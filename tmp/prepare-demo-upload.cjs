const fs = require('fs');
const session = JSON.parse(fs.readFileSync('tmp/demo-session.json','utf8'));
const account = JSON.parse(fs.readFileSync('tmp/demo-account.json','utf8'));
const data = JSON.parse(fs.readFileSync('tmp/demo-data.json','utf8'));
if (!session.localId || !session.idToken) throw Error('Hesap oturumu eksik');
const encode = value => {
  if (value === null) return {nullValue:null};
  if (typeof value === 'string') return {stringValue:value};
  if (typeof value === 'boolean') return {booleanValue:value};
  if (typeof value === 'number') return Number.isInteger(value) ? {integerValue:String(value)} : {doubleValue:value};
  if (Array.isArray(value)) {
    // Uygulamanın cloud.js iç içe dizi kodlamasıyla aynı biçim.
    if(value.some(Array.isArray))return encode({__json:JSON.stringify(value)});
    return {arrayValue:{values:value.map(encode)}};
  }
  return {mapValue:{fields:Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>[k,encode(v)]))}};
};
const root = `projects/optik-form-903ed/databases/(default)/documents/users/${session.localId}`;
const writes = [];
for(const kind of ['classes','students','exams','results']) for(const obj of data[kind]) {
  const id = kind==='results' ? `${obj.examId}_${obj.studentId}` : obj.id;
  writes.push({update:{name:`${root}/${kind}/${id}`,fields:encode(obj).mapValue.fields},currentDocument:{exists:false}});
}
for(let i=0;i<writes.length;i+=250)fs.writeFileSync(`tmp/demo-batch-${i/250+1}.json`,JSON.stringify({writes:writes.slice(i,i+250)}));
fs.writeFileSync('tmp/demo-profile-request.json',JSON.stringify({idToken:session.idToken,displayName:account.displayName,returnSecureToken:false}));
console.log(JSON.stringify({documents:writes.length,batches:Math.ceil(writes.length/250)}));
