import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const slip = await readFile(
  new URL("../next/slip.js", import.meta.url),
  "utf8",
);
const slips = await readFile(
  new URL("../next/slips.js", import.meta.url),
  "utf8",
);
const workflowRouter = await readFile(
  new URL("../next/workflow-router.js", import.meta.url),
  "utf8",
);
const core = await readFile(
  new URL("../next/core.js", import.meta.url),
  "utf8",
);
const schedule = await readFile(
  new URL("../next/schedule.js", import.meta.url),
  "utf8",
);
const appointments = await readFile(
  new URL("../next/appointments-ui.js", import.meta.url),
  "utf8",
);
const assessment = await readFile(
  new URL("../next/assessment.js", import.meta.url),
  "utf8",
);
const assessmentAdapter = await readFile(
  new URL("../next/assessment-adapter.js", import.meta.url),
  "utf8",
);
const inventory = await readFile(
  new URL("../next/inventory.js", import.meta.url),
  "utf8",
);
const sales = await readFile(
  new URL("../next/sales.js", import.meta.url),
  "utf8",
);
const html = await readFile(
  new URL("../next/index.html", import.meta.url),
  "utf8",
);
const greenGas = await readFile(
  new URL("../next-green-gas/Code.gs", import.meta.url),
  "utf8",
);
const greenApi = await readFile(
  new URL("../next/green-api.js", import.meta.url),
  "utf8",
);
const adapterGas = await readFile(
  new URL("../assessment-adapter-gas/Code.gs", import.meta.url),
  "utf8",
);
const adapterManifest = await readFile(
  new URL("../assessment-adapter-gas/appsscript.json", import.meta.url),
  "utf8",
);

test("appointment cards show a start and end time range", () => {
  assert.match(core, /x\.startTime\s*\+\s*"〜"\s*\+\s*x\.endTime/);
  assert.match(schedule, /e\.startTime\s*\+\s*"〜"\s*\+\s*e\.endTime/);
});

test("the day sheet retains the downward swipe close gesture", () => {
  assert.match(appointments, /if \(dy > 72\) close\(\)/);
  assert.match(appointments, /Math\.abs\(dx\) > Math\.abs\(raw\) \* 1\.15/);
});

test("absent staff use the red chip without a redundant rest prefix", () => {
  assert.match(schedule, /x\.state === "absent"\s*\? "absent"/);
  assert.match(appointments, /x\.state === "absent"\s*\? "absent"/);
  assert.doesNotMatch(schedule, /x\.state === "absent" \? "休 "/);
  assert.doesNotMatch(appointments, /x\.state === "absent" \? "休 "/);
});

test("slip confirmation resolves the Green result before advancing the appointment", () => {
  const apiResultAt = slip.indexOf("const apiResult=");
  const appointmentAt = slip.indexOf("if(draft.appointmentId)");
  assert.ok(apiResultAt >= 0, "Green API result must be captured");
  assert.ok(
    appointmentAt > apiResultAt,
    "appointment update must happen after the API result exists",
  );
  assert.doesNotMatch(slip.slice(0, apiResultAt), /apiResult\?\./);
});

