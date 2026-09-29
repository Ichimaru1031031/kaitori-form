const ADAPTER = Object.freeze({
  PAIR_HASH: "8f2be2c80f42c3d4a52ea98d2013127cae1fa596a5c7ecab49ad57b07a459cd9",
  SESSION_DAYS: 365,
  OCR_SESSION_SECONDS: 21600,
  DEVICE_LINK_MINUTES: 10,
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
  if (operation === "label-ocr-status" || operation === "label-ocr") {
    requireOcrSession_(token);
  } else {
    requireSession_(token);
  }
  switch (String(operation || "")) {
    case "dashboard": return ProdDash.getDashboardData(true);
    case "case": return ProdDash.getCase(String(payload.id || ""));
    case "save-assessment": return ProdDash.saveAssessmentDraft(String(payload.id || ""), payload.amounts || [], payload.data || null);
    case "send-estimate": return ProdDash.saveAndSendEstimate(String(payload.id || ""), payload.amounts || [], String(payload.message || ""));
    case "send-combined": return ProdDash.saveAndSendCombined(String(payload.id || ""), payload.amounts || [], payload.data || {}, String(payload.message || ""));
    case "save-visit": return ProdDash.saveCase(String(payload.id || ""), payload.data || {});
    case "send-visit": return ProdDash.saveAndSendVisit(String(payload.id || ""), payload.data || {}, String(payload.message || ""));
    case "status": return ProdDash.setStatus(String(payload.id || ""), String(payload.status || ""));
    case "create-device-link": return createDeviceLink_();
    case "label-ocr-status": return labelOcrStatus_();
    case "label-ocr": return labelOcr_(payload, token);
    case "green-ping": return GreenNext.greenBridgeRequest("ping", payload);
    case "green-snapshot": return GreenNext.greenBridgeRequest("snapshot", payload);
    case "green-write": return GreenNext.greenBridgeRequest("write", payload);
    default: throw new Error("UNSUPPORTED_OPERATION:" + operation);
  }
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
  const key = "session:" + hash_(String(token || ""));
  const properties = PropertiesService.getScriptProperties();
  const expiresAt = Number(properties.getProperty(key) || 0);
  if (!expiresAt || expiresAt < Date.now()) {
    properties.deleteProperty(key);
    throw new Error("SESSION_EXPIRED");
  }
  properties.setProperty(key, String(Date.now() + ADAPTER.SESSION_DAYS * 86400000));
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
  PropertiesService.getScriptProperties().setProperty("session:" + hash_(token), String(expiresAt));
  return { ok: true, token: token, expiresAt: new Date(expiresAt).toISOString() };
}

function createDeviceLink_() {
  const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  const expiresAt = Date.now() + ADAPTER.DEVICE_LINK_MINUTES * 60000;
  PropertiesService.getScriptProperties().setProperty("device-link:" + hash_(token), String(expiresAt));
  return { ok: true, deviceToken: token, expiresAt: new Date(expiresAt).toISOString() };
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
