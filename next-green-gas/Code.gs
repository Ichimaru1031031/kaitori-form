const CONFIG = Object.freeze({
  SPREADSHEET_ID: "1QbzjKm0jamTreE-WzI5JJnPU9nqNc44ysoGRRZLnXW4",
  PHOTO_FOLDER_ID: "1TbGZiErj5n50mGT3YcbfoAyOMeTk3867",
  SIGNATURE_FOLDER_ID: "12gjaJIQfpaA8O5Hx48fti81-6Sv4Q_JS",
  PDF_FOLDER_ID: "1yX4yIKWfvfIgPGEaFRRGb1K83zMpRnYN"
});

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || "ping");
  if (action === "ping") return json_({ok:true, service:"kaitori-rescue-next-green", time:new Date().toISOString()});
  return json_({ok:true, action:action, readOnly:false});
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const key = String(body.idempotencyKey || "");
    const operation = String(body.operation || "");
    const entityId = String(body.entityId || "");
    const payload = body.payload || {};
    if (!key || !operation) return json_({ok:false,error:"INVALID_REQUEST"});
    const previous = idempotencyResult_(key);
    if (previous) return json_({ok:true,idempotent:true,result:previous});
    const result = dispatch_(operation, entityId, payload, key);
    writeIdempotency_(key, operation, entityId, result);
    return json_({ok:true,idempotent:false,result:result});
  } catch (err) {
    return json_({ok:false,error:String(err && err.message || err),stack:String(err && err.stack || "")});
  } finally {
    lock.releaseLock();
  }
}

function dispatch_(op, entityId, p, key) {
  switch (op) {
    case "ping": return {pong:true,time:new Date().toISOString()};
    case "inventory-process-update": return opInventoryProcess_(entityId,p,key);
    case "inventory-test-add": return opInventoryTest_(entityId,p,key);
    case "inventory-photo-add": return opInventoryPhoto_(entityId,p,key);
    case "call-log": return opCallLog_(entityId,p,key);
    case "visit-start": return opVisitStart_(entityId,p,key);
    case "finalize-slip": return opFinalizeSlip_(entityId,p,key);
    default: throw new Error("UNSUPPORTED_OPERATION:"+op);
  }
}

function ss_(){ return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID); }
function sh_(name){ const s=ss_().getSheetByName(name); if(!s) throw new Error("SHEET_NOT_FOUND:"+name); return s; }
function headers_(sheet){ const last=Math.max(1,sheet.getLastColumn()); return sheet.getRange(1,1,1,last).getValues()[0].map(String); }
function rowObject_(sheet,row){ const h=headers_(sheet),v=sheet.getRange(row,1,1,h.length).getValues()[0]; const o={}; h.forEach((k,i)=>o[k]=v[i]); return o; }
function appendObject_(name,obj){
  const s=sh_(name),h=headers_(s);
  s.appendRow(h.map(k=>cellValue_(obj[k])));
  return s.getLastRow();
}
function cellValue_(v){
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}
function findRow_(name,key,value){
  const s=sh_(name),h=headers_(s),ci=h.indexOf(key);
  if(ci<0) throw new Error("COLUMN_NOT_FOUND:"+name+"."+key);
  const lr=s.getLastRow(); if(lr<2) return 0;
  const vals=s.getRange(2,ci+1,lr-1,1).getValues();
  for(let i=0;i<vals.length;i++) if(String(vals[i][0])===String(value)) return i+2;
  return 0;
}
function updateRow_(name,row,obj){
  if(!row) return false;
  const s=sh_(name),h=headers_(s),range=s.getRange(row,1,1,h.length),v=range.getValues()[0];
  h.forEach((k,i)=>{ if(Object.prototype.hasOwnProperty.call(obj,k)) v[i]=cellValue_(obj[k]); });
  range.setValues([v]);
  return true;
}
function audit_(entityType,entityId,action,afterObj,source){
  appendObject_("AUDIT_LOG",{
    logId:"AUD-"+Utilities.getUuid(),
    entityType:entityType,
    entityId:entityId,
    action:action,
    beforeJson:"",
    afterJson:afterObj,
    actor:"NEXT",
    createdAt:new Date().toISOString(),
    source:source||"GREEN_API"
  });
}
function idempotencyResult_(key){
  const row=findRow_("IDEMPOTENCY","key",key);
  if(!row) return null;
  const obj=rowObject_(sh_("IDEMPOTENCY"),row);
  try{return JSON.parse(String(obj.resultJson||"{}"));}catch(_e){return {raw:String(obj.resultJson||"")};}
}
function writeIdempotency_(key,op,entityId,result){
  appendObject_("IDEMPOTENCY",{
    key:key, operation:op, entityId:entityId,
    resultJson:result, createdAt:new Date().toISOString(), expiresAt:""
  });
}

