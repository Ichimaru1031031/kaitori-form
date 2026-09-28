const CONFIG = Object.freeze({
  SPREADSHEET_ID: "1QbzjKm0jamTreE-WzI5JJnPU9nqNc44ysoGRRZLnXW4",
  PHOTO_FOLDER_ID: "1TbGZiErj5n50mGT3YcbfoAyOMeTk3867",
  SIGNATURE_FOLDER_ID: "12gjaJIQfpaA8O5Hx48fti81-6Sv4Q_JS",
  PDF_FOLDER_ID: "1yX4yIKWfvfIgPGEaFRRGb1K83zMpRnYN"
});

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || "ping");
  if (action === "bridge") {
    return HtmlService.createHtmlOutput(bridgeHtml_())
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  if (action === "snapshot") return json_(buildSnapshot_());
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


function greenBridgeRequest(request, payload) {
  request = String(request || "");
  payload = payload || {};
  if (request === "ping") return {ok:true,pong:true,time:new Date().toISOString()};
  if (request === "snapshot") return buildSnapshot_();
  if (request === "write") {
    const body = payload.job || payload;
    const key = String(body.idempotencyKey || body.id || "");
    const operation = String(body.operation || "");
    const entityId = String(body.entityId || "");
    const p = body.payload || {};
    if (!key || !operation) throw new Error("INVALID_REQUEST");
    const previous = idempotencyResult_(key);
    if (previous) return {ok:true,idempotent:true,result:previous};
    const result = dispatch_(operation, entityId, p, key);
    writeIdempotency_(key, operation, entityId, result);
    return {ok:true,idempotent:false,result:result};
  }
  throw new Error("UNSUPPORTED_BRIDGE_REQUEST:"+request);
}

function buildSnapshot_() {
  const specs = {
    customers:"CUSTOMERS",
    cases:"CASES",
    appointments:"APPOINTMENTS",
    inventory:"INVENTORY",
    employees:"EMPLOYEES",
    serviceOrders:"SERVICE_ORDERS",
    lineItems:"LINE_ITEMS",
    documents:"DOCUMENTS",
    modelMaster:"MODEL_MASTER",
    processMaster:"INVENTORY_PROCESS_MASTER",
    processLogs:"INVENTORY_PROCESS_LOG"
  };
  const out = {
    schemaVersion:3,
    generatedAt:new Date().toISOString(),
    source:"Kaitori Rescue NEXT Green API",
    writeAuthority:"GREEN"
  };
  Object.keys(specs).forEach(function(k){ out[k]=sheetObjects_(specs[k]); });
  return out;
}

function sheetObjects_(name) {
  const s = sh_(name), lr=s.getLastRow(), lc=s.getLastColumn();
  if (lr < 2 || lc < 1) return [];
  const values=s.getRange(1,1,lr,lc).getDisplayValues();
  const h=values[0].map(String), rows=[];
  for(let r=1;r<values.length;r++){
    if(!values[r].some(function(v){return String(v).trim()!=="";})) continue;
    const o={};
    h.forEach(function(k,i){o[k]=values[r][i] == null ? "" : values[r][i];});
    rows.push(o);
  }
  return rows;
}

function bridgeHtml_() {
  return '<!doctype html><html><head><meta charset="utf-8"></head><body><script>'+
    '(function(){'+
    'function send(m){try{parent.postMessage(m,"*")}catch(e){}}'+
    'send({type:"kr-next-green-bridge-ready"});'+
    'addEventListener("message",function(e){var d=e.data||{};if(d.type!=="kr-next-green-request"||!d.requestId)return;'+
    'google.script.run.withSuccessHandler(function(result){send({type:"kr-next-green-response",requestId:d.requestId,result:result})})'+
    '.withFailureHandler(function(err){send({type:"kr-next-green-response",requestId:d.requestId,error:String(err&&err.message||err)})})'+
    '.greenBridgeRequest(d.request,d.payload||{});'+
    '});'+
    '})();'+
    '<\/script></body></html>';
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
    case "appointment-upsert": return opAppointmentUpsert_(entityId,p,key);
    case "case-upsert": return opCaseUpsert_(entityId,p,key);
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

function opCaseUpsert_(entityId,p,key){
  const now=new Date().toISOString(),customer=p.customer||{},caze=p.case||{},caseId=String(entityId||caze.caseId||"").trim();
  if(!caseId) throw new Error("CASE_ID_REQUIRED");
  let customerId=String(customer.customerId||caze.customerId||"").trim();
  if(!customerId) customerId=nextId_("NEXT-CUST");
  const customerObj={
    customerId:customerId,name:customer.name||caze.name||"",phone:String(customer.phone||caze.phone||"").replace(/\D/g,""),
    email:customer.email||caze.email||"",postalCode:customer.postalCode||"",address:customer.address||caze.address||"",
    preferredContact:customer.preferredContact||"電話",lineUserId:customer.lineUserId||"",source:customer.source||caze.source||"phone-assessment",
    blueReceptionId:customer.blueReceptionId||"",createdAt:customer.createdAt||now,updatedAt:now
  };
  const cr=findRow_("CUSTOMERS","customerId",customerId);
  if(cr) updateRow_("CUSTOMERS",cr,customerObj); else appendObject_("CUSTOMERS",customerObj);
  const caseObj={
    caseId:caseId,customerId:customerId,status:caze.status||"🔴 新規",nextAction:caze.nextAction||"電話査定・訪問日程調整",
    source:caze.source||"phone-assessment",blueReceptionId:caze.blueReceptionId||"",title:caze.title||((customerObj.name||"")+"様"),
    summary:caze.summary||"",assignedEmployeeIds:caze.assignedEmployeeIds||"[]",requestedDatesJson:caze.requestedDatesJson||"[]",
    confirmedDate:caze.confirmedDate||"",confirmedStart:caze.confirmedStart||"",confirmedEnd:caze.confirmedEnd||"",
    notes:caze.notes||"",createdAt:caze.createdAt||now,updatedAt:now
  };
  const row=findRow_("CASES","caseId",caseId);
  if(row) updateRow_("CASES",row,caseObj); else appendObject_("CASES",caseObj);
  audit_("case",caseId,row?"update":"create",caseObj,"NEXT");
  return {caseId:caseId,customerId:customerId,saved:true,updatedAt:now};
}

function opAppointmentUpsert_(entityId,p,key){
  const now=String(p.updatedAt||new Date().toISOString());
  const row=findRow_("APPOINTMENTS","appointmentId",entityId);
  const obj={
    appointmentId:entityId,
    caseId:p.caseId||"",
    date:p.date||"",
    startTime:p.startTime||"",
    endTime:p.endTime||"",
    category:p.category||"",
    title:p.title||"",
    customerName:p.customerName||"",
    phone:p.phone||"",
    address:p.address||"",
    assignedEmployeeIds:p.assignedEmployeeIds||"[]",
    status:p.status||"confirmed",
    callStatus:p.callStatus||"",
    callAt:p.callAt||"",
    blueScheduleId:p.blueScheduleId||"",
    serviceOrderId:p.serviceOrderId||"",
    notes:p.notes||"",
    createdAt:p.createdAt||now,
    updatedAt:now
  };
  if(row) updateRow_("APPOINTMENTS",row,obj); else appendObject_("APPOINTMENTS",obj);
  audit_("appointment",entityId,row?"update":"create",obj,"NEXT");
  return {appointmentId:entityId,saved:true,updatedAt:now};
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
  const links=ensureFinalizedEntities_(p,confirmedAt);
  const linked=Object.assign({},p,{caseId:links.caseId,sourceServiceOrderId:links.serviceOrderId});
  let signatureFileId="",signatureFileUrl="";
  if(p.signatureDataUrl){
    const m=String(p.signatureDataUrl).match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
    if(m){
      const blob=Utilities.newBlob(Utilities.base64Decode(m[2]),m[1],"signature_"+links.serviceOrderId+"_v"+version+".png");
      const file=DriveApp.getFolderById(CONFIG.SIGNATURE_FOLDER_ID).createFile(blob);
      signatureFileId=file.getId(); signatureFileUrl=file.getUrl();
    }
  }
  const inventoryLinks=ensureLineItemsAndInventory_(links.serviceOrderId,linked.payload||{},confirmedAt);
  const pdf=createCustomerPdf_(linked,signatureFileUrl);
  appendObject_("NEXT_FINALIZED_SLIPS",{
    snapshotId:p.id||entityId,
    draftId:p.draftId||"",
    caseId:links.caseId,
    sourceServiceOrderId:links.serviceOrderId,
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
    caseId:links.caseId,
    serviceOrderId:links.serviceOrderId,
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
  const soRow=findRow_("SERVICE_ORDERS","serviceOrderId",links.serviceOrderId);
  if(soRow) updateRow_("SERVICE_ORDERS",soRow,{
    customerConfirmed:true,
    confirmedAt:confirmedAt,
    signatureFileId:signatureFileId,
    latestPdfId:pdf.fileId,
    status:"お客様確認済み",
    updatedAt:confirmedAt
  });
  audit_("service-order",links.serviceOrderId,"finalize-slip",{snapshotId:p.id,version:version,pdfFileId:pdf.fileId,inventory:inventoryLinks},"NEXT");
  return {
    snapshotId:p.id||entityId,
    caseId:links.caseId,
    serviceOrderId:links.serviceOrderId,
    version:version,
    pdfFileId:pdf.fileId,
    pdfFileUrl:pdf.fileUrl,
    signatureFileId:signatureFileId,
    inventory:inventoryLinks
  };
}

function nextId_(prefix){
  return prefix+"-"+Utilities.getUuid().replace(/-/g,"").slice(0,8).toUpperCase();
}
function ensureFinalizedEntities_(p,confirmedAt){
  const payload=p.payload||{},customer=payload.customer||{},selected=payload.selected||[];
  let caseId=String(p.caseId||"").trim(),customerId="";
  if(caseId){
    const row=findRow_("CASES","caseId",caseId);
    if(row) customerId=String(rowObject_(sh_("CASES"),row).customerId||"");
  }
  if(!customerId && customer.phone){
    const row=findRow_("CUSTOMERS","phone",String(customer.phone).replace(/\D/g,""));
    if(row) customerId=String(rowObject_(sh_("CUSTOMERS"),row).customerId||"");
  }
  if(!customerId){
    customerId=nextId_("NEXT-CUST");
    appendObject_("CUSTOMERS",{
      customerId:customerId,name:customer.name||"",phone:String(customer.phone||"").replace(/\D/g,""),email:customer.email||"",
      postalCode:"",address:customer.address||"",preferredContact:"",lineUserId:"",source:"next",
      blueReceptionId:"",createdAt:confirmedAt,updatedAt:confirmedAt
    });
  }
  const hasPurchase=selected.indexOf("purchase")!==-1;
  if(!caseId){
    caseId=nextId_("NEXT-CASE");
    appendObject_("CASES",{
      caseId:caseId,customerId:customerId,status:hasPurchase?"買取確定":"伝票確定",
      nextAction:hasPurchase?"在庫工程へ":"完了確認",source:"next",blueReceptionId:"",
      title:(customer.name||"")+"様",summary:summaryFromPayload_(payload),assignedEmployeeIds:"[]",
      requestedDatesJson:"[]",confirmedDate:"",confirmedStart:"",confirmedEnd:"",notes:"",
      createdAt:confirmedAt,updatedAt:confirmedAt
    });
  }else{
    const row=findRow_("CASES","caseId",caseId);
    if(row) updateRow_("CASES",row,{
      customerId:customerId,
      status:hasPurchase?"買取確定":"伝票確定",
      nextAction:hasPurchase?"在庫工程へ":"完了確認",
      summary:summaryFromPayload_(payload),
      updatedAt:confirmedAt
    });
  }
  let serviceOrderId=String(p.sourceServiceOrderId||"").trim();
  if(!serviceOrderId) serviceOrderId=newServiceOrderId_();
  const totals=totalsFromPayload_(payload);
  const soRow=findRow_("SERVICE_ORDERS","serviceOrderId",serviceOrderId);
  const so={
    serviceOrderId:serviceOrderId,caseId:caseId,appointmentId:"",customerId:customerId,
    status:"お客様確認済み",selectedServicesJson:JSON.stringify(selected),paymentMethod:payload.paymentMethod||"",
    salesWorkTotal:totals.salesWorkTotal,purchaseTotal:totals.purchaseTotal,recycleTotal:totals.recycleTotal,
    deliveryTotal:totals.deliveryTotal,netTotal:Number(p.total||totals.netTotal),customerConfirmed:true,
    confirmedAt:confirmedAt,signatureFileId:"",latestPdfId:"",
    createdAt:soRow?rowObject_(sh_("SERVICE_ORDERS"),soRow).createdAt||confirmedAt:confirmedAt,updatedAt:confirmedAt
  };
  if(soRow) updateRow_("SERVICE_ORDERS",soRow,so); else appendObject_("SERVICE_ORDERS",so);
  return {caseId:caseId,customerId:customerId,serviceOrderId:serviceOrderId};
}
function newServiceOrderId_(){
  for(let i=0;i<30;i++){
    const id="UT-N"+Utilities.getUuid().replace(/-/g,"").slice(0,6).toUpperCase();
    if(!findRow_("SERVICE_ORDERS","serviceOrderId",id)) return id;
  }
  throw new Error("SERVICE_ORDER_ID_EXHAUSTED");
}
function summaryFromPayload_(payload){
  const out=[];
  const labels={purchase:"買取",work:"工事",delivery:"配送",recycle:"リサイクル",estimate:"見積",sale:"販売"};
  (payload.selected||[]).forEach(function(k){
    const rows=(payload.items&&payload.items[k])||[];
    if(rows.length) out.push((labels[k]||k)+" "+rows.length+"件");
  });
  return out.join(" / ");
}
function totalsFromPayload_(payload){
  const items=payload.items||{};
  function sum(k){return (items[k]||[]).reduce(function(a,x){return a+Number(x.amount||0);},0);}
  const purchase=sum("purchase"),recycle=sum("recycle"),delivery=sum("delivery");
  const salesWork=sum("work")+sum("sale")+sum("estimate");
  return {purchaseTotal:purchase,recycleTotal:recycle,deliveryTotal:delivery,salesWorkTotal:salesWork,netTotal:salesWork+recycle+delivery-purchase};
}
function rowsBy_(name,key,value){
  const s=sh_(name),h=headers_(s),ci=h.indexOf(key),out=[];
  if(ci<0) return out;
  const lr=s.getLastRow(); if(lr<2) return out;
  const vals=s.getRange(2,1,lr-1,h.length).getValues();
  vals.forEach(function(v,i){
    if(String(v[ci])===String(value)){
      const o={};h.forEach(function(k,j){o[k]=v[j];});
      out.push({row:i+2,obj:o});
    }
  });
  return out;
}
function ensureLineItemsAndInventory_(serviceOrderId,payload,confirmedAt){
  const existing=rowsBy_("LINE_ITEMS","serviceOrderId",serviceOrderId);
  const selected=payload.selected||[],items=payload.items||{},created=[],all=[];
  let seq=0;
  selected.forEach(function(serviceType){
    (items[serviceType]||[]).forEach(function(x){
      seq++;
      const itemNo=String(seq);
      let match=existing.find(function(r){return String(r.obj.serviceType)===String(serviceType)&&String(r.obj.itemNo)===itemNo;});
      let lineItemId=match?String(match.obj.lineItemId||""):nextId_("NEXT-LINE");
      let inventoryId=match?String(match.obj.inventoryId||""):"";
      if(!match){
        appendObject_("LINE_ITEMS",{
          lineItemId:lineItemId,serviceOrderId:serviceOrderId,serviceType:serviceType,itemNo:itemNo,
          category:x.category||"",maker:x.maker||"",model:x.model||"",year:x.year||"",spec:x.spec||"",
          quantity:Number(x.quantity||1),unitAmount:Number(x.amount||0),amount:Number(x.amount||0),
          purchaseResult:serviceType==="purchase"?"買取した":"",workCode:x.workCode||"",
          recycleMakerCode:x.recycleMakerCode||"",recycleItemCode:x.recycleItemCode||"",
          inventoryId:"",photoIdsJson:"[]",notes:x.note||"",createdAt:confirmedAt,updatedAt:confirmedAt
        });
        match={row:findRow_("LINE_ITEMS","lineItemId",lineItemId),obj:{inventoryId:""}};
      }
      if(serviceType==="purchase"){
        if(!inventoryId){
          const inv=createInventoryFromItem_(serviceOrderId,lineItemId,x,confirmedAt);
          inventoryId=inv.inventoryId;
          if(match.row) updateRow_("LINE_ITEMS",match.row,{inventoryId:inventoryId,updatedAt:confirmedAt});
          created.push(inv);
        }
        const invRow=findRow_("INVENTORY","inventoryId",inventoryId);
        const invObj=invRow?rowObject_(sh_("INVENTORY"),invRow):{};
        all.push({inventoryId:inventoryId,inventoryNo:invObj.inventoryNo||""});
      }
    });
  });
  return all.length?all:created;
}
function createInventoryFromItem_(serviceOrderId,lineItemId,x,confirmedAt){
  const inventoryId=nextId_("NEXT-INV"),inventoryNo=newInventoryNo_(x.category||"");
  appendObject_("INVENTORY",{
    inventoryId:inventoryId,inventoryNo:inventoryNo,sourceServiceOrderId:serviceOrderId,sourceLineItemId:lineItemId,
    category:x.category||"",maker:x.maker||"",model:x.model||"",year:x.year||"",spec:x.spec||"",
    purchasePrice:Number(x.amount||0),salePrice:0,stage:"買取済み",nextAction:"分解清掃を行う",
    storageLocation:"",assignedEmployeeId:"",photoIdsJson:"[]",qrToken:Utilities.getUuid(),
    updatedAt:confirmedAt,archivedAt:""
  });
  appendObject_("INVENTORY_PROCESS_LOG",{
    logId:nextId_("PROC"),inventoryId:inventoryId,inventoryNo:inventoryNo,stage:"買取済み",stageLabel:"買取済み",
    employeeId:"",employeeName:"",completedAt:confirmedAt,source:"NEXT",idempotencyKey:"",note:"NEXT伝票確定で在庫自動生成"
  });
  return {inventoryId:inventoryId,inventoryNo:inventoryNo};
}
function newInventoryNo_(category){
  const s=String(category||"").toUpperCase();
  let prefix="OT";
  if(/エアコン|AIR/.test(s)) prefix="AC";
  else if(/冷蔵|FRIDGE/.test(s)) prefix="RF";
  else if(/洗濯|WASH/.test(s)) prefix="WM";
  else if(/TV|テレビ/.test(s)) prefix="TV";
  else if(/電子レンジ|MICRO/.test(s)) prefix="MW";
  for(let i=0;i<50;i++){
    const no=prefix+"-"+String(Math.floor(1000+Math.random()*9000));
    if(!findRow_("INVENTORY","inventoryNo",no)) return no;
  }
  return prefix+"-"+Utilities.getUuid().replace(/-/g,"").slice(0,6).toUpperCase();
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
