import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {createHmac} from "node:crypto";
import {readFile} from "node:fs/promises";
const green=await readFile(new URL("../next-green-gas/Code.gs",import.meta.url),"utf8");
const adapter=await readFile(new URL("../assessment-adapter-gas/Code.gs",import.meta.url),"utf8");
const assessment=await readFile(new URL("../next/assessment.js",import.meta.url),"utf8");
const slip=await readFile(new URL("../next/slip.js",import.meta.url),"utf8");

test("hope choices parse Japanese dates, all three slots and padded times",()=>{
 const start=assessment.indexOf("  function visitChoices(c)"),end=assessment.indexOf("  function visitChoicesHtml",start);
 const ctx=vm.createContext({K:{keyDate:()=>"2026-10-02"}});
 vm.runInContext(assessment.slice(start,end),ctx);
 const choices=ctx.visitChoices({hope:"① 10/3（土） 10:00〜12:00\n② 2026/10/4（日） 9:00～11:00\n③ 10/5（月） 14:00〜16:00"});
 assert.deepEqual(JSON.parse(JSON.stringify(choices.map(({date,start,end})=>({date,start,end})))),[{date:"2026-10-03",start:"10:00",end:"12:00"},{date:"2026-10-04",start:"09:00",end:"11:00"},{date:"2026-10-05",start:"14:00",end:"16:00"}]);
});

function greenContext(rows=[]){
 let appended=[];
 const ctx=vm.createContext({});vm.runInContext(green,ctx);
 ctx.findRow_=()=>0;ctx.sh_=()=>({getDataRange:()=>({getDisplayValues:()=>[Object.keys(rows[0]||{appointmentId:"",caseId:"",date:"",startTime:"",endTime:"",category:"",status:""}),...rows.map(Object.values)]})});
 ctx.appendObject_=(_name,obj)=>appended.push(obj);ctx.audit_=()=>{};
 return {ctx,appended};
}
const hold={appointmentId:"NEXT-VISIT-KR-A",caseId:"KR-A",date:"2026-10-03",startTime:"10:00",endTime:"12:00",category:"買取",status:"tentative"};
test("server rejects overlapping tentative slots including separate staff clients",()=>{
 const {ctx,appended}=greenContext([hold]);
 assert.throws(()=>ctx.opAppointmentUpsert_("NEXT-APT-B",{...hold,caseId:"KR-B",startTime:"11:00",endTime:"13:00"},"key"),/仮押さえ/);
 assert.equal(appended.length,0);
 ctx.opAppointmentUpsert_("NEXT-APT-B",{...hold,caseId:"KR-B",startTime:"12:00",endTime:"14:00"},"key");
 assert.equal(appended.length,1);
});
test("cancelled reservations release their slot and updating the same case is allowed",()=>{
 const {ctx}=greenContext([{...hold,status:"cancelled"}]);
 assert.doesNotThrow(()=>ctx.opAppointmentUpsert_("NEXT-APT-B",{...hold,caseId:"KR-B"},"key"));
 const same=greenContext([hold]);
 assert.doesNotThrow(()=>same.ctx.opAppointmentUpsert_(hold.appointmentId,{...hold,status:"confirmed"},"key"));
});
test("calendar projects pending confirmation and confirmed visits, excluding draft and cancellation",()=>{
 const ctx=vm.createContext({});vm.runInContext(adapter,ctx);
 ctx.cachedDashboard_=()=>({cases:[
 {id:"KR-A",name:"A",visitDateKey:"2026-10-03",visitTime:"10:00〜12:00",status:"🔵 買取確定",nextAction:"お客様日時確認待ち"},
 {id:"KR-B",name:"B",visitDateKey:"2026-10-04",visitTime:"10:00〜12:00",status:"✅ 訪問日時確定"},
 {id:"KR-C",visitDateKey:"2026-10-05",visitTime:"10:00〜12:00",status:"🟡 査定中"},
 {id:"KR-D",visitDateKey:"2026-10-05",visitTime:"10:00〜12:00",status:"⚫ キャンセル"}
 ]});
 const result=ctx.blueVisitAppointments_(true);
 assert.equal(result.length,2);assert.equal(result[0].status,"tentative");assert.equal(result[1].status,"confirmed");
});
test("PDF groups have separate items and totals, with positive customer receipt amounts",()=>{
 const {ctx}=greenContext();let captured="";
 ctx.HtmlService={createHtmlOutput:html=>({getBlob:()=>({getAs:()=>({setName(){return this}})})})};
 ctx.HtmlService.createHtmlOutput=html=>{captured=html;return {getBlob:()=>({getAs:()=>({setName(){return this}})})}};
 ctx.MimeType={PDF:"application/pdf"};ctx.Utilities={formatDate:()=>"20261002-120000"};
 ctx.DriveApp={getFolderById:()=>({createFile:()=>({getId:()=>"fixture",getUrl:()=>"fixture-url"})})};
 const snap={version:2,caseId:"TEST",total:14000,payload:{customer:{name:"確認用のお客様",address:"千葉県流山市"},items:{purchase:[{category:"冷蔵庫",maker:"テストメーカー",model:"RF-TEST",year:"2024",amount:5000}],work:[{category:"設置工事",amount:12000}],recycle:[{category:"旧冷蔵庫回収",amount:7000}]}}};
 ctx.createCustomerPdf_(snap,"","recycle");assert.match(captured,/旧冷蔵庫回収/);assert.doesNotMatch(captured,/RF-TEST|設置工事/);assert.match(captured,/¥7,000/);
 ctx.createCustomerPdf_(snap,"","other");assert.match(captured,/RF-TEST/);assert.match(captured,/設置工事/);assert.doesNotMatch(captured,/旧冷蔵庫回収/);assert.match(captured,/お客様お支払額/);assert.match(captured,/¥7,000/);assert.doesNotMatch(captured,/¥-5,000/);
 snap.payload.items.work=[];ctx.createCustomerPdf_(snap,"","other");assert.match(captured,/お客様受取額/);assert.doesNotMatch(captured,/¥-5,000/);
});

