const ADAPTER = Object.freeze({
  PAIR_HASH: "8f2be2c80f42c3d4a52ea98d2013127cae1fa596a5c7ecab49ad57b07a459cd9",
  SESSION_DAYS: 365,
  OCR_SESSION_SECONDS: 21600,
  DEVICE_LINK_MINUTES: 1440,
});

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || "");
  if (action !== "bridge") {
    return HtmlService.createHtmlOutput("Not found");
  }
  return HtmlService.createHtmlOutputFromFile("Bridge")
    .setTitle("Kaitori Rescue NEXT Assessment Bridge")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  const requestId = String((e && e.parameter && e.parameter.requestId) || "");
  const channel = String((e && e.parameter && e.parameter.channel) || "");
  const operation = String((e && e.parameter && e.parameter.operation) || "");
  let payload = {};
  let body;
  try {
    payload = JSON.parse(String((e && e.parameter && e.parameter.payload) || "{}"));
    const result = operation === "pair"
      ? adapterPair(payload.code)
      : operation === "claim-device-link"
        ? claimDeviceLink_(payload.token)
        : operation === "ocr-bootstrap"
          ? issueOcrSession_()
        : adapterRequest(String((e && e.parameter && e.parameter.token) || ""), operation, payload);
    body = { type: "kr-assessment-adapter-response", requestId: requestId, channel: channel, result: result };
  } catch (error) {
    body = {
      type: "kr-assessment-adapter-response",
      requestId: requestId,
      channel: channel,
      error: String(error && error.message || error),
    };
  }
  const template = HtmlService.createTemplateFromFile("BridgeResponse");
  template.responseJson = JSON.stringify(body).replace(/</g, "\\u003c");
  return template.evaluate()
    .setTitle("Kaitori Rescue NEXT Assessment Response")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function adapterPair(code) {
  const cache = CacheService.getScriptCache();
  const rateKey = "pair:v2:" + hash_(String(code || "").slice(0, 4));
  const attempts = Number(cache.get(rateKey) || 0);
  if (attempts >= 8) throw new Error("接続試行が多すぎます。時間をおいてください。");
  cache.put(rateKey, String(attempts + 1), 600);
  if (!safeEqual_(hash_(normalizeCode_(code)), ADAPTER.PAIR_HASH)) {
    throw new Error("接続コードが正しくありません。");
  }
  return issueSession_();
}

function adapterRequest(token, operation, payload) {
  payload = payload || {};
  // Public read-only access is restricted to one signed, confirmed PDF version.
  if(operation==="customer-pdf") return GreenNext.greenBridgeRequest("customer-pdf",payload);
  if (operation === "label-ocr-status" || operation === "label-ocr") {
    requireOcrSession_(token);
  } else {
    requireSession_(token);
  }
  switch (String(operation || "")) {
    case "dashboard": return cachedDashboard_(Boolean(payload.force));
    case "case": return cachedCase_(String(payload.id || ""), Boolean(payload.force));
    case "save-assessment": return mutateCase_(String(payload.id || ""), function () { return ProdDash.saveAssessmentDraft(String(payload.id || ""), payload.amounts || [], payload.data || null); });
    case "send-estimate": return mutateCase_(String(payload.id || ""), function () { return ProdDash.saveAndSendEstimate(String(payload.id || ""), payload.amounts || [], String(payload.message || "")); });
    case "send-combined": return sendVisitWithHold_("send-combined", payload);
    case "save-visit": return mutateCase_(String(payload.id || ""), function () { return ProdDash.saveCase(String(payload.id || ""), payload.data || {}); });
    case "send-visit": return sendVisitWithHold_("send-visit", payload);
    case "status": return mutateCase_(String(payload.id || ""), function () { return ProdDash.setStatus(String(payload.id || ""), String(payload.status || "")); });
    case "create-device-link": return createDeviceLink_();
    case "label-ocr-status": return labelOcrStatus_();
    case "label-ocr": return labelOcr_(payload, token);
    case "green-ping": return GreenNext.greenBridgeRequest("ping", payload);
    case "green-snapshot": return visitSnapshot_(payload);
    case "visit-calendar": return visitCalendar_();
    case "green-write": {
      const job = payload.job || payload;
      if (job.operation === "appointment-upsert") assertBlueVisitAvailable_(job.entityId, job.payload || {});
      return GreenNext.greenBridgeRequest("write", payload);
    }
    default: throw new Error("UNSUPPORTED_OPERATION:" + operation);
  }
}