function opInventoryProcess_(entityId,p,key){
  const completedAt=String(p.completedAt||new Date().toISOString());
  appendObject_("INVENTORY_PROCESS_LOG",{
    logId:p.logId||p.id||("PROC-"+Utilities.getUuid()),
    inventoryId:entityId,
    inventoryNo:p.inventoryNo||"",
    stage:p.stage||"",
    stageLabel:p.stageLabel||p.stage||"",
    employeeId:p.employeeId||"",
    employeeName:p.employeeName||"",
    completedAt:completedAt,
    source:p.source||"NEXT",
    idempotencyKey:key,
    note:p.note||""
  });
  const row=findRow_("INVENTORY","inventoryId",entityId);
  if(row) updateRow_("INVENTORY",row,{
    stage:p.stage||"",
    nextAction:p.nextAction||"",
    assignedEmployeeId:p.employeeName||p.employeeId||"",
    updatedAt:completedAt
  });
  audit_("inventory",entityId,"process-update",p,"NEXT");
  return {inventoryId:entityId,stage:p.stage||"",employeeName:p.employeeName||"",updatedAt:completedAt};
}

function opInventoryTest_(entityId,p,key){
  const testedAt=String(p.testedAt||new Date().toISOString());
  appendObject_("INVENTORY_TEST_LOG",{
    testId:p.testId||p.id||("TEST-"+Utilities.getUuid()),
    inventoryId:entityId,
    inventoryNo:p.inventoryNo||"",
    result:p.result||"",
    employeeId:p.employeeId||"",
    employeeName:p.employeeName||"",
    testedAt:testedAt,
    note:p.note||"",
    source:p.source||"NEXT",
    idempotencyKey:key
  });
  audit_("inventory",entityId,"test-add",p,"NEXT");
  return {inventoryId:entityId,result:p.result||"",testedAt:testedAt};
}

function opInventoryPhoto_(entityId,p,key){
  const capturedAt=String(p.capturedAt||new Date().toISOString());
  let fileId="",fileUrl="";
  if(p.dataUrl){
    const m=String(p.dataUrl).match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
    if(!m) throw new Error("INVALID_IMAGE_DATA");
    const mime=m[1],bytes=Utilities.base64Decode(m[2]);
    const ext=mime.indexOf("png")>=0?".png":".jpg";
    const safe=(p.inventoryNo||entityId||"inventory").replace(/[^0-9A-Za-z_-]/g,"_");
    const name=safe+"_"+Utilities.formatDate(new Date(),"Asia/Tokyo","yyyyMMdd-HHmmss")+ext;
    const blob=Utilities.newBlob(bytes,mime,name);
    const file=DriveApp.getFolderById(CONFIG.PHOTO_FOLDER_ID).createFile(blob);
    fileId=file.getId(); fileUrl=file.getUrl();
  }
  appendObject_("INVENTORY_PHOTO_LOG",{
    photoId:p.photoId||p.id||("PHOTO-"+Utilities.getUuid()),
    inventoryId:entityId,
    inventoryNo:p.inventoryNo||"",
    kind:p.kind||"work",
    employeeId:p.employeeId||"",
    employeeName:p.employeeName||"",
    capturedAt:capturedAt,
    fileName:p.fileName||"",
    source:p.source||"NEXT",
    idempotencyKey:key,
    remoteRef:fileUrl||fileId
  });
  audit_("inventory",entityId,"photo-add",{photoId:p.photoId||p.id,fileId:fileId,capturedAt:capturedAt},"NEXT");
  return {inventoryId:entityId,fileId:fileId,fileUrl:fileUrl,capturedAt:capturedAt};
}

function opCallLog_(entityId,p,key){
  const at=String(p.calledAt||new Date().toISOString());
  const row=findRow_("APPOINTMENTS","appointmentId",entityId);
  if(row) updateRow_("APPOINTMENTS",row,{callStatus:"called",callAt:at,updatedAt:at});
  audit_("appointment",entityId,"call-log",p,"NEXT");
  return {appointmentId:entityId,callAt:at};
}

function opVisitStart_(entityId,p,key){
  const at=String(p.startedAt||new Date().toISOString());
  const row=findRow_("APPOINTMENTS","appointmentId",entityId);
  if(row) updateRow_("APPOINTMENTS",row,{status:"visiting",updatedAt:at});
  audit_("appointment",entityId,"visit-start",p,"NEXT");
  return {appointmentId:entityId,status:"visiting",startedAt:at};
}

