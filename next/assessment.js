(() => {
  const K = window.KRN;
  const BLUE_DASHBOARD = K.C.assessment;
  let filter = "all",
    query = "",
    loaded = false,
    activeBlueCase = "",
    blueFrameReady = false;
  async function ensureCustomers() {
    if (loaded) return;
    if (Array.isArray(K.customers) && K.customers.length) {
      loaded = true;
      return;
    }
    try {
      const r = await fetch("./data/customers.json?_=" + Date.now(), {
          cache: "no-store",
        }),
        j = await r.json();
      K.customers = j.customers || [];
    } catch {
      K.customers = [];
    }
    loaded = true;
  }
  function customerFor(x) {
    const id = x.customerId || "";
    return (K.customers || []).find((c) => c.customerId === id) || {};
  }
  function normCase(x) {
    const c = customerFor(x),
      id =
        x.id ||
        x.blueReceptionId ||
        String(x.caseId || "")
          .replace(/^BLUE-CASE-/, "")
          .replace(/^BLUE-SLIP-CASE-/, "");
    return {
      id,
      caseId:
        x.caseId || (String(id).startsWith("KR-") ? "BLUE-CASE-" + id : ""),
      name: x.name || String(x.title || "").replace(/様$/, "") || c.name || "",
      phone: x.phone || c.phone || "",
      address: x.address || c.address || "",
      email: x.email || c.email || "",
      status: x.status || "",
      next: x.nextAction || x.next || "",
      product: x.product || x.summary || "",
      date: x.date || x.confirmedDate || "",
      time:
        x.time || [x.confirmedStart, x.confirmedEnd].filter(Boolean).join("〜"),
      total: Number(x.total || x.estimateTotal || 0),
      mode: x.mode || x.requestType || "",
    };
  }
  function group(x) {
    if (/キャンセル/.test(x.status)) return "cancel";
    if (/訪問日時確定|訪問予定/.test(x.status)) return "confirmed";
    if (
      /新規|査定中|予約変更/.test(x.status) ||
      (/買取確定/.test(x.status) && !/確認待ち/.test(x.next))
    )
      return "action";
    if (
      /見積回答済|お客様回答待ち/.test(x.status) ||
      (/買取確定/.test(x.status) && /確認待ち/.test(x.next)) ||
      K.needsReply(x)
    )
      return "wait";
    return "other";
  }
  function assessmentCases() {
    return K.casesNow()
      .map(normCase)
      .filter((x) => /^KR-/i.test(x.id));
  }
  function bindFilters() {
    const counts = { all: 0, action: 0, wait: 0, confirmed: 0, cancel: 0 };
    assessmentCases().forEach((x) => {
      counts.all++;
      const g = group(x);
      if (counts[g] != null) counts[g]++;
    });
    K.$("#assessmentFilters").innerHTML = [
      ["all", "全て"],
      ["action", "対応する"],
      ["wait", "待機中"],
      ["confirmed", "訪問確定"],
      ["cancel", "キャンセル"],
    ]
      .map(
        ([k, l]) =>
          '<button data-f="' +
          k +
          '" class="' +
          (filter === k ? "active" : "") +
          '">' +
          l +
          " " +
          counts[k] +
          "</button>",
      )
      .join("");
    K.$$("#assessmentFilters button").forEach(
      (b) =>
        (b.onclick = () => {
          filter = b.dataset.f;
          K.renderAssessment();
        }),
    );
  }
  function postBlueCase() {
    const frame = K.$("#assessmentOpsFrame");
    if (!frame || !frame.contentWindow || !activeBlueCase) return;
    try {
      frame.contentWindow.postMessage(
        { type: "kr-open-assessment-case", caseId: activeBlueCase },
        "*",
      );
    } catch {}
  }
  function loadBlueFrame(force) {
    const frame = K.$("#assessmentOpsFrame");
    if (!frame) return;
    if (!frame.getAttribute("src") || force) {
      blueFrameReady = false;
      K.$("#assessmentOpsLoading")?.classList.remove("hide");
      const u = new URL(BLUE_DASHBOARD);
      u.searchParams.set("embed", "1");
      u.searchParams.set("_next_assessment", Date.now());
      frame.src = u.toString();
      return;
    }
    if (blueFrameReady) postBlueCase();
  }
  K.openAssessmentOps = (caseInfo) => {
    activeBlueCase = String(caseInfo?.id || caseInfo?.caseId || "")
      .replace(/^BLUE-CASE-/, "")
      .replace(/^BLUE-SLIP-CASE-/, "");
    K.$("#assessmentOpsTitle").textContent = caseInfo?.name
      ? caseInfo.name + " 様の査定"
      : "査定ダッシュボード";
    K.$("#assessmentOpsSub").textContent = activeBlueCase
      ? activeBlueCase + "・Blue本番と直接同期"
      : "Blue本番と直接同期";
    K.overlay("assessmentOpsModal").classList.add("on");
    loadBlueFrame(false);
    if (blueFrameReady && activeBlueCase) {
      postBlueCase();
      setTimeout(postBlueCase, 250);
    }
  };
  function refreshBlueList() {
    const state = K.$("#assessmentBridgeState");
    if (state) {
      state.textContent = "同期中";
      state.classList.remove("connected");
    }
    K.requestBlueCases?.();
    setTimeout(() => {
      K.renderAssessment();
      if (state && K.liveCases.length) {
        state.textContent = "ライブ接続";
        state.classList.add("connected");
      }
    }, 650);
  }
  K.renderAssessment = async () => {
    await ensureCustomers();
    if (!K.$("#assessmentList")) return;
    bindFilters();
    const q = K.norm(query);
    let rows = assessmentCases()
      .filter(
        (x) =>
          (filter === "all" || group(x) === filter) &&
          (!q ||
            K.norm(
              [
                x.id,
                x.name,
                x.phone,
                x.address,
                x.product,
                x.status,
                x.next,
              ].join(" "),
            ).includes(q)),
      );
    rows.sort(
      (a, b) =>
        String(b.date).localeCompare(String(a.date)) ||
        String(b.id).localeCompare(String(a.id)),
    );
    K.$("#assessmentCount").textContent = rows.length + "件";
    const bridgeState = K.$("#assessmentBridgeState");
    if (bridgeState) {
      bridgeState.textContent = K.liveCases.length
        ? "ライブ接続"
        : "読取データ";
      bridgeState.classList.toggle("connected", Boolean(K.liveCases.length));
    }
    const list = K.$("#assessmentList");
    list.innerHTML = "";
    if (!rows.length) {
      list.innerHTML = '<div class="empty">対象案件はありません</div>';
      return;
    }
    rows.forEach((x) => {
      const c = document.createElement("article");
      c.className = "assessmentCard";
      c.dataset.group = group(x);
      const tel = K.digits(x.phone) ? "tel:" + K.digits(x.phone) : "";
      c.innerHTML =
        '<div class="assessmentTop"><div><b>' +
        K.esc(x.name || "氏名未登録") +
        "</b><span>" +
        K.esc(x.id || "") +
        "</span></div><em>" +
        K.esc(x.status || "") +
        '</em></div><div class="assessmentProduct">' +
        K.esc(x.product || "商品情報なし") +
        '</div><div class="assessmentSub">' +
        K.esc([x.date, x.time, x.address].filter(Boolean).join(" ／ ")) +
        '</div><div class="assessmentNext">次：' +
        K.esc(x.next || "確認") +
        (x.total ? " ／ 査定合計 ¥" + x.total.toLocaleString("ja-JP") : "") +
        '</div><div class="assessmentActions">' +
        (tel
          ? '<a href="' + tel + '">☎ TEL</a>'
          : "<button disabled>☎ TEL</button>") +
        '<button class="operate">査定を開く</button><button class="schedule">訪問予定</button><button class="next">NEXT伝票</button></div>';
      c.querySelector(".operate").onclick = () => K.openAssessmentOps(x);
      c.querySelector(".schedule").onclick = () =>
        K.openAppointmentFromCase &&
        K.openAppointmentFromCase({
          caseId: x.caseId || x.id,
          ref: x.id,
          name: x.name,
          phone: x.phone,
          address: x.address,
          date: x.date || "",
          notes: x.product ? "査定内容：" + x.product : "",
        });
      c.querySelector(".next").onclick = () =>
        K.openSlip &&
        K.openSlip({
          caseId: x.caseId || x.id,
          name: x.name,
          phone: x.phone,
          address: x.address,
          email: x.email,
        });
      list.appendChild(c);
    });
  };
  K.$("#assessmentSearch").addEventListener("input", (e) => {
    query = e.target.value;
    clearTimeout(window.__assT);
    window.__assT = setTimeout(K.renderAssessment, 100);
  });
  K.$("#openAssessmentDashboard").onclick = () => K.openAssessmentOps(null);
  K.$("#refreshAssessment").onclick = refreshBlueList;
  K.$("#assessmentOpsReload").onclick = () => loadBlueFrame(true);
  K.$("#assessmentOpsClose").addEventListener("click", refreshBlueList);
  K.overlay("assessmentOpsModal").addEventListener("click", (event) => {
    if (event.target !== K.overlay("assessmentOpsModal")) return;
    K.overlay("assessmentOpsModal").classList.remove("on");
    refreshBlueList();
  });
  K.$("#assessmentOpsFrame").addEventListener("load", () => {
    blueFrameReady = true;
    K.$("#assessmentOpsLoading")?.classList.add("hide");
    postBlueCase();
    if (activeBlueCase) setTimeout(postBlueCase, 500);
  });
})();