function blueVisitAppointments_(force) {
  const dashboard = cachedDashboard_(force);
  return (dashboard.cases || []).filter(function(c) {
    return c.visitDateKey && c.visitTime && !/キャンセル|予約変更/.test(c.status || "") && (/訪問日時確定/.test(c.status || "") || /確認待ち|承認待ち/.test(c.nextAction || ""));
  }).map(function(c) {
    const times = String(c.visitTime).split(/[〜～]/);
    return {appointmentId:"NEXT-VISIT-"+c.id,caseId:c.id,date:c.visitDateKey,startTime:times[0],endTime:times[1],category:"買取",customerName:c.name,title:c.name+"様",phone:c.phone||"",address:c.address||"",status:/訪問日時確定/.test(c.status||"")?"confirmed":"tentative",sourceRef:c.id,blueReceptionId:c.id};
  });
}
function assertBlueVisitAvailable_(entityId, p) {
  if (["休み","出勤"].indexOf(p.category)>=0) return;
  const id=String(p.caseId||p.sourceRef||"").replace(/^BLUE-CASE-/,"");
  const conflict=blueVisitAppointments_(true).find(function(a){return a.appointmentId!==entityId && a.caseId!==id && a.date===p.date && a.startTime<p.endTime && p.startTime<a.endTime;});
  if(conflict) throw new Error("この時間は仮押さえ・予約済みです："+conflict.customerName+" "+conflict.startTime+"〜"+conflict.endTime);
}
function visitSnapshot_(payload) {
  const snap=GreenNext.greenBridgeRequest("snapshot",payload),visits=blueVisitAppointments_(false);
  snap.appointments=overlayBlueVisits_(snap.appointments||[],visits);
  return snap;
}
function overlayBlueVisits_(existing,visits){
  const byCase={};
  const projected=visits.map(function(visit){
    byCase[visit.caseId]=true;
    const prior=existing.find(function(a){return String(a.caseId||a.sourceRef||"").replace(/^BLUE-CASE-/,"")===visit.caseId && !["deleted","cancelled"].includes(a.status);});
    return prior && prior.status==="completed" ? prior : Object.assign({},prior||{},visit);
  });
  return existing.filter(function(a){return !byCase[String(a.caseId||a.sourceRef||"").replace(/^BLUE-CASE-/,"")];}).concat(projected);
}
function visitCalendar_() {
  const dashboard=cachedDashboard_(true),visits=blueVisitAppointments_(false);
  let existing=GreenNext.greenBridgeRequest("appointments",{});
  const byCase={};visits.forEach(function(a){byCase[a.caseId]=a;});
  existing.forEach(function(a){
    if(String(a.appointmentId||"").indexOf("NEXT-VISIT-")!==0 || a.status==="completed")return;
    const id=String(a.caseId||""),c=(dashboard.cases||[]).find(function(row){return row.id===id;});
    const current=byCase[id];
    const next=current ? Object.assign({},a,current) : c && /キャンセル|予約変更/.test(c.status||"") ? Object.assign({},a,{status:"deleted"}) : null;
    if(next && (a.status!==next.status || a.date!==next.date || a.startTime!==next.startTime || a.endTime!==next.endTime)){
      GreenNext.greenBridgeRequest("write",{job:{id:"visit-reconcile:"+Utilities.getUuid(),operation:"appointment-upsert",entityId:a.appointmentId,payload:next}});
      Object.assign(a,next);
    }
  });
  return overlayBlueVisits_(existing,visits);
}
function sendVisitWithHold_(operation, payload) {
  const id=String(payload.id||""),data=payload.data||{},times=String(data.visitTime||"").split(/[〜～]/);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(data.visitDate||"") || times.length!==2 || !/^\d{2}:\d{2}$/.test(times[0]) || !/^\d{2}:\d{2}$/.test(times[1]) || times[0]>=times[1]) throw new Error("訪問日・開始・終了を確認してください。");
  const date=new Date(data.visitDate+"T12:00:00+09:00");
  if(!isFinite(date.getTime()) || Utilities.formatDate(date,"Asia/Tokyo","yyyy-MM-dd")!==data.visitDate)throw new Error("存在する日付を選択してください。");
  if(data.visitDate<Utilities.formatDate(new Date(),"Asia/Tokyo","yyyy-MM-dd"))throw new Error("過去の日付は選択できません。");
  if(date.getUTCDay()===4)throw new Error("木曜日は定休日です。別の日を選択してください。");
  if(!/^\d{2}:00〜\d{2}:00$/.test(data.visitTime) || Number(times[0].slice(0,2))<8 || Number(times[1].slice(0,2))>20)throw new Error("訪問時間は8時〜20時の範囲で選択してください。");
  if(!String(data.name||"").trim())throw new Error("お客様のお名前を確認してください。");
  const current=ProdDash.getCase(id);
  if(operation==="send-visit" && (!/買取確定/.test(current.status||"") || /確認待ち/.test(current.nextAction||""))) throw new Error("この案件は訪問日時を送信できません。最新状態を確認してください。");
  if(operation==="send-combined" && !(payload.amounts||[]).some(function(x){return String(x).trim()!=="";})) throw new Error("査定額を入力してください。");
  if(operation==="send-combined" && (!/新規|査定中|予約変更/.test(current.status||"") || (current.mode!=="出張買取希望" && !/予約変更/.test(current.status||""))))throw new Error("この案件は査定額・訪問日時を送信できません。最新状態を確認してください。");
  if((payload.amounts||[]).some(function(x){const value=String(x).replace(/[,，￥¥円\s]/g,"");return value!=="" && (!isFinite(Number(value))||Number(value)<0);}))throw new Error("査定額は0以上の金額で入力してください。");
  const appointment={appointmentId:"NEXT-VISIT-"+id,caseId:id,date:data.visitDate,startTime:times[0],endTime:times[1],category:"買取",customerName:current.name||data.name,phone:current.phone||data.phone,address:current.address||data.address,status:"tentative",sourceRef:id,notes:"訪問日時確認送信・仮押さえ"};
  assertBlueVisitAvailable_(appointment.appointmentId,appointment);
  // Reserve under the Green write lock before calling the protected delivery route.
  const job={id:"visit-reserve:"+Utilities.getUuid(),operation:"appointment-upsert",entityId:appointment.appointmentId,payload:appointment};
  GreenNext.greenBridgeRequest("write",{job:job});
  try {
    const result=mutateCase_(id,function(){return operation==="send-combined" ? ProdDash.saveAndSendCombined(id,payload.amounts||[],data,String(payload.message||"")) : ProdDash.saveAndSendVisit(id,data,String(payload.message||""));});
    return Object.assign({},result,{appointment:appointment});
  } catch(error) {
    // A delivery timeout may occur after sending: keep the slot to prevent double booking.
    throw new Error(String(error&&error.message||error)+"（枠は仮押さえ中です。送信履歴を確認してから予定を変更してください）");
  }
}