function opFinalizeSlip_(entityId,p,key){
  const confirmedAt=String(p.confirmedAt||new Date().toISOString());
  const version=Number(p.version||1);
  let signatureFileId="",signatureFileUrl="";
  if(p.signatureDataUrl){
    const m=String(p.signatureDataUrl).match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
    if(m){
      const blob=Utilities.newBlob(Utilities.base64Decode(m[2]),m[1],"signature_"+entityId+"_v"+version+".png");
      const file=DriveApp.getFolderById(CONFIG.SIGNATURE_FOLDER_ID).createFile(blob);
      signatureFileId=file.getId(); signatureFileUrl=file.getUrl();
    }
  }
  const pdf=createCustomerPdf_(p,signatureFileUrl);
  appendObject_("NEXT_FINALIZED_SLIPS",{
    snapshotId:p.id||entityId,
    draftId:p.draftId||"",
    caseId:p.caseId||"",
    sourceServiceOrderId:p.sourceServiceOrderId||"",
    version:version,
    confirmedAt:confirmedAt,
    total:Number(p.total||0),
    payloadJson:p.payload||{},
    signatureFileId:signatureFileId,
    signatureFileUrl:signatureFileUrl,
    pdfFileId:pdf.fileId,
    pdfFileUrl:pdf.fileUrl,
    hash:p.hash||"",
    status:"issued",
    createdAt:new Date().toISOString()
  });
  appendObject_("DOCUMENTS",{
    documentId:"NEXTDOC-"+Utilities.getUuid(),
    caseId:p.caseId||"",
    serviceOrderId:p.sourceServiceOrderId||"",
    type:"customer-copy",
    version:version,
    fileId:pdf.fileId,
    fileUrl:pdf.fileUrl,
    fileName:pdf.fileName,
    issuedAt:confirmedAt,
    issuedBy:"NEXT",
    sentAt:"",
    sentMethod:"",
    status:"issued",
    snapshotHash:p.hash||""
  });
  if(p.sourceServiceOrderId){
    const row=findRow_("SERVICE_ORDERS","serviceOrderId",p.sourceServiceOrderId);
    if(row) updateRow_("SERVICE_ORDERS",row,{customerConfirmed:true,confirmedAt:confirmedAt,signatureFileId:signatureFileId,latestPdfId:pdf.fileId,updatedAt:confirmedAt});
  }
  audit_("service-order",p.sourceServiceOrderId||entityId,"finalize-slip",{snapshotId:p.id,version:version,pdfFileId:pdf.fileId},"NEXT");
  return {snapshotId:p.id||entityId,version:version,pdfFileId:pdf.fileId,pdfFileUrl:pdf.fileUrl,signatureFileId:signatureFileId};
}

function createCustomerPdf_(snap,signatureUrl){
  const d=snap.payload||{},customer=d.customer||{},selected=d.selected||[],items=d.items||{};
  const labels={purchase:"買取",work:"工事",delivery:"配送",recycle:"リサイクル",estimate:"見積",sale:"販売"};
  let sections="";
  selected.forEach(function(k){
    const rows=items[k]||[]; if(!rows.length) return;
    let tr=rows.map(function(x){
      return "<tr><td>"+html_( [x.category,x.maker,x.model,x.year,x.spec].filter(Boolean).join(" / ") )+"</td><td>"+html_(x.quantity||1)+"</td><td class='num'>"+yen_(x.amount||0)+"</td></tr>";
    }).join("");
    sections+="<h2>"+html_(labels[k]||k)+"</h2><table><thead><tr><th>内容</th><th>数量</th><th>金額</th></tr></thead><tbody>"+tr+"</tbody></table>";
  });
  const sign=signatureUrl?"<h2>お客様サイン</h2><img class='sign' src='"+html_(signatureUrl)+"'>":"";
  const html="<!doctype html><html><head><meta charset='utf-8'><style>body{font-family:Arial,'Noto Sans JP',sans-serif;color:#222;font-size:11px;padding:18px}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px}.meta{color:#666;margin-bottom:12px}.customer{border:1px solid #ddd;border-radius:8px;padding:10px;line-height:1.7}table{width:100%;border-collapse:collapse;margin-bottom:8px}th,td{border-bottom:1px solid #e5e5e5;padding:6px;text-align:left}th{background:#f5f5f5}.num{text-align:right}.total{font-size:16px;font-weight:bold;text-align:right;margin-top:14px}.sign{max-width:280px;max-height:100px;border:1px solid #ddd}.foot{margin-top:20px;color:#777;font-size:9px}</style></head><body><h1>買取レスキュー お客様控え</h1><div class='meta'>案件 "+html_(snap.caseId||"")+" / 第"+versionText_(snap.version)+"版 / "+html_(snap.confirmedAt||"")+"</div><div class='customer'><b>"+html_(customer.name||"")+" 様</b><br>"+html_(customer.address||"")+"<br>"+html_(customer.phone||"")+" "+html_(customer.email||"")+"</div>"+sections+"<div class='total'>差引合計 "+yen_(snap.total||0)+"</div>"+sign+"<div class='foot'>このPDFは確認・署名時点のスナップショットです。再発行時も過去版は上書きしません。</div></body></html>";
  const blob=HtmlService.createHtmlOutput(html).getBlob().getAs(MimeType.PDF);
  const base=(snap.caseId||snap.draftId||"NEXT").replace(/[^0-9A-Za-z_-]/g,"_");
  const fileName=base+"_v"+Number(snap.version||1)+"_"+Utilities.formatDate(new Date(),"Asia/Tokyo","yyyyMMdd-HHmmss")+".pdf";
  blob.setName(fileName);
  const file=DriveApp.getFolderById(CONFIG.PDF_FOLDER_ID).createFile(blob);
  return {fileId:file.getId(),fileUrl:file.getUrl(),fileName:fileName};
}
function versionText_(v){return String(Number(v||1));}
function yen_(n){return "¥"+Number(n||0).toLocaleString("ja-JP");}
function html_(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