test("customer PDF links enforce signature, expiry and a confirmed immutable document",()=>{
 const {ctx}=greenContext();const props=new Map([["PDF_CUSTOMER_LINK_SIGNING_KEY","test-key"]]);
 ctx.PropertiesService={getScriptProperties:()=>({getProperty:key=>props.get(key),setProperty:(key,value)=>props.set(key,value)})};
 ctx.Utilities={computeHmacSha256Signature:(body,key)=>createHmac("sha256",key).update(body).digest(),base64EncodeWebSafe:bytes=>Buffer.from(bytes).toString("base64url"),base64Encode:bytes=>Buffer.from(bytes).toString("base64")};
 const doc={documentId:"NEXTDOC-test",type:"customer-copy",fileId:"test-file",serviceOrderId:"test-order",fileName:"test-other.pdf",version:2};
 ctx.findRow_=()=>2;ctx.sh_=name=>name;ctx.rowObject_=name=>name==="DOCUMENTS"?doc:{customerConfirmed:true};
 ctx.DriveApp={getFileById:id=>{assert.equal(id,"test-file");return {getBlob:()=>({getBytes:()=>Buffer.from("%PDF-fixture")})}}};
 const token=ctx.customerPdfToken_(doc);
 assert.equal(ctx.customerPdfByToken_(token).version,2);
 assert.throws(()=>ctx.customerPdfByToken_(token.replace("NEXTDOC-test","NEXTDOC-other")),/無効/);
 assert.throws(()=>ctx.customerPdfByToken_(token.replace(/\.\d+\./,".1.")),/期限切れ/);
 ctx.rowObject_=name=>name==="DOCUMENTS"?doc:{customerConfirmed:false};
 assert.throws(()=>ctx.customerPdfByToken_(token),/確認が完了/);
});

test("calendar projection retains staff, linked slips and completed appointments",()=>{
 const ctx=vm.createContext({});vm.runInContext(adapter,ctx);
 const prior={...hold,assignedEmployeeIds:'["STAFF-1"]',serviceOrderId:"UT-001"},visit={...hold,status:"confirmed"};
 const projected=ctx.overlayBlueVisits_([prior],[visit]);
 assert.equal(projected[0].assignedEmployeeIds,prior.assignedEmployeeIds);assert.equal(projected[0].serviceOrderId,"UT-001");
 assert.equal(ctx.overlayBlueVisits_([{...prior,status:"completed"}],[visit])[0].status,"completed");
});

test("prepared SMS opens the registered recipient with a version-specific link and no new network wait",async()=>{
 const sms={dataset:{slip:"UT-TEST",phone:"090-0000-0000",version:"2"}},status={};
 const ctx=vm.createContext({URL,location:{href:"https://ichimaru1031031.github.io/kaitori-form/next/"},navigator:{userAgent:"iPhone"},K:{$:selector=>selector==="#documentSendResult"?status:sms},draft:null,selectedDocumentKind:"recycle",pdfShareKey:()=>"test",preparedPdfs:new Map([["test",{file:{},result:{version:2,shareToken:"signed-test-token"}}]])});
 const start=slip.indexOf("async function shareIssuedPdf(channel)"),end=slip.indexOf('K.$("#smsPdfShare").onclick',start);
 vm.runInContext(slip.slice(start,end),ctx);await ctx.shareIssuedPdf("sms");
 assert.match(ctx.location.href,/^sms:09000000000&body=/);
 const body=decodeURIComponent(ctx.location.href.split("&body=")[1]);
 assert.match(body,/リサイクル明細書（第2版）/);assert.match(body,/statement.html#document=signed-test-token/);assert.match(status.textContent,/まだ送信済みにはしていません/);
});