function cachedDashboard_(force) {
  const cache = CacheService.getScriptCache();
  const key = "assessment-dashboard:v2";
  if (!force) {
    const stored = cache.get(key);
    if (stored) {
      try { return JSON.parse(stored); } catch (_error) {}
    }
  }
  const result = ProdDash.getDashboardData(true);
  putSmallJson_(cache, key, result, 20);
  return result;
}

function cachedCase_(id, force) {
  const cache = CacheService.getScriptCache();
  const key = assessmentCaseCacheKey_(id);
  if (!force) {
    const stored = cache.get(key);
    if (stored) {
      try { return JSON.parse(stored); } catch (_error) {}
    }
  }
  const result = ProdDash.getCase(id);
  putSmallJson_(cache, key, result, 120);
  return result;
}

function putSmallJson_(cache, key, value, seconds) {
  try {
    const json = JSON.stringify(value);
    if (json.length < 90000) cache.put(key, json, seconds);
  } catch (_error) {}
}

function assessmentCaseCacheKey_(id) {
  return "assessment-case:v2:" + hash_(String(id || "")).slice(0, 24);
}

function mutateCase_(id, operation) {
  const result = operation();
  const cache = CacheService.getScriptCache();
  cache.remove("assessment-dashboard:v2");
  cache.remove(assessmentCaseCacheKey_(id));
  return result;
}