test("customer confirmation blocks incomplete purchase slips", () => {
  assert.match(slip, /function draftValidationIssues\(\)/);
  assert.match(slip, /お客様のお名前/);
  assert.match(slip, /明細を1件以上/);
  assert.match(slip, /買取明細"\+\(index\+1\)/);
  assert.match(slip, /if\(!draft\|\|stopForDraftIssues\(\)\)return/);
  assert.match(slip, /if\(stopForDraftIssues\(\)\)return/);
  assert.doesNotMatch(slip, /\["model","型番"\]/);
});

test("slip input always has a recoverable save-and-back path", async () => {
  const slipCss = await readFile(new URL("../next/slip-extra.css", import.meta.url), "utf8");
  assert.match(html, /slip-extra\.css\?v=3/);
  assert.match(html, /id="closeSlipFooter"/);
  assert.match(html, /保存して戻る/);
  assert.match(slip, /async function closeSlipSafely\(\)/);
  assert.match(slip, /\["closeSlip","closeSlipFooter"\]/);
  assert.match(slip, /e\.key!=="Escape"/);
  assert.match(slip, /OCR_TIMEOUT/);
  assert.match(slip, /45000/);
  assert.match(slipCss, /#slip \.sheet \.body\{padding-bottom:calc\(88px/);
});

test("all generated inventory links are bound and the confirmed slip id is handed to Blue", () => {
  assert.match(
    slip,
    /K\.\$\$\("#confirmedPanel \.generatedInventoryLinks button"\)\.forEach/,
  );
  assert.match(slip, /dataset\.slip=serviceOrderId/);
  assert.match(slip, /K\.openBlue\("slips",\{slip\}\)/);
});

test("Green finalization keeps immutable PDF history and does not call LINE", () => {
  assert.match(greenGas, /appendObject_\("NEXT_FINALIZED_SLIPS"/);
  assert.match(greenGas, /appendObject_\("DOCUMENTS"/);
  assert.match(greenGas, /version:version/);
  assert.doesNotMatch(
    greenGas,
    /UrlFetchApp\.fetch\([^\n]*(?:line\.me|api\.line)/i,
  );
});

test("NEXT slip distinguishes issued PDF from unsent customer delivery", () => {
  assert.match(slip, /class="documentDeliveryStatus"/);
  assert.match(slip, />未送信</);
  assert.match(slip, /apiResult\?\.pdfFileUrl/);
  assert.match(slip, /顧客へ送信（現行Blue）/);
  assert.match(html, /id="bluePdfSend" type="button" disabled/);
});

test("NEXT slip carries postal address lookup through confirmation and Green customer storage", () => {
  assert.match(html, /id="postalCode"/);
  assert.match(html, /id="lookupPostalCode"/);
  assert.match(slip, /zipcloud\.ibsnet\.co\.jp\/api\/search/);
  assert.match(slip, /postalCode:K\.\$\("#postalCode"\)\.value/);
  assert.match(slip, /〒"\+draft\.customer\.postalCode/);
  assert.match(greenGas, /postalCode:customer\.postalCode\|\|""/);
});

test("NEXT product entry uses protected cloud OCR with on-device fallback and manual confirmation", () => {
  assert.match(html, /slip\.js\?v=10/);
  assert.match(html, /assessment-adapter\.js\?v=9/);
  assert.match(slip, /capture="environment"/);
  assert.match(slip, /カメラで品目・メーカー・年式・型番を読み取る/);
  assert.match(slip, /tesseract\.js@5\.1\.1/);
  assert.match(slip, /worker\.recognize\(canvas\)/);
  assert.match(slip, /createWorker\("eng\+jpn"/);
  assert.match(slip, /tessedit_char_whitelist/);
  assert.match(slip, /editDistance\(code,token\)/);
  assert.match(slip, /recognizeOcrPass\(worker,canvas,11\)/);
  assert.match(slip, /recognizeOcrPass\(worker,canvas,6,true\)/);
  assert.match(slip, /function labelCategory\(/);
  assert.match(slip, /function labelMaker\(/);
  assert.match(slip, /function labelYear\(/);
  assert.match(slip, /4項目を自動反映/);
  assert.match(slip, /誤登録防止のため自動確定していません/);
  assert.match(slip, /const camera=key==="purchase"/);
  assert.match(slip, /ラベルと照合・読取内容を確定/);
  assert.match(slip, /function fourMissing\(\)/);
  assert.match(slip, /if\(ocrPending\)/);
  assert.match(slip, /買取明細の必須項目です/);
  assert.match(slip, /KRAssessmentAdapter\.run\("label-ocr"/);
  assert.match(slip, /高精度AIでラベルを読み取り中/);
  assert.match(slip, /画像は保存しません/);
  assert.match(slip, /label-ocr-status/);
  assert.match(slip, /高精度AI 接続済み/);
  assert.match(slip, /labelAwareCandidates/);
  assert.match(slip, /recognizeModelOnDevice/);
  assert.match(assessmentAdapter, /const OCR_TOKEN_KEY = "kr-next-ocr-session"/);
  assert.match(assessmentAdapter, /request\("ocr-bootstrap"/);
  assert.match(assessmentAdapter, /operation === "label-ocr" \? 65000/);
  assert.doesNotMatch(slip, /hasSession\?\.\(\).*label-ocr/s);
  assert.match(adapterGas, /case "label-ocr"/);
  assert.match(adapterGas, /operation === "ocr-bootstrap"/);
  assert.match(adapterGas, /requireOcrSession_\(token\)/);
  assert.match(adapterGas, /OCR_DEVICE_RATE_LIMIT/);
  assert.match(adapterGas, /GOOGLE_CLOUD_VISION_API_KEY/);
  assert.match(adapterGas, /vision\.googleapis\.com\/v1\/images:annotate/);
  assert.match(adapterGas, /TEXT_DETECTION/);
  assert.match(adapterGas, /languageHints: \["ja", "en"\]/);
  assert.doesNotMatch(assessmentAdapter, /GOOGLE_CLOUD_VISION_API_KEY|vision\.googleapis\.com/);
  assert.doesNotMatch(slip, /FormData|upload.*modelPhoto/i);
});

test("model suggestions prioritize local history and stay in a bounded scroller", async () => {
  const slipCss = await readFile(new URL("../next/slip-extra.css", import.meta.url), "utf8");
  assert.match(slip, /kr-next-model-history-v1/);
  assert.match(slip, /最近入力/);
  assert.match(slip, /rememberModel\(item\.category,item\.maker,item\.model,item\.year\)/);
  assert.match(slip, /staticModelMaster\.concat\(K\.snap\.modelMaster\|\|\[\]\)/);
  assert.match(slip, /modelCode\.includes\(queryCode\)/);
  assert.match(slip, /if\(!rows\.length&&q\)rows=all\.filter/);
  assert.match(slipCss, /modelSuggestions\.scrollSuggestions\{max-height:/);
  assert.match(slipCss, /ocrCandidates\{display:none;max-height:/);
});

test("protected Green bridge is used without exposing an anonymous write URL", () => {
  assert.match(greenApi, /hasProtectedAdapter\(\)/);
  assert.match(greenApi, /green-write/);
  assert.match(greenApi, /runImmediate/);
  assert.match(adapterGas, /case "green-write"/);
  assert.match(adapterGas, /GreenNext\.greenBridgeRequest\("write", payload\)/);
  assert.match(adapterManifest, /"userSymbol": "GreenNext"/);
  assert.match(adapterManifest, /"version": "4"/);
});

test("issued slip PDF email uses stored customer data and explicit resend", () => {
  assert.match(greenGas, /case "send-slip-pdf-email"/);
  assert.match(greenGas, /CUSTOMER_CONFIRMATION_REQUIRED/);
  assert.match(greenGas, /CUSTOMER_EMAIL_NOT_REGISTERED/);
  assert.match(greenGas, /PDF_ALREADY_SENT_USE_RESEND/);
  assert.match(greenGas, /MailApp\.sendEmail/);
  assert.match(greenGas, /sentMethod:"email",status:"sent"/);
  assert.doesNotMatch(
    greenGas,
    /UrlFetchApp\.fetch\([^\n]*(?:line\.me|api\.line)/i,
  );
  assert.match(slip, /KRAPI\.runImmediate\("send-slip-pdf-email"/);
  assert.match(slip, /送信済み（メール）/);
  assert.match(slip, /dataset\.resend="1"/);
});

test("slip list reloads live Green delivery status through the protected adapter", () => {
  assert.match(workflowRouter, /KRAPI\.hasProtectedAdapter\?\.\(\)/);
  assert.match(slips, /function delivery\(d\)/);
  assert.match(slips, /メール送信済み/);
  assert.match(slips, /顧客へ未送信/);
  assert.match(slips, /送信失敗/);
  assert.match(slips, /Number\(d\.version \|\| 0\) > Number\(old\.version \|\| 0\)/);
});

test("native assessment, inventory, and sales controls bind without startup errors", () => {
  assert.match(assessment, /class="schedule">訪問予定/);
  assert.match(html, /id="detailEcPreview"/);
  assert.doesNotMatch(
    inventory,
    /K\.\$\("#(?:testResultButtons|testEmployeeList) button"\)\.forEach/,
  );
  assert.doesNotMatch(
    sales,
    /K\.\$\("#(?:salesFilters|salesFulfillment) button"\)\.forEach/,
  );
});

test("NEXT assessment keeps the read-only Blue customer-case bridge", () => {
  assert.match(core, /request: "customers"/);
  assert.match(core, /d\.type === "kr-hub-customer-cases"/);
  assert.match(core, /K\.liveCases = Array\.isArray\(d\.payload\)/);
  assert.match(assessment, /K\.casesNow\(\)/);
});

test("NEXT assessment uses the token-protected native workbench", () => {
  assert.match(html, /id="assessmentOpsModal"/);
  assert.match(html, /id="assessmentOpsBody"/);
  assert.match(html, /assessment-adapter\.js\?v=9/);
  assert.match(assessmentAdapter, /form\.method = "post"/);
  assert.match(assessmentAdapter, /data\.channel !== item\.channel/);
  assert.match(assessmentAdapter, /kr-next-assessment-session/);
  assert.match(assessment, /KRAssessmentAdapter\.getCase/);
  assert.match(assessment, /send-estimate/);
  assert.match(assessment, /send-combined/);
  assert.match(assessment, /send-visit/);
  assert.doesNotMatch(assessment, /window\.location\.assign/);
  assert.doesNotMatch(assessment, /assessmentOpsFrame/);
  assert.match(assessment, /K\.requestBlueCases\?\.\(\)/);
  assert.doesNotMatch(assessment, /saveAndSend(?:Estimate|Visit|Combined)/);
});

test("NEXT assessment removes code entry and uses a one-time device link", () => {
  assert.doesNotMatch(assessment, /id="assessmentPairCode"/);
  assert.match(assessment, /接続コードの入力は廃止しました/);
  assert.match(html, /id="issueDeviceLink"/);
  assert.match(assessmentAdapter, /claim-device-link/);
  assert.match(assessmentAdapter, /createDeviceLink/);
  assert.match(assessmentAdapter, /url\.hash = "connect="/);
  assert.match(adapterGas, /case "create-device-link"/);
  assert.match(adapterGas, /function claimDeviceLink_/);
  assert.match(adapterGas, /properties\.deleteProperty\(key\)/);
  assert.match(adapterGas, /SESSION_DAYS: 365/);
  assert.match(adapterGas, /properties\.setProperty\(key, String\(Date\.now\(\) \+ ADAPTER\.SESSION_DAYS/);
});

test("assessment action result survives the post-send detail refresh", () => {
  const noticeAt = assessment.indexOf("actionNotice = {");
  const reloadAt = assessment.indexOf("await loadAssessmentCase", noticeAt);
  assert.ok(noticeAt >= 0, "the action result must be stored");
  assert.ok(
    reloadAt > noticeAt,
    "the action result must be stored before refreshing the case detail",
  );
  assert.match(assessment, /let actions = resultHtml \+ '<div class="nativeLocked">/);
});

test("assessment list refreshes from the protected production dashboard", () => {
  assert.match(assessment, /KRAssessmentAdapter\.run\("dashboard", \{\}\)/);
  assert.match(assessment, /K\.liveCases = rows\.map/);
  assert.match(assessment, /existing\.find\(\(x\) => caseIdOf\(x\) === caseIdOf\(row\)\)/);
  assert.match(assessment, /mergeNativeDetail\(detail\)/);
  assert.match(assessment, /setTimeout\(refreshBlueList, 1200\)/);
});
