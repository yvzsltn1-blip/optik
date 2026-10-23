process.env.NODE_ENV='test';
const { _createTeacher:create }=require('../functions');
const assert=require('assert');
const admin={uid:'admin-uid',email:'elifslymn@gmail.com',disabled:false,tokensValidAfterTime:'2026-01-01T00:00:00Z'};
let created=[];
const service={getUserByEmail:async()=>admin,createUser:async data=>{created.push(data);return{uid:'new',...data}}};
const request=(uid,data)=>({auth:{uid,token:{auth_time:1800000000}},data});
(async()=>{
 await assert.rejects(create({},service),e=>e.code==='unauthenticated');
 await assert.rejects(create(request('other',{email:'a@example.com',password:'12345678'}),service),e=>e.code==='permission-denied');
 assert.equal(created.length,0);
 await assert.rejects(create(request('admin-uid',{email:'bad',password:'12345678'}),service),e=>e.code==='invalid-argument');
 await assert.rejects(create(request('admin-uid',{email:'a@example.com',password:'short'}),service),e=>e.code==='invalid-argument');
 admin.disabled=true;await assert.rejects(create(request('admin-uid',{}),service),e=>e.code==='permission-denied');admin.disabled=false;
 const expired=request('admin-uid',{});expired.auth.token.auth_time=1;await assert.rejects(create(expired,service),e=>e.code==='unauthenticated');
 const result=await create(request('admin-uid',{email:'Teacher@Example.COM',password:'GoodPass!123',name:'Yeni Öğretmen'}),service);
 assert.equal(result.email,'teacher@example.com');assert.equal(result.password,undefined);assert.equal(created.length,1);
 console.log('PASS: unauthenticated and non-admin blocked; validation, disabled/revoked sessions, admin creation, no password returned.');
})().catch(e=>{console.error(e);process.exitCode=1});
