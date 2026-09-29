const CONFIG = Object.freeze({
  SPREADSHEET_ID: "1QbzjKm0jamTreE-WzI5JJnPU9nqNc44ysoGRRZLnXW4",
  PHOTO_FOLDER_ID: "1TbGZiErj5n50mGT3YcbfoAyOMeTk3867",
  SIGNATURE_FOLDER_ID: "12gjaJIQfpaA8O5Hx48fti81-6Sv4Q_JS",
  PDF_FOLDER_ID: "1yX4yIKWfvfIgPGEaFRRGb1K83zMpRnYN",
  EC_PUBLIC_PHOTO_FOLDER_ID: "1Z0G83AZE_qHCjwT1MLRPYazjK4nVGb0J"
});

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || "ping");
  if (action === "bridge") {
    return HtmlService.createHtmlOutput(bridgeHtml_())
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  if (action === "snapshot") return json_(buildSnapshot_());
  if (action === "catalog") return json_(buildPublicCatalog_());
  if (action === "checkout-confirm") return json_(confirmStripeCheckout_(String((e && e.parameter && e.parameter.session_id) || "")));
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
    const cacheable = operation !== "get-slip-pdf-share";
    const previous = cacheable ? idempotencyResult_(key) : null;
    if (previous) return {ok:true,idempotent:true,result:previous};
    const result = dispatch_(operation, entityId, p, key);
    if (cacheable) writeIdempotency_(key, operation, entityId, result);
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
    notifications:"NOTIFICATIONS",
    sales:"SALES",
    modelMaster:"MODEL_MASTER",
    processMaster:"INVENTORY_PROCESS_MASTER",
    processLogs:"INVENTORY_PROCESS_LOG",
    inventoryTests:"INVENTORY_TEST_LOG",
    inventoryPhotos:"INVENTORY_PHOTO_LOG",
    finalizedSlips:"NEXT_FINALIZED_SLIPS",
    inventoryArchive:"INVENTORY_ARCHIVE",
    salesArchive:"SALES_ARCHIVE",
    ecListings:"EC_LISTINGS",
    checkouts:"CHECKOUTS"
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
    case "send-slip-pdf-email": return opSendSlipPdfEmail_(entityId,p,key);
    case "get-slip-pdf-share": return opGetSlipPdfShare_(entityId,p,key);
    case "appointment-upsert": return opAppointmentUpsert_(entityId,p,key);
    case "appointment-note-update": return opAppointmentNoteUpdate_(entityId,p,key);
    case "inventory-sale-update": return opInventorySaleUpdate_(entityId,p,key);
    case "inventory-archive": return opInventoryArchive_(entityId,p,key);
    case "ec-listing-upsert": return opEcListingUpsert_(entityId,p,key);
    case "checkout-create": return opCheckoutCreate_(entityId,p,key);
    case "checkout-confirm": return confirmStripeCheckout_(String(p.sessionId||entityId||""));
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

function syncEcForSale_(entityId,inv,saleObj,p,now){
  const row=findRow_("EC_LISTINGS","inventoryId",entityId);
  const prev=row?rowObject_(sh_("EC_LISTINGS"),row):{};
  const saleRow=findRow_("SALES","inventoryId",entityId);
  let status="非公開";
  if(String(saleObj.status)==="販売中"){
    if(String(prev.status)==="公開") status="公開";
    else {
      const requested=String(p.ecStatus||saleObj.ecStatus||prev.status||"下書き");
      status=requested==="公開"?"公開":"下書き";
    }
  }
  const title=String(p.ecTitle||saleObj.ecTitle||prev.title||[inv.maker,inv.model].filter(Boolean).join(" / ")||inv.category||"");
  const description=String(p.ecDescription||saleObj.ecDescription||prev.description||"");
  const obj={
    listingId:prev.listingId||("LIST-"+entityId),
    inventoryId:entityId,
    inventoryNo:inv.inventoryNo||"",
    status:status,
    title:title,
    description:description,
    salePrice:Number(saleObj.salePrice||inv.salePrice||0),
    publishedAt:status==="公開"?(prev.publishedAt||now):"",
    updatedAt:now,
    displayOrder:Number(prev.displayOrder||0),
    employeeId:p.employeeId||saleObj.employeeId||"",
    employeeName:p.employeeName||saleObj.employeeName||"",
    photoIdsJson:prev.photoIdsJson||"[]",
    source:prev.source||"NEXT"
  };
  if(row) updateRow_("EC_LISTINGS",row,obj); else appendObject_("EC_LISTINGS",obj);
  if(saleRow) updateRow_("SALES",saleRow,{
    ecTitle:title,ecDescription:description,ecStatus:status,
    storageLocation:p.storageLocation||saleObj.storageLocation||inv.storageLocation||"",
    updatedAt:now
  });
  return {listingId:obj.listingId,status:status,title:title,salePrice:obj.salePrice};
}

function opEcListingUpsert_(entityId,p,key){
  const now=String(p.updatedAt||new Date().toISOString());
  const invRow=findRow_("INVENTORY","inventoryId",entityId);
  if(!invRow) throw new Error("INVENTORY_NOT_FOUND:"+entityId);
  const inv=rowObject_(sh_("INVENTORY"),invRow);
  const saleRow=findRow_("SALES","inventoryId",entityId);
  const sale=saleRow?rowObject_(sh_("SALES"),saleRow):{};
  const status=String(p.status||"下書き");
  const row=findRow_("EC_LISTINGS","inventoryId",entityId);
  const prev=row?rowObject_(sh_("EC_LISTINGS"),row):{};
  const publicPhotos=status==="公開"?ensurePublicEcPhotos_(entityId,prev.photoIdsJson):parseJsonArray_(prev.photoIdsJson);
  const obj={
    listingId:p.listingId||prev.listingId||("LIST-"+entityId),
    inventoryId:entityId,
    inventoryNo:inv.inventoryNo||"",
    status:status,
    title:p.title||prev.title||[inv.maker,inv.model].filter(Boolean).join(" / ")||inv.category||"",
    description:p.description||prev.description||"",
    salePrice:Number(p.salePrice||sale.salePrice||inv.salePrice||0),
    publishedAt:status==="公開"?(prev.publishedAt||now):"",
    updatedAt:now,
    displayOrder:Number(p.displayOrder||prev.displayOrder||0),
    employeeId:p.employeeId||"",
    employeeName:p.employeeName||"",
    photoIdsJson:JSON.stringify(publicPhotos),
    source:"NEXT"
  };
  if(row) updateRow_("EC_LISTINGS",row,obj); else appendObject_("EC_LISTINGS",obj);
  if(saleRow) updateRow_("SALES",saleRow,{ecTitle:obj.title,ecDescription:obj.description,ecStatus:status,updatedAt:now});
  audit_("ec-listing",entityId,"upsert",obj,"NEXT");
  return {inventoryId:entityId,listingId:obj.listingId,status:status,title:obj.title,salePrice:obj.salePrice,photos:publicPhotos,updatedAt:now};
}
function buildPublicCatalog_(){
  releaseExpiredCheckouts_();
  const listings=sheetObjects_("EC_LISTINGS").filter(function(x){return String(x.status)==="公開";});
  const inventory=sheetObjects_("INVENTORY"),sales=sheetObjects_("SALES");
  const invMap={};inventory.forEach(function(x){invMap[x.inventoryId]=x;});
  const saleMap={};sales.forEach(function(x){saleMap[x.inventoryId]=x;});
  return {
    ok:true,
    generatedAt:new Date().toISOString(),
    items:listings.map(function(x){
      const inv=invMap[x.inventoryId]||{},sale=saleMap[x.inventoryId]||{};
      const publicPhotos=parseJsonArray_(x.photoIdsJson);
      return {
        listingId:x.listingId||"",
        inventoryId:x.inventoryId||"",
        inventoryNo:x.inventoryNo||inv.inventoryNo||"",
        title:x.title||[inv.maker,inv.model].filter(Boolean).join(" / ")||inv.category||"",
        description:x.description||"",
        salePrice:Number(x.salePrice||sale.salePrice||inv.salePrice||0),
        category:inv.category||"",
        maker:inv.maker||"",
        model:inv.model||"",
        year:inv.year||"",
        spec:inv.spec||"",
        photos:publicPhotos.map(function(p){return p.url||p;}).filter(Boolean),
        publishedAt:x.publishedAt||"",
        updatedAt:x.updatedAt||""
      };
    }).sort(function(a,b){return String(b.updatedAt).localeCompare(String(a.updatedAt));})
  };
}

function driveFileIdFromUrl_(v){
  const s=String(v||"");
  let m=s.match(/\/d\/([A-Za-z0-9_-]{20,})/); if(m) return m[1];
  m=s.match(/[?&]id=([A-Za-z0-9_-]{20,})/); if(m) return m[1];
  if(/^[A-Za-z0-9_-]{20,}$/.test(s)) return s;
  return "";
}
function parseJsonArray_(v){
  try{const x=JSON.parse(String(v||"[]"));return Array.isArray(x)?x:[];}catch(_e){return [];}
}
function ensurePublicEcPhotos_(inventoryId,previousJson){
  const prev=parseJsonArray_(previousJson),bySource={};
  prev.forEach(function(x){if(x&&x.sourceId)bySource[x.sourceId]=x;});
  const photos=sheetObjects_("INVENTORY_PHOTO_LOG").filter(function(p){return p.inventoryId===inventoryId && p.remoteRef;});
  const folder=DriveApp.getFolderById(CONFIG.EC_PUBLIC_PHOTO_FOLDER_ID),out=[];
  photos.forEach(function(p){
    const sourceId=driveFileIdFromUrl_(p.remoteRef);
    if(!sourceId)return;
    if(bySource[sourceId]){out.push(bySource[sourceId]);return;}
    try{
      const src=DriveApp.getFileById(sourceId);
      const copy=src.makeCopy("EC_"+inventoryId+"_"+src.getName(),folder);
      copy.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
      out.push({
        sourceId:sourceId,
        publicId:copy.getId(),
        url:"https://drive.google.com/uc?export=view&id="+copy.getId(),
        name:copy.getName()
      });
    }catch(err){}
  });
  return out;
}

function settingValue_(key,fallback){
  const row=findRow_("SETTINGS","key",key);
  if(!row)return fallback;
  const obj=rowObject_(sh_("SETTINGS"),row);
  return obj.value===undefined||obj.value===""?fallback:obj.value;
}
function settingNumber_(key,fallback){
  const n=Number(settingValue_(key,fallback));
  return Number.isFinite(n)?n:Number(fallback||0);
}
function stripeSecret_(){
  const v=PropertiesService.getScriptProperties().getProperty("STRIPE_SECRET_KEY");
  if(!v)throw new Error("STRIPE_NOT_CONFIGURED");
  return v;
}
function stripeFetch_(path,options){
  const opt=options||{};
  opt.muteHttpExceptions=true;
  opt.headers=Object.assign({},opt.headers||{},{"Authorization":"Bearer "+stripeSecret_()});
  const res=UrlFetchApp.fetch("https://api.stripe.com"+path,opt);
  const text=res.getContentText();
  let data={};try{data=JSON.parse(text)}catch(_e){data={raw:text};}
  if(res.getResponseCode()<200||res.getResponseCode()>=300)throw new Error("STRIPE_"+res.getResponseCode()+":"+(data.error&&data.error.message||text));
  return data;
}
function checkoutRowsOpen_(){
  return rowsBy_("CHECKOUTS","status","open");
}
function releaseExpiredCheckouts_(){
  const now=Date.now();
  checkoutRowsOpen_().forEach(function(r){
    const exp=Date.parse(String(r.obj.expiresAt||""));
    if(!exp||exp>now)return;
    updateRow_("CHECKOUTS",r.row,{status:"expired",lastError:"",});
    const listingIds=parseJsonArray_(r.obj.listingIdsJson);
    listingIds.forEach(function(listingId){
      const lr=findRow_("EC_LISTINGS","listingId",listingId);
      if(!lr)return;
      const listing=rowObject_(sh_("EC_LISTINGS"),lr);
      const invRow=findRow_("INVENTORY","inventoryId",listing.inventoryId);
      const inv=invRow?rowObject_(sh_("INVENTORY"),invRow):{};
      if(String(listing.status)==="決済中" && String(inv.stage)==="販売中"){
        updateRow_("EC_LISTINGS",lr,{status:"公開",updatedAt:new Date().toISOString()});
      }
    });
  });
}
function shippingFeeFor_(option){
  const o=String(option||"pickup");
  if(o==="pickup")return settingNumber_("shop.shipping.pickup",0);
  if(o==="nagareyama")return settingNumber_("shop.shipping.nagareyama",2200);
  if(o==="kashiwa")return settingNumber_("shop.shipping.kashiwa",3000);
  if(o==="other")throw new Error("DELIVERY_QUOTE_REQUIRED");
  throw new Error("INVALID_DELIVERY_OPTION");
}
function opCheckoutCreate_(entityId,p,key){
  releaseExpiredCheckouts_();
  const listingIds=Array.isArray(p.listingIds)?p.listingIds.map(String).filter(Boolean):[];
  if(!listingIds.length)throw new Error("EMPTY_CART");
  if(listingIds.length>20)throw new Error("TOO_MANY_ITEMS");
  const listings=[],inventoryIds=[];
  let subtotal=0;
  listingIds.forEach(function(listingId){
    const row=findRow_("EC_LISTINGS","listingId",listingId);
    if(!row)throw new Error("LISTING_NOT_FOUND:"+listingId);
    const x=rowObject_(sh_("EC_LISTINGS"),row);
    if(String(x.status)!=="公開")throw new Error("LISTING_NOT_AVAILABLE:"+listingId);
    const invRow=findRow_("INVENTORY","inventoryId",x.inventoryId);
    if(!invRow)throw new Error("INVENTORY_NOT_FOUND:"+x.inventoryId);
    const inv=rowObject_(sh_("INVENTORY"),invRow);
    if(String(inv.stage)!=="販売中")throw new Error("INVENTORY_NOT_SELLING:"+x.inventoryId);
    const price=Number(x.salePrice||inv.salePrice||0);
    if(!(price>0))throw new Error("INVALID_PRICE:"+listingId);
    listings.push({row:row,obj:x,inv:inv,price:price});
    inventoryIds.push(String(x.inventoryId));
    subtotal+=price;
  });
  const deliveryOption=String(p.deliveryOption||"pickup");
  const shippingFee=shippingFeeFor_(deliveryOption);
  const total=subtotal+shippingFee;
  const now=new Date(),expires=new Date(now.getTime()+30*60*1000);
  const checkoutId=String(entityId||("CHK-"+Utilities.getUuid().replace(/-/g,"").slice(0,10).toUpperCase()));
  const success=PropertiesService.getScriptProperties().getProperty("SHOP_SUCCESS_URL")||"https://ichimaru1031031.github.io/kaitori-form/next/shop/?success=1&session_id={CHECKOUT_SESSION_ID}";
  const cancel=PropertiesService.getScriptProperties().getProperty("SHOP_CANCEL_URL")||"https://ichimaru1031031.github.io/kaitori-form/next/shop/?cancel=1";
  const payload={
    mode:"payment",
    locale:"ja",
    success_url:success,
    cancel_url:cancel,
    client_reference_id:checkoutId,
    "phone_number_collection[enabled]":"true",
    "metadata[checkout_id]":checkoutId,
    "metadata[inventory_ids]":inventoryIds.join(","),
    "metadata[listing_ids]":listingIds.join(","),
    "metadata[delivery_option]":deliveryOption,
    expires_at:String(Math.floor(expires.getTime()/1000))
  };
  if(p.customerEmail)payload.customer_email=String(p.customerEmail);
  if(deliveryOption!=="pickup")payload["shipping_address_collection[allowed_countries][0]"]="JP";
  listings.forEach(function(x,i){
    payload["line_items["+i+"][price_data][currency]"]="jpy";
    payload["line_items["+i+"][price_data][product_data][name]"]=String(x.obj.title||[x.inv.maker,x.inv.model].filter(Boolean).join(" / ")||x.inv.category||"中古家電");
    payload["line_items["+i+"][price_data][unit_amount]"]=String(Math.round(x.price));
    payload["line_items["+i+"][quantity]"]="1";
  });
  if(shippingFee>0){
    const i=listings.length;
    payload["line_items["+i+"][price_data][currency]"]="jpy";
    payload["line_items["+i+"][price_data][product_data][name]"]="配送費";
    payload["line_items["+i+"][price_data][unit_amount]"]=String(Math.round(shippingFee));
    payload["line_items["+i+"][quantity]"]="1";
  }
  const session=stripeFetch_("/v1/checkout/sessions",{method:"post",payload:payload});
  appendObject_("CHECKOUTS",{
    checkoutId:checkoutId,
    stripeSessionId:session.id||"",
    status:"open",
    listingIdsJson:JSON.stringify(listingIds),
    inventoryIdsJson:JSON.stringify(inventoryIds),
    amountSubtotal:subtotal,
    shippingFee:shippingFee,
    amountTotal:total,
    deliveryOption:deliveryOption,
    customerEmail:p.customerEmail||"",
    createdAt:now.toISOString(),
    expiresAt:expires.toISOString(),
    paidAt:"",
    lastError:""
  });
  listings.forEach(function(x){updateRow_("EC_LISTINGS",x.row,{status:"決済中",updatedAt:now.toISOString()});});
  audit_("checkout",checkoutId,"create",{stripeSessionId:session.id,listingIds:listingIds,inventoryIds:inventoryIds,total:total,deliveryOption:deliveryOption},"NEXT");
  return {checkoutId:checkoutId,sessionId:session.id,url:session.url,expiresAt:expires.toISOString(),amountSubtotal:subtotal,shippingFee:shippingFee,amountTotal:total};
}
function stripeShippingText_(session){
  const d=(session.shipping_details)||(session.collected_information&&session.collected_information.shipping_details)||{};
  const a=d.address||{};
  return [a.postal_code,a.state,a.city,a.line1,a.line2].filter(Boolean).join(" ");
}
function confirmStripeCheckout_(sessionId){
  if(!sessionId)throw new Error("SESSION_ID_REQUIRED");
  const session=stripeFetch_("/v1/checkout/sessions/"+encodeURIComponent(sessionId),{method:"get"});
  const row=findRow_("CHECKOUTS","stripeSessionId",sessionId);
  if(!row)return {sessionId:sessionId,paymentStatus:session.payment_status||"",known:false};
  const co=rowObject_(sh_("CHECKOUTS"),row);
  if(String(co.status)==="paid")return {sessionId:sessionId,paymentStatus:"paid",known:true,alreadyConfirmed:true};
  const listingIds=parseJsonArray_(co.listingIdsJson),inventoryIds=parseJsonArray_(co.inventoryIdsJson);
  if(String(session.payment_status)==="paid"){
    const now=new Date().toISOString();
    const customer=(session.customer_details&&session.customer_details.name)||(session.customer_details&&session.customer_details.email)||"EC購入";
    const deliveryOption=String(co.deliveryOption||(session.metadata&&session.metadata.delivery_option)||"pickup");
    const shippingAddress=stripeShippingText_(session);
    const nextAction=deliveryOption==="pickup"?"引渡し準備":"配送日時調整";
    const deliveryLabel=deliveryOption==="pickup"?"店頭受取":deliveryOption==="nagareyama"?"流山市内配送":deliveryOption==="kashiwa"?"柏市内配送":"配送";
    const inventoryNos=[];
    inventoryIds.forEach(function(inventoryId){
      const ir=findRow_("INVENTORY","inventoryId",inventoryId);
      let inv={};
      if(ir){
        inv=rowObject_(sh_("INVENTORY"),ir);
        inventoryNos.push(String(inv.inventoryNo||inventoryId));
        updateRow_("INVENTORY",ir,{stage:"売約済み",nextAction:nextAction,assignedEmployeeId:"EC決済",updatedAt:now});
        appendObject_("INVENTORY_PROCESS_LOG",{
          logId:"PROC-"+Utilities.getUuid(),
          inventoryId:inventoryId,
          inventoryNo:inv.inventoryNo||"",
          stage:"売約済み",
          stageLabel:"売約済み",
          employeeId:"",
          employeeName:"EC決済",
          completedAt:now,
          source:"STRIPE",
          idempotencyKey:"stripe:"+sessionId,
          note:"Stripe Checkout支払完了 / "+deliveryLabel
        });
      }
      const sr=findRow_("SALES","inventoryId",inventoryId);
      const lr=findRow_("EC_LISTINGS","inventoryId",inventoryId);
      const listing=lr?rowObject_(sh_("EC_LISTINGS"),lr):{};
      const salePrice=Number(listing.salePrice||inv.salePrice||0);
      const noteText=["EC決済",deliveryLabel,shippingAddress].filter(Boolean).join(" / ");
      const customerPhone=(session.customer_details&&session.customer_details.phone)||"";
      const customerEmail=(session.customer_details&&session.customer_details.email)||String(co.customerEmail||"");
      const saleObj={status:"売約済み",customerName:customer,salePrice:salePrice,reservedAt:now,soldAt:now,employeeId:"",employeeName:"EC決済",notes:noteText,source:"STRIPE",updatedAt:now,deliveryOption:deliveryOption,shippingAddress:shippingAddress,customerPhone:customerPhone,customerEmail:customerEmail,checkoutId:String(co.checkoutId||""),fulfillmentAppointmentId:""};
      if(sr)updateRow_("SALES",sr,saleObj);
      else{
        appendObject_("SALES",Object.assign({saleId:"SALE-"+inventoryId,inventoryId:inventoryId,inventoryNo:inv.inventoryNo||"",deliveredAt:"",idempotencyKey:"stripe:"+sessionId},saleObj));
      }
    });
    listingIds.forEach(function(listingId){
      const lr=findRow_("EC_LISTINGS","listingId",listingId);
      if(lr)updateRow_("EC_LISTINGS",lr,{status:"非公開",updatedAt:now});
    });
    updateRow_("CHECKOUTS",row,{status:"paid",paidAt:now,lastError:""});
    appendObject_("NOTIFICATIONS",{
      notificationId:"NOTIF-"+Utilities.getUuid(),
      caseId:"",
      type:"EC_ORDER_PAID",
      channel:"internal",
      recipient:"staff",
      status:"new",
      message:"EC決済完了｜"+inventoryNos.join("・")+"｜"+deliveryLabel+"｜"+customer+(shippingAddress?("｜"+shippingAddress):""),
      createdAt:now,
      sentAt:"",
      error:""
    });
    audit_("checkout",co.checkoutId||sessionId,"paid",{sessionId:sessionId,inventoryIds:inventoryIds,listingIds:listingIds,deliveryOption:deliveryOption,shippingAddress:shippingAddress},"STRIPE");
    return {sessionId:sessionId,paymentStatus:"paid",known:true,inventoryIds:inventoryIds,deliveryOption:deliveryOption,nextAction:nextAction};
  }
  const expired=String(session.status)==="expired" || Date.parse(String(co.expiresAt||""))<=Date.now();
  if(expired){
    updateRow_("CHECKOUTS",row,{status:"expired",lastError:""});
    listingIds.forEach(function(listingId){
      const lr=findRow_("EC_LISTINGS","listingId",listingId);
      if(!lr)return;
      const listing=rowObject_(sh_("EC_LISTINGS"),lr),ir=findRow_("INVENTORY","inventoryId",listing.inventoryId),inv=ir?rowObject_(sh_("INVENTORY"),ir):{};
      if(String(inv.stage)==="販売中")updateRow_("EC_LISTINGS",lr,{status:"公開",updatedAt:new Date().toISOString()});
    });
  }
  return {sessionId:sessionId,paymentStatus:session.payment_status||"",known:true,status:expired?"expired":String(session.status||"open")};
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

function opAppointmentNoteUpdate_(entityId,p,key){
  const row=findRow_("APPOINTMENTS","appointmentId",entityId);
  if(!row) throw new Error("APPOINTMENT_NOT_FOUND:"+entityId);
  const at=String(p.updatedAt||new Date().toISOString()),notes=String(p.notes||"");
  updateRow_("APPOINTMENTS",row,{notes:notes,updatedAt:at});
  audit_("appointment",entityId,"note-update",{notes:notes,updatedAt:at},"NEXT");
  return {appointmentId:entityId,notes:notes,updatedAt:at};
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
    sourceRef:p.sourceRef||"",
    createdAt:p.createdAt||now,
    updatedAt:now
  };
  if(row) updateRow_("APPOINTMENTS",row,obj); else appendObject_("APPOINTMENTS",obj);
  if(obj.caseId && ["休み","出勤"].indexOf(String(obj.category))<0){
    const caseRow=findRow_("CASES","caseId",obj.caseId);
    if(caseRow){
      const next=String(obj.category)==="買取"?"訪問・買取伝票作成":String(obj.category)==="工事"?"訪問・工事伝票作成":String(obj.category)+"対応";
      updateRow_("CASES",caseRow,{status:"✅ 訪問日時確定",nextAction:next,confirmedDate:obj.date,confirmedStart:obj.startTime,confirmedEnd:obj.endTime,assignedEmployeeIds:obj.assignedEmployeeIds,updatedAt:now});
    }
  }
  const sourceRef=String(obj.sourceRef||"");
  if(sourceRef){
    if(sourceRef.indexOf("CHK-")===0){
      const cr=findRow_("CHECKOUTS","checkoutId",sourceRef);
      if(cr){
        const checkout=rowObject_(sh_("CHECKOUTS"),cr),ids=parseJsonArray_(checkout.inventoryIdsJson);
        ids.forEach(function(inventoryId){const sr=findRow_("SALES","inventoryId",inventoryId);if(sr)updateRow_("SALES",sr,{fulfillmentAppointmentId:entityId,updatedAt:now});});
      }
    }else if(sourceRef.indexOf("SALE-")===0){
      const sr=findRow_("SALES","saleId",sourceRef);
      if(sr)updateRow_("SALES",sr,{fulfillmentAppointmentId:entityId,updatedAt:now});
    }
  }
  audit_("appointment",entityId,row?"update":"create",obj,"NEXT");
  return {appointmentId:entityId,saved:true,updatedAt:now};
}

function opInventoryArchive_(entityId,p,key){
  const now=String(p.archivedAt||new Date().toISOString()),invRow=findRow_("INVENTORY","inventoryId",entityId);
  if(!invRow) throw new Error("INVENTORY_NOT_FOUND:"+entityId);
  const inv=rowObject_(sh_("INVENTORY"),invRow),saleRow=findRow_("SALES","inventoryId",entityId),sale=saleRow?rowObject_(sh_("SALES"),saleRow):{};
  if(String(inv.archivedAt||"")) return {inventoryId:entityId,inventoryNo:inv.inventoryNo||"",archivedAt:inv.archivedAt,alreadyArchived:true};
  const photos=rowsBy_("INVENTORY_PHOTO_LOG","inventoryId",entityId).map(x=>x.obj);
  const tests=rowsBy_("INVENTORY_TEST_LOG","inventoryId",entityId).map(x=>x.obj);
  const processes=rowsBy_("INVENTORY_PROCESS_LOG","inventoryId",entityId).map(x=>x.obj);
  const archiveId="ARCH-"+Utilities.getUuid();
  const employeeId=String(p.employeeId||sale.employeeId||"");
  const employeeName=String(p.employeeName||sale.employeeName||inv.assignedEmployeeId||"");
  const notes=String(p.notes||sale.notes||"");
  const snapshot={inventory:inv,sale:sale,photos:photos,tests:tests,processes:processes};
  appendObject_("INVENTORY_ARCHIVE",{
    archiveId:archiveId,inventoryId:entityId,inventoryNo:inv.inventoryNo||"",
    sourceServiceOrderId:inv.sourceServiceOrderId||"",sourceLineItemId:inv.sourceLineItemId||"",
    category:inv.category||"",maker:inv.maker||"",model:inv.model||"",year:inv.year||"",spec:inv.spec||"",
    purchasePrice:Number(inv.purchasePrice||0),salePrice:Number(sale.salePrice||inv.salePrice||0),
    finalStage:"販売完了",customerName:sale.customerName||"",employeeId:employeeId,employeeName:employeeName,
    reservedAt:sale.reservedAt||"",soldAt:sale.soldAt||"",deliveredAt:sale.deliveredAt||"",
    archivedAt:now,storageLocation:inv.storageLocation||"",photoCount:photos.length,testCount:tests.length,
    processCount:processes.length,notes:notes,snapshotJson:snapshot
  });
  appendObject_("SALES_ARCHIVE",{
    archiveId:archiveId,saleId:sale.saleId||("SALE-"+entityId),inventoryId:entityId,inventoryNo:inv.inventoryNo||"",
    customerName:sale.customerName||"",salePrice:Number(sale.salePrice||inv.salePrice||0),
    employeeId:employeeId,employeeName:employeeName,reservedAt:sale.reservedAt||"",soldAt:sale.soldAt||"",
    deliveredAt:sale.deliveredAt||"",notes:notes,source:"NEXT",archivedAt:now,snapshotJson:sale
  });
  updateRow_("INVENTORY",invRow,{stage:"販売完了",nextAction:"アーカイブ済み",assignedEmployeeId:employeeName,updatedAt:now,archivedAt:now});
  if(saleRow) updateRow_("SALES",saleRow,{status:"販売完了",employeeId:employeeId,employeeName:employeeName,updatedAt:now});
  hideEcListing_(entityId,now);
  appendObject_("INVENTORY_PROCESS_LOG",{
    logId:p.processLogId||("PROC-"+Utilities.getUuid()),inventoryId:entityId,inventoryNo:inv.inventoryNo||"",
    stage:"販売完了",stageLabel:"販売完了",employeeId:employeeId,employeeName:employeeName,completedAt:now,
    source:"NEXT",idempotencyKey:key,note:notes||"販売完了アーカイブ"
  });
  audit_("inventory",entityId,"archive",{archiveId:archiveId,archivedAt:now},"NEXT");
  return {inventoryId:entityId,inventoryNo:inv.inventoryNo||"",archiveId:archiveId,status:"販売完了",archivedAt:now};
}

function opInventorySaleUpdate_(entityId,p,key){
  const now=String(p.updatedAt||new Date().toISOString()),stage=String(p.status||"販売準備完了");
  const next=String(p.nextAction||(stage==="販売中"?"問い合わせ対応・売約登録":"販売を開始する"));
  const invRow=findRow_("INVENTORY","inventoryId",entityId);
  if(!invRow) throw new Error("INVENTORY_NOT_FOUND:"+entityId);
  const inv=rowObject_(sh_("INVENTORY"),invRow),inventoryNo=String(p.inventoryNo||inv.inventoryNo||"");
  updateRow_("INVENTORY",invRow,{
    salePrice:Number(p.salePrice||0),
    storageLocation:p.storageLocation||inv.storageLocation||"",
    stage:stage,
    nextAction:next,
    assignedEmployeeId:p.employeeName||p.employeeId||"",
    updatedAt:now
  });
  const saleRow=findRow_("SALES","inventoryId",entityId);
  const previousSale=saleRow?rowObject_(sh_("SALES"),saleRow):{};
  const saleObj={
    saleId:p.saleId||previousSale.saleId||("SALE-"+entityId),
    inventoryId:entityId,
    inventoryNo:inventoryNo,
    status:stage,
    customerName:p.customerName||previousSale.customerName||"",
    salePrice:Number(p.salePrice||0),
    employeeId:p.employeeId||"",
    employeeName:p.employeeName||"",
    reservedAt:p.reservedAt||previousSale.reservedAt||"",
    soldAt:p.soldAt||previousSale.soldAt||"",
    deliveredAt:p.deliveredAt||previousSale.deliveredAt||"",
    notes:p.notes||previousSale.notes||"",
    source:"NEXT",
    idempotencyKey:key,
    updatedAt:now
  };
  if(saleRow) updateRow_("SALES",saleRow,saleObj); else appendObject_("SALES",saleObj);
  appendObject_("INVENTORY_PROCESS_LOG",{
    logId:p.processLogId||("PROC-"+Utilities.getUuid()),
    inventoryId:entityId,inventoryNo:inventoryNo,stage:stage,stageLabel:stage,
    employeeId:p.employeeId||"",employeeName:p.employeeName||"",completedAt:now,
    source:"NEXT",idempotencyKey:key,note:p.notes||""
  });
  const ecListing=syncEcForSale_(entityId,inv,saleObj,p,now);
  audit_("inventory",entityId,"sale-update",saleObj,"NEXT");
  return {inventoryId:entityId,inventoryNo:inventoryNo,status:stage,salePrice:Number(p.salePrice||0),ecListing:ecListing,updatedAt:now};
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
  const appt=row?rowObject_(sh_("APPOINTMENTS"),row):{};
  if(row) updateRow_("APPOINTMENTS",row,{status:"visiting",updatedAt:at});
  const caseId=String(p.caseId||appt.caseId||"");
  if(caseId){
    const caseRow=findRow_("CASES","caseId",caseId);
    if(caseRow) updateRow_("CASES",caseRow,{status:"訪問中",nextAction:"伝票入力・確定",updatedAt:at});
  }
  audit_("appointment",entityId,"visit-start",p,"NEXT");
  return {appointmentId:entityId,caseId:caseId,status:"visiting",startedAt:at};
}

function opFinalizeSlip_(entityId,p,key){
  const confirmedAt=String(p.confirmedAt||new Date().toISOString());
  const version=Number(p.version||1);
  const confirmations=(p.payload&&p.payload.confirmations)||{};
  if(confirmations.customerDetails!==true||confirmations.purchaseTerms!==true) throw new Error("CUSTOMER_CONFIRMATIONS_REQUIRED");
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
  const pdf=createCustomerPdf_(linked,p.signatureDataUrl||signatureFileUrl);
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
  if(links.appointmentId){
    const apptRow=findRow_("APPOINTMENTS","appointmentId",links.appointmentId);
    if(apptRow) updateRow_("APPOINTMENTS",apptRow,{serviceOrderId:links.serviceOrderId,status:"completed",updatedAt:confirmedAt});
  }
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

function opSendSlipPdfEmail_(entityId,p,key){
  const serviceOrderId=String(entityId||p.serviceOrderId||"").trim();
  if(!serviceOrderId) throw new Error("SERVICE_ORDER_ID_REQUIRED");
  const soRow=findRow_("SERVICE_ORDERS","serviceOrderId",serviceOrderId);
  if(!soRow) throw new Error("SERVICE_ORDER_NOT_FOUND:"+serviceOrderId);
  const serviceOrder=rowObject_(sh_("SERVICE_ORDERS"),soRow);
  if(String(serviceOrder.customerConfirmed).toLowerCase()!=="true") throw new Error("CUSTOMER_CONFIRMATION_REQUIRED");
  const customerId=String(serviceOrder.customerId||"");
  const customerRow=findRow_("CUSTOMERS","customerId",customerId);
  if(!customerRow) throw new Error("CUSTOMER_NOT_FOUND:"+customerId);
  const customer=rowObject_(sh_("CUSTOMERS"),customerRow);
  const email=String(customer.email||"").trim();
  if(!email) throw new Error("CUSTOMER_EMAIL_NOT_REGISTERED");
  const requestedDocumentId=String(p.documentId||"");
  const documents=rowsBy_("DOCUMENTS","serviceOrderId",serviceOrderId)
    .filter(function(x){return String(x.obj.type||"")==="customer-copy";})
    .sort(function(a,b){return Number(b.obj.version||0)-Number(a.obj.version||0);});
  const selected=requestedDocumentId
    ? documents.find(function(x){return String(x.obj.documentId||"")===requestedDocumentId;})
    : documents[0];
  if(!selected) throw new Error("ISSUED_PDF_NOT_FOUND:"+serviceOrderId);
  if(String(selected.obj.status||"")==="sent"&&!p.resend) throw new Error("PDF_ALREADY_SENT_USE_RESEND");
  const fileId=String(selected.obj.fileId||"");
  if(!fileId) throw new Error("PDF_FILE_ID_MISSING");
  const sentAt=new Date().toISOString();
  const version=Number(selected.obj.version||1);
  const file=DriveApp.getFileById(fileId);
  const subject="【買取レスキュー】お客様控え "+serviceOrderId+" 第"+version+"版";
  const body=(customer.name||"お客様")+" 様\n\nご確認・ご署名いただいた伝票の控えをお送りします。\n受付番号："+serviceOrderId+"\n版：第"+version+"版\n\n添付PDFをご確認ください。\n\n買取レスキュー";
  try{
    MailApp.sendEmail({
      to:email,
      subject:subject,
      body:body,
      name:"買取レスキュー",
      attachments:[file.getBlob().setName(String(selected.obj.fileName||file.getName()))]
    });
    updateRow_("DOCUMENTS",selected.row,{sentAt:sentAt,sentMethod:"email",status:"sent"});
    audit_("document",String(selected.obj.documentId||fileId),p.resend?"resend-slip-pdf":"send-slip-pdf",{serviceOrderId:serviceOrderId,version:version,sentMethod:"email",sentAt:sentAt},"NEXT");
    return {ok:true,serviceOrderId:serviceOrderId,documentId:selected.obj.documentId||"",version:version,sentAt:sentAt,sentMethod:"email",message:"第"+version+"版PDFをメールで送信しました。"};
  }catch(error){
    updateRow_("DOCUMENTS",selected.row,{status:"failed"});
    audit_("document",String(selected.obj.documentId||fileId),"send-slip-pdf-failed",{serviceOrderId:serviceOrderId,version:version,error:String(error&&error.message||error)},"NEXT");
    throw error;
  }
}

function opGetSlipPdfShare_(entityId,p,key){
  const serviceOrderId=String(entityId||p.serviceOrderId||"").trim();
  if(!serviceOrderId) throw new Error("SERVICE_ORDER_ID_REQUIRED");
  const soRow=findRow_("SERVICE_ORDERS","serviceOrderId",serviceOrderId);
  if(!soRow) throw new Error("SERVICE_ORDER_NOT_FOUND:"+serviceOrderId);
  const serviceOrder=rowObject_(sh_("SERVICE_ORDERS"),soRow);
  if(String(serviceOrder.customerConfirmed).toLowerCase()!=="true") throw new Error("CUSTOMER_CONFIRMATION_REQUIRED");
  const documents=rowsBy_("DOCUMENTS","serviceOrderId",serviceOrderId)
    .filter(function(x){return String(x.obj.type||"")==="customer-copy";})
    .sort(function(a,b){return Number(b.obj.version||0)-Number(a.obj.version||0);});
  if(!documents.length) throw new Error("ISSUED_PDF_NOT_FOUND:"+serviceOrderId);
  const document=documents[0].obj,fileId=String(document.fileId||"");
  if(!fileId) throw new Error("PDF_FILE_ID_MISSING");
  const file=DriveApp.getFileById(fileId),blob=file.getBlob();
  return {
    serviceOrderId:serviceOrderId,
    documentId:document.documentId||"",
    version:Number(document.version||1),
    fileName:String(document.fileName||file.getName()),
    fileUrl:String(document.fileUrl||file.getUrl()),
    mimeType:String(blob.getContentType()||MimeType.PDF),
    pdfBase64:Utilities.base64Encode(blob.getBytes())
  };
}

function nextId_(prefix){
  return prefix+"-"+Utilities.getUuid().replace(/-/g,"").slice(0,8).toUpperCase();
}
function ensureFinalizedEntities_(p,confirmedAt){
  const payload=p.payload||{},customer=payload.customer||{},selected=payload.selected||[],appointmentId=String(payload.appointmentId||p.appointmentId||"").trim();
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
      postalCode:customer.postalCode||"",address:customer.address||"",preferredContact:"",lineUserId:"",source:"next",
      blueReceptionId:"",createdAt:confirmedAt,updatedAt:confirmedAt
    });
  }else{
    const customerRow=findRow_("CUSTOMERS","customerId",customerId);
    if(customerRow){
      const existing=rowObject_(sh_("CUSTOMERS"),customerRow);
      updateRow_("CUSTOMERS",customerRow,{
        name:customer.name||existing.name||"",
        phone:String(customer.phone||existing.phone||"").replace(/\D/g,""),
        email:customer.email||existing.email||"",
        postalCode:customer.postalCode||existing.postalCode||"",
        address:customer.address||existing.address||"",
        updatedAt:confirmedAt
      });
    }
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
    serviceOrderId:serviceOrderId,caseId:caseId,appointmentId:appointmentId,customerId:customerId,
    status:"お客様確認済み",selectedServicesJson:JSON.stringify(selected),paymentMethod:payload.paymentMethod||"",
    salesWorkTotal:totals.salesWorkTotal,purchaseTotal:totals.purchaseTotal,recycleTotal:totals.recycleTotal,
    deliveryTotal:totals.deliveryTotal,netTotal:Number(p.total||totals.netTotal),customerConfirmed:true,
    confirmedAt:confirmedAt,signatureFileId:"",latestPdfId:"",
    createdAt:soRow?rowObject_(sh_("SERVICE_ORDERS"),soRow).createdAt||confirmedAt:confirmedAt,updatedAt:confirmedAt
  };
  if(soRow) updateRow_("SERVICE_ORDERS",soRow,so); else appendObject_("SERVICE_ORDERS",so);
  return {caseId:caseId,customerId:customerId,serviceOrderId:serviceOrderId,appointmentId:appointmentId};
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
  const d=snap.payload||{},customer=d.customer||{},items=d.items||{},documents=[];
  function rowsFor(keys){
    const rows=[];
    keys.forEach(function(key){(items[key]||[]).forEach(function(item){rows.push({serviceType:key,item:item});});});
    return rows;
  }
  function documentFor(title,keys,tone){
    const rows=rowsFor(keys); if(!rows.length) return;
    const body=rows.map(function(row){
      const x=row.item||{},year=String(x.year||"").trim()||"不明",details=[x.maker,x.model,"年式 "+year,x.spec].filter(Boolean).join(" / ");
      return "<tr><td><b>"+html_(x.category||"明細")+"</b><small>"+html_(details)+"</small></td><td class='qty'>"+html_(x.quantity||1)+"</td><td class='num'>"+yen_(x.amount||0)+"</td></tr>";
    }).join("");
    const total=rows.reduce(function(sum,row){return sum+Number(row.item.amount||0);},0);
    documents.push({title:title,tone:tone,body:body,total:total});
  }
  documentFor("販売・工事",["sale","work","delivery","estimate"],"commercial");
  documentFor("リサイクル",["recycle"],"recycle");
  documentFor("買取",["purchase"],"purchase");
  if(!documents.length) documents.push({title:"お客様控え",tone:"commercial",body:"<tr><td><b>明細なし</b></td><td class='qty'>-</td><td class='num'>¥0</td></tr>",total:0});
  const customerHtml="<div class='customer'><div><span>お客様</span><b>"+html_(customer.name||"未登録")+" 様</b></div><div><span>ご住所</span><strong>"+html_([customer.postalCode?("〒"+customer.postalCode):"",customer.address||"未登録"].filter(Boolean).join(" "))+"</strong></div><div class='contact'>"+html_([customer.phone,customer.email].filter(Boolean).join(" / "))+"</div></div>";
  const sign=signatureUrl?"<div class='signature'><h3>お客様サイン</h3><img src='"+html_(signatureUrl)+"'></div>":"";
  const signedTotal=Number(snap.total||0),customerTotal=Math.abs(signedTotal),customerTotalLabel=signedTotal<0?"お客様受取額":"ご請求・差引合計";
  const pages=documents.map(function(doc,index){
    const isLast=index===documents.length-1;
    return "<section class='documentPage "+doc.tone+(isLast?" last":"")+"'><header><div><b>買取レスキュー</b><span>お客様送付用・お客様控え</span></div><em>第"+versionText_(snap.version)+"版</em></header><div class='documentTitle'><small>お客様用 明細書</small><h1>"+html_(doc.title)+"明細書</h1></div><div class='meta'>伝票番号 "+html_(snap.sourceServiceOrderId||snap.caseId||"")+"　発行 "+html_(snap.confirmedAt||"")+"</div>"+customerHtml+"<table><thead><tr><th>商品・作業内容</th><th class='qty'>数量</th><th class='num'>金額</th></tr></thead><tbody>"+doc.body+"</tbody></table><div class='documentTotal'><span>この明細の合計</span><b>"+yen_(doc.total)+"</b></div>"+(isLast?"<div class='grandTotal'><span>"+customerTotalLabel+"</span><b>"+yen_(customerTotal)+"</b></div><div class='consent'>お客様情報、明細および金額を確認し、内容に同意しました。</div>"+sign:"")+"<footer>お客様にお渡しする確定明細書です。過去版は上書きされません。<span>"+(index+1)+" / "+documents.length+"</span></footer></section>";
  }).join("");
  const html="<!doctype html><html><head><meta charset='utf-8'><style>@page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial,'Noto Sans JP',sans-serif;color:#18251f;background:#fff}.documentPage{position:relative;min-height:277mm;padding:15mm 14mm 17mm;page-break-after:always}.documentPage.last{page-break-after:auto}.documentPage header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #3d7667;padding-bottom:8px}.documentPage header div b{display:block;font-size:18px}.documentPage header div span{font-size:9px;color:#60716a}.documentPage header em{font-style:normal;font-weight:bold;background:#e7f3ef;color:#2f6758;border-radius:20px;padding:6px 11px}.documentTitle{margin:16px 0 5px}.documentTitle small{font-size:10px;color:#6c7a75}.documentTitle h1{font-size:27px;line-height:1.25;margin:2px 0}.meta{font-size:10px;color:#62716b;margin-bottom:12px}.customer{border:2px solid #cbded7;border-radius:12px;padding:12px 14px;margin-bottom:16px;background:#f7fbf9}.customer span{display:block;font-size:9px;color:#66766f}.customer b{display:block;font-size:22px;line-height:1.4;margin-bottom:7px}.customer strong{display:block;font-size:15px;line-height:1.55}.customer .contact{font-size:12px;font-weight:bold;margin-top:7px}table{width:100%;border-collapse:separate;border-spacing:0;border:1px solid #cedbd6;border-radius:10px;overflow:hidden}th{background:#edf5f2;color:#344a42;font-size:11px;padding:9px;text-align:left}td{border-top:1px solid #dce5e1;padding:11px 9px;vertical-align:top;font-size:13px}td b{display:block;font-size:15px;line-height:1.4}td small{display:block;font-size:11px;line-height:1.5;color:#566861;margin-top:3px}.qty{width:52px;text-align:center}.num{width:108px;text-align:right;font-weight:bold;font-size:15px}.documentTotal,.grandTotal{display:flex;justify-content:flex-end;align-items:baseline;gap:18px;margin-top:13px}.documentTotal span{font-size:12px}.documentTotal b{font-size:21px}.grandTotal{border-top:2px solid #385f54;padding-top:12px}.grandTotal span{font-size:14px;font-weight:bold}.grandTotal b{font-size:27px;color:#214f43}.consent{margin-top:16px;border:1px solid #d5dfdb;background:#f8faf9;border-radius:9px;padding:10px;font-size:11px;font-weight:bold}.signature{margin-top:14px}.signature h3{font-size:12px;margin:0 0 6px}.signature img{display:block;max-width:300px;max-height:90px;border:1px solid #cad5d1;border-radius:7px}.documentPage footer{position:absolute;left:14mm;right:14mm;bottom:9mm;border-top:1px solid #d6dfdb;padding-top:6px;font-size:8px;color:#78847f}.documentPage footer span{float:right}.purchase header{border-color:#a9574e}.purchase header em{background:#fbecea;color:#8b4038}.recycle header{border-color:#557a91}.recycle header em{background:#eaf2f7;color:#365f76}</style></head><body>"+pages+"</body></html>";
  const blob=HtmlService.createHtmlOutput(html).getBlob().getAs(MimeType.PDF);
  const base=(snap.caseId||snap.draftId||"NEXT").replace(/[^0-9A-Za-z_-]/g,"_");
  const fileName=base+"_お客様用明細書_v"+Number(snap.version||1)+"_"+Utilities.formatDate(new Date(),"Asia/Tokyo","yyyyMMdd-HHmmss")+".pdf";
  blob.setName(fileName);
  const file=DriveApp.getFolderById(CONFIG.PDF_FOLDER_ID).createFile(blob);
  return {fileId:file.getId(),fileUrl:file.getUrl(),fileName:fileName};
}
function versionText_(v){return String(Number(v||1));}
function yen_(n){return "¥"+Number(n||0).toLocaleString("ja-JP");}
function html_(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
