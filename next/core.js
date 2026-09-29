(() => {
  const K = (window.KRN = {
    C: {
      main: "https://script.google.com/macros/s/AKfycbxRmX2wtJ8r2VkZvVlBCoB91t8vMrd-ZxkQ_6k1IPoIdCCKsIlgAmZnKq0xV1Dl5kItkQ/exec",
      schedule:
        "https://script.google.com/macros/s/AKfycbyg-1Uvk5d8y-aNkMr206fQcAt3vpPPR5BgZ-QyjLXKNBEC_riP1e2TSKfT96HtxxWLMA/exec",
      assessment:
        "https://script.google.com/macros/s/AKfycby5yXQfe2Ki8V3TXqNTj1by9GtRZEo4a-yfdvsQ0e2k-EaUwnoeBpnprpRX1LjkMSUI/exec",
      recycle: "https://ichimaru1031031.github.io/kaitori-form/recycle/",
    },
    snap: {
      cases: [],
      appointments: [],
      inventory: [],
      employees: [],
      modelMaster: [],
    },
    liveCases: [],
  });
  K.$ = (s) => document.querySelector(s);
  K.$$ = (s) => [...document.querySelectorAll(s)];
  K.esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  K.digits = (s) => String(s ?? "").replace(/\D/g, "");
  K.norm = (s) =>
    String(s ?? "")
      .toUpperCase()
      .replace(/[‐‑‒–—―ー－\s]/g, "-")
      .replace(/-+/g, "-");
  K.keyDate = (d) =>
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0");
  K.jpDay = (d) => ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  K.parseDate = (s) => {
    const m = String(s ?? "").match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };
  K.overlay = (id) => K.$("#" + id);
  K.blue = {
    schedule: K.C.schedule,
    assessment: K.C.assessment,
    slips: K.C.main + "?page=slips",
    inventory: K.C.main + "?page=inventory",
    recycle: K.C.recycle,
    store: K.C.main + "?page=store",
    settings: K.C.main + "?page=settings",
  };
  K.titles = {
    assessment: "ネット査定",
    slips: "伝票",
    recycle: "リサイクル",
    store: "販売",
    settings: "設定",
    schedule: "予定",
    inventory: "在庫",
  };
  K.screen = (id) => {
    K.$$(".screen").forEach((x) => x.classList.remove("active"));
    K.$("#" + id).classList.add("active");
  };
  K.setNav = (tab) =>
    K.$$(".nav button").forEach((b) =>
      b.classList.toggle("active", b.dataset.tab === tab),
    );
  K.openBlue = (tab, params) => {
    K.screen("module");
    K.setNav("");
    K.$("#moduleTitle").textContent = K.titles[tab] || tab;
    let u = new URL(K.blue[tab]);
    u.searchParams.set("embed", "1");
    u.searchParams.set("_next", Date.now());
    Object.entries(params || {}).forEach(
      ([k, v]) => v && u.searchParams.set(k, v),
    );
    K.$("#frame").src = u.toString();
  };
  K.openTab = (tab) => {
    if (tab === "home") {
      K.screen("home");
      K.setNav("home");
      return;
    }
    if (tab === "schedule") {
      K.screen("scheduleView");
      K.setNav("schedule");
      K.renderCalendar && K.renderCalendar();
      return;
    }
    if (tab === "inventory") {
      K.screen("inventoryView");
      K.setNav("inventory");
      K.renderInventory && K.renderInventory();
      return;
    }
    K.openBlue(tab);
  };
  K.casesNow = () => (K.liveCases.length ? K.liveCases : K.snap.cases);
  K.needsReply = (x) =>
    /返信|連絡|回答|査定|LINE連携待ち/.test(
      (x.nextAction || x.next || "") + " " + (x.status || ""),
    ) && !/完了|キャンセル/.test(x.status || "");
  K.counts = () => {
    const c = K.casesNow();
    K.$("#reply").textContent = c.filter(K.needsReply).length;
    K.$("#new").textContent = c.filter((x) =>
      /新規/.test(x.status || ""),
    ).length;
    K.$("#unscheduled").textContent = c.filter(
      (x) => !(x.date || x.confirmedDate) && !/キャンセル/.test(x.status || ""),
    ).length;
  };
  K.localEventState = () => {
    try {
      return JSON.parse(localStorage.getItem("kr-next-event-state") || "{}");
    } catch {
      return {};
    }
  };
  K.saveLocalEventState = (v) => {
    try {
      localStorage.setItem("kr-next-event-state", JSON.stringify(v));
    } catch {}
  };
  K.apptCard = (x) => {
    const el = document.createElement("article");
    el.className = "card fieldCard";
    const timeText =
        x.startTime && x.endTime
          ? x.startTime + "〜" + x.endTime
          : x.startTime || x.endTime || "",
      tel = K.digits(x.phone) ? "tel:" + K.digits(x.phone) : "",
      map = x.address
        ? "https://www.google.com/maps/search/?api=1&query=" +
          encodeURIComponent(x.address)
        : "",
      state = K.localEventState()[x.appointmentId] || {},
      callAt = state.callAt || x.callAt || "";
    const phoneSvg =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h3l1.4 4-2 1.7a15.7 15.7 0 0 0 5.9 5.9l1.7-2 4 1.4v3c0 1.1-.9 2-2 2C11.3 19 5 12.7 5 5c0-1.1.9-2 2-2z"/></svg>';
    const mapSvg =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.7 6-12a6 6 0 1 0-12 0c0 6.3 6 12 6 12z"/><circle cx="12" cy="9" r="2"/></svg>';
    const slipSvg =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8l1 2h2a1 1 0 0 1 1 1v13H4V7a1 1 0 0 1 1-1h2z"/><path d="M8 4v3h8V4M8 11h8M8 15h8"/></svg>';
    el.innerHTML =
      '<div class="cardmain"><div><div class="time">' +
      K.esc(timeText) +
      '</div><div class="kind">' +
      K.esc(x.category || "予定") +
      '</div></div><div><div class="name">' +
      K.esc(x.customerName || x.title || "") +
      '</div><div class="meta">' +
      K.esc(
        [x.address, state.note !== undefined ? state.note : x.notes]
          .filter(Boolean)
          .join(" ／ "),
      ) +
      '</div></div></div><div class="fieldActions">' +
      (tel
        ? '<a class="fieldAction callBtn" href="' +
          tel +
          '"><span class="fieldActionIcon">' +
          phoneSvg +
          "</span><b>" +
          (callAt ? "TEL済" : "TEL") +
          "</b></a>"
        : '<button class="fieldAction" disabled><span class="fieldActionIcon">' +
          phoneSvg +
          "</span><b>TEL</b></button>") +
      (map
        ? '<a class="fieldAction visitBtn" target="_blank" rel="noopener" href="' +
          map +
          '"><span class="fieldActionIcon">' +
          mapSvg +
          "</span><b>訪問</b></a>"
        : '<button class="fieldAction" disabled><span class="fieldActionIcon">' +
          mapSvg +
          "</span><b>訪問</b></button>") +
      '<button class="fieldAction primary slipAction"><span class="fieldActionIcon">' +
      slipSvg +
      "</span><b>伝票</b></button></div>";
    const callBtn = el.querySelector(".callBtn");
    if (callBtn)
      callBtn.addEventListener("click", () => {
        const at = new Date().toISOString(),
          all = K.localEventState();
        all[x.appointmentId] = { ...(all[x.appointmentId] || {}), callAt: at };
        K.saveLocalEventState(all);
        const label = callBtn.querySelector("b");
        if (label) label.textContent = "TEL済";
        window.KRAPI?.run("call-log", x.appointmentId, {
          appointmentId: x.appointmentId,
          caseId: x.caseId || "",
          calledAt: at,
          phone: x.phone || "",
        });
      });
    const visitBtn = el.querySelector(".visitBtn");
    if (visitBtn)
      visitBtn.addEventListener("click", () => {
        const at = new Date().toISOString(),
          all = K.localEventState();
        all[x.appointmentId] = {
          ...(all[x.appointmentId] || {}),
          visitStartedAt: at,
        };
        K.saveLocalEventState(all);
        K.updateLocalCase &&
          x.caseId &&
          K.updateLocalCase(x.caseId, {
            status: "訪問中",
            nextAction: "伝票入力・確定",
            updatedAt: at,
          });
        window.KRAPI?.run("visit-start", x.appointmentId, {
          appointmentId: x.appointmentId,
          caseId: x.caseId || "",
          startedAt: at,
          address: x.address || "",
        });
      });
    const main = el.querySelector(".cardmain");
    if (main) {
      main.classList.add("appointmentTapArea");
      main.onclick = () =>
        K.openAppointmentDetail && K.openAppointmentDetail(x);
    }
    el.querySelector(".slipAction").onclick = () =>
      K.openSlip &&
      K.openSlip({
        caseId: x.caseId,
        appointmentId: x.appointmentId,
        name: x.customerName,
        phone: x.phone,
        address: x.address,
        serviceOrderId: x.serviceOrderId,
      });
    return el;
  };
  K.renderHome = () => {
    K.counts();
    const d = new Date();
    K.$("#todayLabel").textContent =
      d.getMonth() + 1 + "月" + d.getDate() + "日・Green実データ";
    const source = K.getAppointments
      ? K.getAppointments()
      : K.snap.appointments;
    const rows = source
      .filter(
        (x) =>
          x.date === K.keyDate(d) &&
          !["休み", "出勤"].includes(x.category) &&
          x.startTime,
      )
      .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
    const box = K.$("#today");
    box.innerHTML = "";
    if (!rows.length)
      box.innerHTML =
        '<div class="empty">本日の現場予定はありません。予定タブで今後の予定を確認できます。</div>';
    else rows.forEach((x) => box.appendChild(K.apptCard(x)));
  };
  K.listModal = (rows, title) => {
    K.$("#listTitle").textContent = title;
    K.$("#listBody").innerHTML = rows.length
      ? rows
          .map(
            (x) =>
              '<div class="listRow"><b>' +
              K.esc(x.title || x.name || x.customerName || "") +
              "</b><span>" +
              K.esc(x.nextAction || x.status || x.summary || "") +
              "</span></div>",
          )
          .join("")
      : '<div class="empty">対象はありません</div>';
    K.overlay("listModal").classList.add("on");
  };
  K.loadSnapshot = async () => {
    try {
      const now = Date.now(),
        [baseRes, ecRes] = await Promise.all([
          fetch("./data/snapshot.json?_=" + now, { cache: "no-store" }),
          fetch("./data/ec-state.json?_=" + now, { cache: "no-store" }).catch(
            () => null,
          ),
        ]);
      if (!baseRes.ok) throw Error(baseRes.status);
      K.snap = await baseRes.json();
      if (ecRes && ecRes.ok) {
        const delta = await ecRes.json();
        if (Array.isArray(delta.ecListings))
          K.snap.ecListings = delta.ecListings;
        if (Array.isArray(delta.sales)) K.snap.sales = delta.sales;
        K.snap.ecGeneratedAt = delta.generatedAt || "";
      }
      const t = new Date(K.snap.ecGeneratedAt || K.snap.generatedAt),
        label =
          "同期 " +
          t.toLocaleString("ja-JP", {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
      K.$("#scheduleSync").textContent = label + "・読取専用";
      K.$("#inventorySync").textContent = label + "・読取専用";
      K.renderHome();
      K.renderCalendar && K.renderCalendar();
      K.renderInventory && K.renderInventory();
      K.renderStore && K.renderStore();
    } catch (e) {
      K.$("#scheduleSync").textContent = "Green読込失敗・現行へ切替可能";
      K.$("#inventorySync").textContent = "Green読込失敗・現行へ切替可能";
      K.renderHome();
    }
  };
  K.startBridge = () => {
    const bridge = document.createElement("iframe");
    bridge.style.cssText =
      "position:fixed;width:1px;height:1px;left:-9999px;border:0";
    bridge.src = K.C.main + "?page=bridge&embed=1&_next=" + Date.now();
    document.body.appendChild(bridge);
    let ready = false;
    K.requestBlueCases = () => {
      if (!ready || !bridge.contentWindow) return false;
      try {
        bridge.contentWindow.postMessage(
          { type: "kr-hub-bridge-request", request: "customers" },
          "*",
        );
        return true;
      } catch {
        return false;
      }
    };
    window.addEventListener("message", (e) => {
      const d = e.data || {};
      if (d.type === "kr-hub-bridge-ready") {
        ready = true;
        K.$("#status").textContent = "Green検証・Blueライブ読取接続済み";
        K.requestBlueCases();
      }
      if (d.type === "kr-hub-customer-cases") {
        K.liveCases = Array.isArray(d.payload) ? d.payload : [];
        K.renderHome();
        K.renderAssessment && K.renderAssessment();
      }
    });
    setTimeout(() => {
      if (!ready) K.$("#status").textContent = "Green検証・Blueライブ接続待ち";
    }, 1800);
  };
  K.bindCore = () => {
    K.$$("[data-tab]").forEach(
      (b) => (b.onclick = () => K.openTab(b.dataset.tab)),
    );
    K.$$("[data-blue]").forEach(
      (b) => (b.onclick = () => K.openBlue(b.dataset.blue)),
    );
    K.$("#back").onclick = () => K.openTab("home");
    K.$("#newSlip").onclick = () => K.openSlip && K.openSlip(null);
    K.$$("[data-close]").forEach(
      (b) =>
        (b.onclick = () => K.overlay(b.dataset.close).classList.remove("on")),
    );
    K.$("#more").onclick = () => K.overlay("drawer").classList.add("on");
    K.$("#manualSlip").onclick = () => {
      K.overlay("drawer").classList.remove("on");
      K.openSlip && K.openSlip(null);
    };
    K.$$(".metrics button").forEach(
      (b) =>
        (b.onclick = () => {
          const c = K.casesNow(),
            f = b.dataset.filter;
          K.listModal(
            f === "new"
              ? c.filter((x) => /新規/.test(x.status || ""))
              : f === "reply"
                ? c.filter(K.needsReply)
                : c.filter(
                    (x) =>
                      !(x.date || x.confirmedDate) &&
                      !/キャンセル/.test(x.status || ""),
                  ),
            f === "new" ? "新規査定" : f === "reply" ? "要返信" : "日程未確定",
          );
        }),
    );
  };
  K.boot = () => {
    K.bindCore();
    K.refreshResume && K.refreshResume();
    K.loadSnapshot();
    K.startBridge();
    if ("serviceWorker" in navigator)
      window.addEventListener("load", () =>
        navigator.serviceWorker
          .register("./service-worker.js?v=15", { updateViaCache: "none" })
          .then((r) => r.update())
          .catch(() => {}),
      );
  };
  window.addEventListener("DOMContentLoaded", () => setTimeout(K.boot, 0));
})();