function labelOcrStatus_() {
  return {
    ok: true,
    configured: Boolean(PropertiesService.getScriptProperties().getProperty("GOOGLE_CLOUD_VISION_API_KEY")),
    engine: "google-cloud-vision",
    storesImage: false,
  };
}

function labelOcr_(payload, token) {
  const properties = PropertiesService.getScriptProperties();
  const apiKey = String(properties.getProperty("GOOGLE_CLOUD_VISION_API_KEY") || "").trim();
  if (!apiKey) throw new Error("HIGH_ACCURACY_OCR_NOT_CONFIGURED");
  const mimeType = String(payload && payload.mimeType || "image/jpeg").toLowerCase();
  if (["image/jpeg", "image/png", "image/webp"].indexOf(mimeType) < 0) throw new Error("OCR_IMAGE_TYPE_NOT_SUPPORTED");
  const imageBase64 = String(payload && payload.imageBase64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!imageBase64 || imageBase64.length > 4000000) throw new Error("OCR_IMAGE_TOO_LARGE");
  const cache = CacheService.getScriptCache();
  const minuteKey = "label-ocr-rate:" + Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMddHHmm");
  const count = Number(cache.get(minuteKey) || 0);
  if (count >= 60) throw new Error("OCR_RATE_LIMIT");
  cache.put(minuteKey, String(count + 1), 90);
  const deviceMinuteKey = "label-ocr-device-rate:" + hash_(String(token || "")).slice(0, 16) + ":" + Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMddHHmm");
  const deviceCount = Number(cache.get(deviceMinuteKey) || 0);
  if (deviceCount >= 12) throw new Error("OCR_DEVICE_RATE_LIMIT");
  cache.put(deviceMinuteKey, String(deviceCount + 1), 90);
  const response = UrlFetchApp.fetch("https://vision.googleapis.com/v1/images:annotate?key=" + encodeURIComponent(apiKey), {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify({
      requests: [{
        image: {content: imageBase64},
        features: [{type: "TEXT_DETECTION", maxResults: 1, model: "builtin/latest"}],
        imageContext: {languageHints: ["ja", "en"]},
      }],
    }),
  });
  const status = response.getResponseCode();
  const body = JSON.parse(response.getContentText() || "{}");
  if (status < 200 || status >= 300) {
    const message = body && body.error && body.error.message || ("HTTP " + status);
    throw new Error("CLOUD_VISION_ERROR:" + message);
  }
  const first = body.responses && body.responses[0] || {};
  if (first.error) throw new Error("CLOUD_VISION_ERROR:" + String(first.error.message || "unknown"));
  const text = String(first.fullTextAnnotation && first.fullTextAnnotation.text || first.textAnnotations && first.textAnnotations[0] && first.textAnnotations[0].description || "").trim();
  if (!text) throw new Error("OCR_TEXT_NOT_FOUND");
  return {ok: true, engine: "google-cloud-vision", text: text, storesImage: false};
}

