import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const slip = await readFile(
  new URL("../next/slip.js", import.meta.url),
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

test("NEXT assessment opens the existing Blue dashboard directly for authoritative writes", () => {
  assert.match(assessment, /const BLUE_DASHBOARD = K\.C\.assessment/);
  assert.match(assessment, /u\.searchParams\.set\("case", activeBlueCase\)/);
  assert.match(assessment, /window\.location\.assign\(u\.toString\(\)\)/);
  assert.doesNotMatch(assessment, /assessmentOpsModal/);
  assert.doesNotMatch(assessment, /assessmentOpsFrame/);
  assert.match(assessment, /K\.requestBlueCases\?\.\(\)/);
  assert.doesNotMatch(assessment, /saveAndSend(?:Estimate|Visit|Combined)/);
});
