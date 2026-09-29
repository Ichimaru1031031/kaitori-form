const ADAPTER = Object.freeze({
  PAIR_HASH: "8f2be2c80f42c3d4a52ea98d2013127cae1fa596a5c7ecab49ad57b07a459cd9",
  SESSION_DAYS: 45,
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
  const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  const expiresAt = Date.now() + ADAPTER.SESSION_DAYS * 86400000;
  PropertiesService.getScriptProperties().setProperty("session:" + hash_(token), String(expiresAt));
  return { ok: true, token: token, expiresAt: new Date(expiresAt).toISOString() };
}

function adapterRequest(token, operation, payload) {
  requireSession_(token);
  payload = payload || {};
  switch (String(operation || "")) {
    case "dashboard": return ProdDash.getDashboardData(true);
    case "case": return ProdDash.getCase(String(payload.id || ""));
    case "save-assessment": return ProdDash.saveAssessmentDraft(String(payload.id || ""), payload.amounts || [], payload.data || null);
    case "send-estimate": return ProdDash.saveAndSendEstimate(String(payload.id || ""), payload.amounts || [], String(payload.message || ""));
    case "send-combined": return ProdDash.saveAndSendCombined(String(payload.id || ""), payload.amounts || [], payload.data || {}, String(payload.message || ""));
    case "save-visit": return ProdDash.saveCase(String(payload.id || ""), payload.data || {});
    case "send-visit": return ProdDash.saveAndSendVisit(String(payload.id || ""), payload.data || {}, String(payload.message || ""));
    case "status": return ProdDash.setStatus(String(payload.id || ""), String(payload.status || ""));
    default: throw new Error("UNSUPPORTED_OPERATION:" + operation);
  }
}

function requireSession_(token) {
  const key = "session:" + hash_(String(token || ""));
  const expiresAt = Number(PropertiesService.getScriptProperties().getProperty(key) || 0);
  if (!expiresAt || expiresAt < Date.now()) {
    PropertiesService.getScriptProperties().deleteProperty(key);
    throw new Error("SESSION_EXPIRED");
  }
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
