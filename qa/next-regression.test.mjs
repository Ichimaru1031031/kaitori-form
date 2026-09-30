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
const confirmCss = await readFile(
  new URL("../next/confirm-extra.css", import.meta.url),
  "utf8",
);
const headerActions = await readFile(
  new URL("../next/header-actions.js", import.meta.url),
  "utf8",
);
const headerCss = await readFile(
  new URL("../next/header-actions.css", import.meta.url),
  "utf8",
);
const inventoryCompactCss = await readFile(
  new URL("../next/inventory-compact.css", import.meta.url),
  "utf8",
);
const slipCompactCss = await readFile(
  new URL("../next/slip-compact.css", import.meta.url),
  "utf8",
);
const gestureUx = await readFile(
  new URL("../next/gesture-ux.js", import.meta.url),
  "utf8",
);
const priceCard = await readFile(
  new URL("../next/price-card.js", import.meta.url),
  "utf8",
);
const priceCardCss = await readFile(
  new URL("../next/price-card.css", import.meta.url),
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

test("appointment cards suppress a duplicated address from the note", () => {
  assert.match(core, /K\.appointmentDisplayNote = \(note, address\)/);
  assert.match(core, /normalize\(part\) !== addressKey/);
  assert.match(core, /\[x\.address, displayNote\]/);
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
  assert.doesNotMatch(slip, /\["year","年式"\]/);
});

test("customer confirmation has an explicit return path and two required consents", () => {
  assert.match(html, /id="previewBack"/);
  assert.match(html, /id="confirmCustomerDetails"/);
  assert.match(html, /id="confirmPurchaseTerms"/);
  assert.match(html, /お客様情報に誤りがないことを確認しました/);
  assert.match(html, /買取明細と買取金額を確認し、内容に同意しました/);
  assert.match(slip, /function closePreviewSafely\(\)/);
  assert.match(slip, /CUSTOMER_CONFIRMATIONS_REQUIRED|confirmCustomerDetails/);
  assert.match(slip, /payload\.confirmations=\{customerDetails:true,purchaseTerms:true\}/);
  assert.match(greenGas, /CUSTOMER_CONFIRMATIONS_REQUIRED/);
});

test("slip customer cards open NEXT slips without requiring the small action button", () => {
  assert.match(slips, /card\.setAttribute\("role", "button"\)/);
  assert.match(slips, /if \(event\.target\.closest\("button,a"\)\) return/);
  assert.match(slips, /openNextSlip\(\)/);
});

test("slip input always has a recoverable save-and-back path", async () => {
  const slipCss = await readFile(new URL("../next/slip-extra.css", import.meta.url), "utf8");
  assert.match(html, /slip-extra\.css\?v=7/);
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
  assert.match(slip, /setDeliveryLabel\(blueSend,canEmail\?"メール送信"/);
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
  assert.match(html, /slip\.js\?v=16/);
  assert.match(html, /assessment-adapter\.js\?v=12/);
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
  assert.doesNotMatch(slip, /if\(!KRAssessmentAdapter\?\.hasSession.*label-ocr/);
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

test("sale entry can import a live inventory item from its QR code", () => {
  assert.match(html, /id="inventoryQrPhoto"/);
  assert.match(slip, /在庫QRを読み取って販売明細へ追加/);
  assert.match(slip, /BarcodeDetector/);
  assert.match(slip, /jsqr@1\.4\.0/);
  assert.match(slip, /url\.searchParams\.get\("inventory"\)/);
  assert.match(slip, /await KRAPI\.getSnapshot\(\)/);
  assert.match(slip, /draft\.items\.sale\.push/);
  assert.match(slip, /sourceInventoryId:item\.inventoryId/);
});

test("assessment product data seeds purchase entry and OCR conflicts require a source choice", async () => {
  const slipCss = await readFile(new URL("../next/slip-extra.css", import.meta.url), "utf8");
  assert.match(assessment, /KRAssessmentAdapter\.getCase\(x\.id\)/);
  assert.match(assessment, /assessmentProduct: source\.product \|\| ""/);
  assert.match(assessment, /assessmentItems: Array\.isArray\(source\.items\) \? source\.items : \[\]/);
  assert.match(slip, /function assessmentSeedRows\(seed\)/);
  assert.match(slip, /const intakeRows=assessmentSeedRows\(seed\)/);
  assert.match(slip, /class="sourceCompare"/);
  assert.match(slip, /査定フォームから反映済み/);
  assert.match(slip, /査定フォーム：/);
  assert.match(slip, /ラベル：/);
  assert.match(slip, /if\(!current\)\{field\.input\.value=incoming;supplemented\+\+/);
  assert.match(slip, /if\(same\(current,incoming\)\)continue/);
  assert.match(slip, /merged\.conflicts\?"査定フォームとラベルに相違があります/);
  assert.match(slipCss, /\.sourceConflictChoices button\.active/);
});

test("intake form products automatically populate linked slip purchase lines", () => {
  assert.match(slip, /async function enrichSlipSeed\(seed\)/);
  assert.match(slip, /KRAssessmentAdapter\.getCase\(detailId\)/);
  assert.match(slip, /function mergeIntakeProducts\(target,rows\)/);
  assert.match(slip, /sourceForm:"案内フォーム"/);
  assert.match(slip, /formImportedKeys/);
  assert.match(slip, /案内フォームの商品/);
  assert.match(html, /id="formImportStatus"/);
});

test("imported purchase lines remain editable for on-site product details and price", async () => {
  const slipCss = await readFile(new URL("../next/slip-extra.css", import.meta.url), "utf8");
  assert.match(slip, /class="itemEdit"/);
  assert.match(slip, /function editExistingItem\(host,key,index\)/);
  assert.match(slip, /商品情報と買取価格を編集/);
  assert.match(slip, /容量・状態・使用感/);
  assert.match(slip, /Object\.assign\(item,/);
  assert.match(slip, /sourceFormEditedAt/);
  assert.match(slip, /rememberModel\(item\.category,item\.maker,item\.model,item\.year\)/);
  assert.match(slip, /案内フォーム反映・現場編集済み/);
  assert.match(slipCss, /\.editExistingActions/);
});

test("intake products are collapsed and toggle their product details on tap", async () => {
  const slipCss = await readFile(new URL("../next/slip-extra.css", import.meta.url), "utf8");
  assert.match(slip, /<details class="importedProduct">/);
  assert.match(slip, /案内フォームから反映された商品情報/);
  assert.match(slip, /タップで閉じる/);
  assert.match(slip, /タップで表示/);
  assert.match(slipCss, /\.importedProduct>summary/);
});

test("protected Green bridge is used without exposing an anonymous write URL", () => {
  assert.match(greenApi, /hasProtectedAdapter\(\)/);
  assert.match(greenApi, /green-write/);
  assert.match(greenApi, /runImmediate/);
  assert.match(adapterGas, /case "green-write"/);
  assert.match(adapterGas, /GreenNext\.greenBridgeRequest\("write", payload\)/);
  assert.match(adapterManifest, /"userSymbol": "GreenNext"/);
  assert.match(adapterManifest, /"version": "7"/);
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

test("one versioned customer PDF uses separate readable statement pages", () => {
  assert.match(greenGas, /documentFor\("販売・工事",\["sale","work","delivery","estimate"\]/);
  assert.match(greenGas, /documentFor\("リサイクル",\["recycle"\]/);
  assert.match(greenGas, /documentFor\("買取",\["purchase"\]/);
  assert.match(greenGas, /class='documentPage/);
  assert.match(greenGas, /page-break-after:always/);
  assert.match(greenGas, /customer b\{display:block;font-size:22px/);
  assert.match(greenGas, /grandTotal b\{font-size:27px/);
  assert.match(greenGas, /お客様送付用・お客様控え/);
  assert.match(greenGas, /お客様用 明細書/);
  assert.match(greenGas, /customerTotal=Math\.abs\(signedTotal\)/);
  assert.match(greenGas, /お客様受取額/);
  assert.match(greenGas, /PDF_FOLDER_ID/);
});

test("issued PDF can be shared by email, SMS, or LINE without changing the LINE webhook", () => {
  assert.match(html, /id="smsPdfShare"/);
  assert.match(html, /id="linePdfShare"/);
  assert.match(slip, /get-slip-pdf-share/);
  assert.match(slip, /navigator\.canShare/);
  assert.match(slip, /async function getIssuedPdfForShare/);
  assert.match(slip, /for\(let attempt=0;attempt<5;attempt\+\+\)/);
  assert.match(slip, /KRAPI\.syncPending\?\.\(\)/);
  assert.match(slip, /PDFの発行完了を待っています/);
  assert.match(slip, /navigator\.share/);
  assert.match(slip, /files:\[file\]/);
  assert.match(greenGas, /case "get-slip-pdf-share"/);
  assert.match(greenGas, /pdfBase64:Utilities\.base64Encode/);
  assert.match(greenGas, /cacheable = operation !== "get-slip-pdf-share"/);
  assert.doesNotMatch(greenGas, /api\.line\.me|hooks\.slack|Twilio/i);
});

test("customer confirmation is a readable stepped layout with colored share actions", () => {
  assert.match(slip, /class="reviewIntro"/);
  assert.match(slip, /class="reviewCustomer"/);
  assert.match(slip, /class="reviewDetails"/);
  assert.match(slip, /class="reviewGrandTotal"/);
  assert.match(confirmCss, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(confirmCss, /#bluePdfSend\{border-color:/);
  assert.match(confirmCss, /#smsPdfShare\{border-color:/);
  assert.match(confirmCss, /#linePdfShare\{border-color:/);
  assert.match(html, /class="deliveryIcon lineIcon"/);
  assert.match(slip, /customerReceives=signedTotal<0/);
  assert.match(slip, /Math\.abs\(signedTotal\)\.toLocaleString\(\)/);
  assert.match(slip, /お客様受取額/);
});

test("PDF finalization allows the protected Green write to finish", () => {
  assert.match(assessmentAdapter, /operation === "green-write" \? 120000 : 30000/);
});

test("saved appointments show their content and a visible completion notice", () => {
  assert.match(schedule, /wasEditing = Boolean\(editingAppointment\)/);
  assert.match(schedule, /予定を追加しました/);
  assert.match(schedule, /x\.startTime \+ "〜" \+ x\.endTime/);
  assert.match(schedule, /K\.openAppointmentDetail && K\.openAppointmentDetail\(x\)/);
  assert.match(headerCss, /\.appointmentSavedNotice/);
});

test("inventory photos render as a horizontal swipe gallery", () => {
  assert.match(inventory, /function inventoryPhotoSrc\(photo\)/);
  assert.match(inventory, /function staticPhotosFor\(item\)/);
  assert.match(inventory, /K\.snap\.catalogItems/);
  assert.match(inventory, /class="inventoryThumb"/);
  assert.match(workflowRouter, /\.\/data\/catalog\.json/);
  assert.match(inventory, /drive\.google\.com\/thumbnail\?id=/);
  assert.match(inventory, /classList\.toggle\("swipeGallery", photos\.length > 0\)/);
  assert.match(headerCss, /scroll-snap-type:x mandatory/);
  assert.match(headerCss, /\.swipeGallery \.detailPhoto/);
  assert.match(greenGas, /file\.setSharing\(DriveApp\.Access\.ANYONE_WITH_LINK/);
});

test("inventory uses compact tappable rows and separates completed sales", () => {
  assert.match(inventory, /compactInventoryCard/);
  assert.match(inventory, /c\.onclick = \(\) => openDetail\(item\)/);
  assert.match(inventory, /mode === "complete"/);
  assert.match(inventory, /\["complete", "販売終了"\]/);
  assert.match(inventoryCompactCss, /grid-template-columns: 72px minmax\(0, 1fr\) auto/);
  assert.match(inventoryCompactCss, /compactInventoryCard\.inventoryComplete/);
  assert.match(inventoryCompactCss, /\.processStageList[\s\S]*overflow-x: auto/);
});

test("assessment stays inside NEXT without the GAS or legacy menu chrome", () => {
  assert.match(workflowRouter, /if \(tab === "assessment"\)[\s\S]*K\.screen\("assessmentView"\)/);
  assert.match(workflowRouter, /K\.requestBlueCases\?\.\(\)/);
  assert.doesNotMatch(workflowRouter, /location\.href = K\.blue\.assessment/);
  assert.match(assessment, /nativeDetailHtml\(caseInfo, true\)/);
  assert.match(assessment, /NEXT表示モード/);
  assert.match(html, /id="assessmentView"/);
});

test("assessment restores form product text and only normalizes duplicated address display", () => {
  assert.match(assessment, /x\.productText/);
  assert.match(assessment, /x\.productsText/);
  assert.match(assessment, /function displayAddress\(value\)/);
  assert.match(assessment, /\\d\+\(\?:-\\d\+\)\{1,3\}/);
  assert.match(assessment, /text\.slice\(-length \* 2, -length\) === tail/);
  assert.match(assessment, /address: displayAddress\(x\.address \|\| c\.address \|\| ""\)/);
});

test("inventory detail supports downward close and horizontal photo browsing", () => {
  assert.match(html, /id="inventoryDetailModal"[\s\S]*data-swipe-sheet/);
  assert.match(gestureUx, /distance > 86/);
  assert.match(gestureUx, /Math\.abs\(dx\) > Math\.abs\(raw\) \* 1\.15/);
  assert.match(gestureUx, /sheet\.scrollTop > 2/);
  assert.match(inventory, /K\.enableSwipeSheet/);
  assert.match(assessment, /K\.enableSwipeSheet/);
  assert.match(inventory, /classList\.toggle\("swipeGallery", photos\.length > 0\)/);
});

test("inventory creates three editable 100 by 70 mm price cards", () => {
  assert.match(html, /id="detailPriceCard"/);
  assert.match(html, /data-template="premium"/);
  assert.match(html, /data-template="sale"/);
  assert.match(html, /data-template="editorial"/);
  assert.match(inventory, /K\.openPriceCard/);
  assert.match(priceCard, /source\.maker/);
  assert.match(priceCard, /suggestedModel\(source\.model/);
  assert.match(priceCard, /displayYear\(value\("priceCardYear"\)\)/);
  assert.match(priceCard, /const suggestedModel/);
  assert.match(priceCard, /descriptionLine\(description, "保証"\)/);
  assert.match(priceCard, /priceCardModel/);
  assert.match(priceCard, /priceCardMaker/);
  assert.match(priceCard, /window\.print\(\)/);
  assert.match(priceCardCss, /size:100mm 70mm/);
  assert.match(priceCardCss, /print-color-adjust:exact/);
  assert.match(priceCardCss, /\.priceCard\{/);
  assert.match(priceCardCss, /\.priceCard\.sale/);
  assert.match(priceCardCss, /\.priceCard\.editorial/);
});

test("secondary NEXT sheets share the safe downward-swipe dismissal", () => {
  assert.match(html, /data-swipe-dismiss="globalSearchModal"/);
  assert.match(html, /data-swipe-dismiss="drawer"/);
  assert.match(html, /data-swipe-dismiss="phoneAssessmentModal"/);
  assert.match(html, /data-swipe-dismiss="testModal"/);
  assert.match(html, /data-swipe-dismiss="processModal"/);
  assert.match(gestureUx, /\[data-swipe-dismiss\]/);
  assert.match(gestureUx, /target\.closest\(interactive\)/);
});

test("header exposes recycle sales slip QR and recoverable settings actions", () => {
  assert.match(html, /data-tab="recycle" aria-label="リサイクル"/);
  assert.match(html, /data-tab="store" aria-label="販売"/);
  assert.match(html, /id="headerNewSlip"/);
  assert.match(html, /id="headerQrScan"/);
  assert.match(html, /id="settingsQuick"/);
  assert.match(html, /class="drawerBack" data-close="drawer"/);
  assert.doesNotMatch(html, /id="more"/);
  assert.match(headerActions, /BarcodeDetector/);
  assert.match(headerActions, /jsqr@1\.4\.0/);
  assert.match(headerActions, /K\.openInventoryDetail\?\.\(item\)/);
  assert.match(headerCss, /\.topActions \.topIcon svg/);
  assert.match(headerCss, /width:40px;height:40px/);
});

test("slip list reloads live Green delivery status through the protected adapter", () => {
  assert.match(workflowRouter, /KRAPI\.hasProtectedAdapter\?\.\(\)/);
  assert.match(slips, /function delivery\(d\)/);
  assert.match(slips, /メール送信済み/);
  assert.match(slips, /顧客へ未送信/);
  assert.match(slips, /送信失敗/);
  assert.match(slips, /Number\(d\.version \|\| 0\) > Number\(old\.version \|\| 0\)/);
});

test("slip and assessment lists share the compact tappable NEXT layout", () => {
  assert.match(slips, /compactSlipRow/);
  assert.match(slips, /class="slipMore"/);
  assert.match(slips, /card\.classList\.toggle\("actionsOpen"\)/);
  assert.match(slips, /openNextSlip\(\)/);
  assert.match(slips, />現行編集</);
  assert.match(slips, />PDF</);
  assert.match(slips, />関連在庫</);

  assert.match(assessment, /compactAssessmentRow/);
  assert.match(assessment, /class="assessmentMore"/);
  assert.match(assessment, /c\.classList\.toggle\("actionsOpen"\)/);
  assert.match(assessment, /K\.openAssessmentOps\(x\)/);
  assert.match(assessment, /☎ TEL/);
  assert.match(assessment, />訪問予定</);
  assert.match(assessment, />NEXT伝票</);

  assert.match(slipCompactCss, /\.compactSlipRow/);
  assert.match(slipCompactCss, /\.compactAssessmentRow/);
  assert.match(slipCompactCss, /grid-template-columns:58px minmax\(0,1fr\) auto/);
  assert.match(slipCompactCss, /\.compactActions\{display:none/);
  assert.match(slipCompactCss, /actionsOpen .*compactActions\{display:grid/);
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
  assert.match(html, /assessment-adapter\.js\?v=12/);
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
  assert.doesNotMatch(assessment, /接続コードを入力/);
  assert.match(html, /id="issueDeviceLink"/);
  assert.match(assessmentAdapter, /claim-device-link/);
  assert.match(assessmentAdapter, /createDeviceLink/);
  assert.match(assessmentAdapter, /url\.hash = "connect="/);
  assert.match(assessmentAdapter, /async function claimLink\(value\)/);
  assert.match(assessment, /id="assessmentConnectClipboard"/);
  assert.match(assessment, /id="assessmentConnectLinkInput"/);
  assert.doesNotMatch(assessment, /navigator\.clipboard\.readText/);
  assert.match(adapterGas, /case "create-device-link"/);
  assert.match(adapterGas, /function claimDeviceLink_/);
  assert.match(adapterGas, /properties\.deleteProperty\(key\)/);
  assert.match(adapterGas, /SESSION_DAYS: 365/);
  assert.match(adapterGas, /DEVICE_LINK_MINUTES: 1440/);
  assert.match(assessment, /24時間有効/);
  assert.match(assessment, /継続して自動接続/);
  assert.match(greenApi, /id = "deviceConnectLink"/);
  assert.match(greenApi, /接続する端末でこのリンクを開く/);
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