function requireSession_(token) {
  const tokenHash = hash_(String(token || ""));
  const key = "session:" + tokenHash;
  const fastKey = "session-ok:" + tokenHash.slice(0, 32);
  const cache = CacheService.getScriptCache();
  if (cache.get(fastKey) === "1") return;
  const properties = PropertiesService.getScriptProperties();
  const expiresAt = Number(properties.getProperty(key) || 0);
  if (!expiresAt || expiresAt < Date.now()) {
    properties.deleteProperty(key);
    throw new Error("SESSION_EXPIRED");
  }
  if (expiresAt - Date.now() < 30 * 86400000)
    properties.setProperty(key, String(Date.now() + ADAPTER.SESSION_DAYS * 86400000));
  cache.put(fastKey, "1", 600);
}

function requireOcrSession_(token) {
  const value = String(token || "");
  const properties = PropertiesService.getScriptProperties();
  const assessmentKey = "session:" + hash_(value);
  const ocrKey = "ocr-session:" + hash_(value);
  const now = Date.now();
  const assessmentExpiresAt = Number(properties.getProperty(assessmentKey) || 0);
  if (assessmentExpiresAt >= now) {
    properties.setProperty(assessmentKey, String(now + ADAPTER.SESSION_DAYS * 86400000));
    return;
  }
  const cache = CacheService.getScriptCache();
  if (cache.get(ocrKey) !== "1") throw new Error("SESSION_EXPIRED");
  cache.put(ocrKey, "1", ADAPTER.OCR_SESSION_SECONDS);
}

function issueOcrSession_() {
  const cache = CacheService.getScriptCache();
  const minuteKey = "ocr-bootstrap:" + Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMddHHmm");
  const count = Number(cache.get(minuteKey) || 0);
  if (count >= 30) throw new Error("OCR_BOOTSTRAP_RATE_LIMIT");
  cache.put(minuteKey, String(count + 1), 90);
  const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  const expiresAt = Date.now() + ADAPTER.OCR_SESSION_SECONDS * 1000;
  cache.put("ocr-session:" + hash_(token), "1", ADAPTER.OCR_SESSION_SECONDS);
  return { ok: true, token: token, expiresAt: new Date(expiresAt).toISOString(), scope: "label-ocr" };
}

function issueSession_() {
  const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  const expiresAt = Date.now() + ADAPTER.SESSION_DAYS * 86400000;
  const tokenHash = hash_(token);
  PropertiesService.getScriptProperties().setProperty("session:" + tokenHash, String(expiresAt));
  CacheService.getScriptCache().put("session-ok:" + tokenHash.slice(0, 32), "1", 600);
  return { ok: true, token: token, expiresAt: new Date(expiresAt).toISOString() };
}

function createDeviceLink_() {
  const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  const expiresAt = Date.now() + ADAPTER.DEVICE_LINK_MINUTES * 60000;
  PropertiesService.getScriptProperties().setProperty("device-link:" + hash_(token), String(expiresAt));
  return { ok: true, deviceToken: token, expiresAt: new Date(expiresAt).toISOString(), validHours: 24 };
}

function claimDeviceLink_(token) {
  const normalized = String(token || "").replace(/[^A-Za-z0-9]/g, "");
  if (!normalized) throw new Error("DEVICE_LINK_REQUIRED");
  const properties = PropertiesService.getScriptProperties();
  const key = "device-link:" + hash_(normalized);
  const expiresAt = Number(properties.getProperty(key) || 0);
  properties.deleteProperty(key);
  if (!expiresAt || expiresAt < Date.now()) throw new Error("DEVICE_LINK_EXPIRED");
  return issueSession_();
}

function normalizeCode_(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ""), Utilities.Charset.UTF_8)
    .map(function (b) { return (b + 256).toString(16).slice(-2); })
    .join("");
}

function safeEqual_(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
