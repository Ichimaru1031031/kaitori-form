(() => {
  const K = window.KRN;
  let filter = "all",
    query = "",
    loaded = false,
    activeBlueCase = "",
    actionNotice = null,
    dashboardLoading = false;
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
      address: displayAddress(x.address || c.address || ""),
      email: x.email || c.email || "",
      status: x.status || "",
      next: x.nextAction || x.next || "",
      product:
        x.productText ||
        x.productsText ||
        x.itemSummary ||
        x.product ||
        x.summary ||
        "",
      items: Array.isArray(x.items) ? x.items : [],
      date: x.date || x.confirmedDate || "",
      time:
        x.time || [x.confirmedStart, x.confirmedEnd].filter(Boolean).join("〜"),
      total: Number(x.total || x.estimateTotal || 0),
      mode: x.mode || x.requestType || "",
    };
  }
  function displayAddress(value) {
    let text = String(value || "")
      .replace(/\s*,\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    text = text.replace(/(\d+(?:-\d+){1,3})\1$/, "$1");
    for (let length = Math.floor(text.length / 2); length >= 5; length--) {
      const tail = text.slice(-length);
      if (text.slice(-length * 2, -length) === tail) {
        text = text.slice(0, -length) + tail;
        break;
      }
    }
    return text;
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
  function dashboardCases(result) {
    if (Array.isArray(result)) return result;
    const candidates = [
      result?.cases,
      result?.items,
      result?.requests,
      result?.rows,
      result?.data?.cases,
      result?.data?.items,
      result?.dashboard?.cases,
    ];
    return candidates.find(Array.isArray) || [];
  }
  function caseIdOf(x) {
    return String(x?.id || x?.blueReceptionId || x?.receptionId || x?.caseId || "")
      .replace(/^BLUE-CASE-/, "")
      .replace(/^BLUE-SLIP-CASE-/, "");
  }
  function mergeNativeDetail(detail) {
    const id = caseIdOf(detail) || activeBlueCase;
    const target = K.liveCases.length ? K.liveCases : K.snap.cases;
    const index = target.findIndex((x) => caseIdOf(x) === id);
    if (index < 0) return;
    const visit = String(detail.visitTime || "").split(/〜/);
    target[index] = {
      ...target[index],
      ...detail,
      id,
      blueReceptionId: id,
      name: detail.name || target[index].name,
      status: detail.status || target[index].status,
      nextAction: detail.nextAction || target[index].nextAction,
      product: detail.productText || detail.product || target[index].product,
      estimateTotal: Number(detail.total || detail.estimateTotal || 0),
      confirmedDate: detail.visitDate || target[index].confirmedDate,
      confirmedStart: visit[0] || target[index].confirmedStart,
      confirmedEnd: visit[1] || target[index].confirmedEnd,
    };
  }
  async function syncNativeDashboard() {
    if (dashboardLoading || !KRAssessmentAdapter.hasSession()) return false;
    dashboardLoading = true;
    try {
      const result = await KRAssessmentAdapter.run("dashboard", {});
      const rows = dashboardCases(result).filter((x) => /^KR-/i.test(caseIdOf(x)));
      if (!rows.length) return false;
      const existing = K.liveCases.length ? K.liveCases : K.snap.cases;
      K.liveCases = rows.map((row) => ({
        ...(existing.find((x) => caseIdOf(x) === caseIdOf(row)) || {}),
        ...row,
      }));
      return true;
    } catch {
      return false;
    } finally {
      dashboardLoading = false;
    }
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
  function assessmentPairView(caseInfo) {
    const body = K.$("#assessmentOpsBody");
    const linkError = sessionStorage.getItem("kr-next-device-link-error") || "";
    sessionStorage.removeItem("kr-next-device-link-error");
    body.innerHTML =
      '<div class="assessmentPair"><div class="assessmentPairIcon">📱</div><h2>この端末は閲覧中です</h2><p>査定の更新・送信には、接続済み端末で「設定 → 別の端末を接続」から24時間有効のリンクを作成し、この端末で一度だけ開いてください。</p>' +
      (linkError ? '<small id="assessmentPairError">端末接続リンクを確認できません。新しいリンクを作成してください。</small>' : '<small>一度接続すれば、この端末は継続して自動接続されます。</small>') +
      '</div>';
  }
  function money(value) {
    return "¥" + Number(value || 0).toLocaleString("ja-JP");
  }
  function visitData() {
    const date = K.$("#nativeVisitDate")?.value || "";
    const start = K.$("#nativeVisitStart")?.value || "";
    const end = K.$("#nativeVisitEnd")?.value || "";
    return {
      name: K.__assessmentCase?.name || "",
      phone: K.__assessmentCase?.phone || "",
      address: K.__assessmentCase?.address || "",
      visitDate: date,
      visitTime: start && end ? start + "〜" + end : "",
    };
  }
  function amounts() {
    return K.$$("#assessmentOpsBody .nativeAmount").map((x) => x.value);
  }
  async function runAssessment(operation, payload, success) {
    const buttons = K.$$("#assessmentOpsBody button");
    buttons.forEach((x) => (x.disabled = true));
    const currentResult = K.$("#nativeActionResult");
    if (currentResult) {
      currentResult.className = "nativeActionResult pending";
      currentResult.textContent = "処理中…";
    }
    try {
      const result = await KRAssessmentAdapter.run(operation, payload);
      actionNotice = {
        caseId: activeBlueCase,
        kind: "success",
        text: result?.message || success || "保存しました",
      };
      await loadAssessmentCase({ id: activeBlueCase });
      refreshBlueList();
    } catch (e) {
      if (/SESSION_EXPIRED/.test(String(e.message || e))) {
        KRAssessmentAdapter.clear();
        assessmentPairView({ id: activeBlueCase });
      } else {
        const errorResult = K.$("#nativeActionResult");
        if (errorResult) {
          errorResult.className = "nativeActionResult error";
          errorResult.textContent = "処理できません：" + String(e.message || e);
        }
      }
    } finally {
      buttons.forEach((x) => (x.disabled = false));
    }
  }
  function actionResultHtml(c) {
    const notice = actionNotice?.caseId === (c.id || activeBlueCase) ? actionNotice : null;
    return (
      '<p id="nativeActionResult" class="nativeActionResult' +
      (notice ? " " + K.esc(notice.kind) : "") +
      '" aria-live="polite">' +
      K.esc(notice?.text || "") +
      "</p>"
    );
  }
  function nativeDetailHtml(c, readOnly = false) {
    const status = String(c.status || "");
    const assessable = /新規|査定中|予約変更/.test(status);
    const visitEdit = /買取確定/.test(status) && !/確認待ち/.test(String(c.nextAction || ""));
    const combined = assessable && (c.mode === "出張買取希望" || /予約変更/.test(status));
    const rawItems = Array.isArray(c.items) && c.items.length ? c.items : String(c.productText || c.product || "商品").split(/\n/).filter(Boolean).map((name) => ({ name, amount: "" }));
    const itemRows = rawItems.map((item, index) => '<div class="nativeItem"><div><small>商品 ' + (index + 1) + '</small><b>' + K.esc(item.name || item.product || "商品") + '</b></div>' + (assessable && !readOnly ? '<label><span>査定額</span><input class="nativeAmount" inputmode="numeric" value="' + K.esc(item.amount || "") + '" placeholder="0"></label>' : '<strong>' + money(item.amount || 0) + '</strong>') + '</div>').join("");
    const visitFields = '<div class="nativeVisit"><label>訪問日<input id="nativeVisitDate" type="date" value="' + K.esc(c.visitDate || "") + '"></label><label>開始<input id="nativeVisitStart" type="time" value="' + K.esc(String(c.visitTime || "").split(/〜/)[0] || "10:00") + '"></label><label>終了<input id="nativeVisitEnd" type="time" value="' + K.esc(String(c.visitTime || "").split(/〜/)[1] || "12:00") + '"></label></div>';
    const resultHtml = actionResultHtml(c);
    let actions = resultHtml + '<div class="nativeLocked">この案件は現在「' + K.esc(c.nextAction || status || "確認") + '」です。</div>';
    if (readOnly) actions = '<div class="nativeLocked"><b>NEXT表示モード</b><br>受付内容は確認できます。送信・更新は保護された接続が確認できた端末だけ有効になります。</div>';
    else if (assessable) actions = (combined ? visitFields : "") + '<textarea id="nativeMessage" placeholder="お客様への追加メッセージ（任意）"></textarea>' + resultHtml + '<div class="nativeActionBar"><button id="nativeSaveAssessment">下書き保存</button><button id="nativeSendAssessment" class="assessmentPrimary">' + (combined ? "査定額と訪問日時を確認・送信" : "査定結果を確認・送信") + "</button></div>";
    else if (visitEdit) actions = visitFields + '<textarea id="nativeMessage" placeholder="お客様への追加メッセージ（任意）"></textarea>' + resultHtml + '<div class="nativeActionBar"><button id="nativeSaveVisit">下書き保存</button><button id="nativeSendVisit" class="assessmentPrimary">訪問日時を確認・送信</button></div>';
    return '<div class="nativeAssessment"><section class="nativeHero"><div><small>' + K.esc(c.id || activeBlueCase) + '</small><h2>' + K.esc(c.name || "氏名未登録") + ' 様</h2><p>' + K.esc(status) + '</p></div><div class="nativeTotal"><small>査定合計</small><b>' + money(c.total || 0) + '</b></div></section><section class="nativeSection"><h3>📦 商品と査定額</h3>' + itemRows + '</section><section class="nativeSection"><h3>📋 今やること</h3>' + actions + '</section><details class="nativeMore"><summary>お客様情報</summary><p>電話：' + K.esc(c.phone || "—") + '</p><p>メール：' + K.esc(c.email || "—") + '</p><p>住所：' + K.esc(c.address || "—") + '</p></details></div>';
  }
  function bindNativeActions(c) {
    const id = c.id || activeBlueCase;
    K.$("#nativeSaveAssessment")?.addEventListener("click", () => runAssessment("save-assessment", { id, amounts: amounts(), data: visitData() }, "下書きを保存しました"));
    K.$("#nativeSendAssessment")?.addEventListener("click", () => {
      if (!confirm("査定内容を確認し、お客様へ送信しますか？")) return;
      const combined = c.mode === "出張買取希望" || /予約変更/.test(c.status || "");
      runAssessment(combined ? "send-combined" : "send-estimate", { id, amounts: amounts(), data: visitData(), message: K.$("#nativeMessage")?.value || "" }, "お客様へ送信しました");
    });
    K.$("#nativeSaveVisit")?.addEventListener("click", () => runAssessment("save-visit", { id, data: visitData() }, "訪問日時を下書き保存しました"));
    K.$("#nativeSendVisit")?.addEventListener("click", () => {
      if (!confirm("訪問日時をお客様へ送信しますか？")) return;
      runAssessment("send-visit", { id, data: visitData(), message: K.$("#nativeMessage")?.value || "" }, "訪問日時を送信しました");
    });
  }
  async function loadAssessmentCase(caseInfo) {
    const body = K.$("#assessmentOpsBody");
    body.innerHTML = '<div class="nativeAssessmentLoading"><b>査定データを読み込み中…</b></div>';
    try {
      const detail = await KRAssessmentAdapter.getCase(activeBlueCase);
      K.__assessmentCase = detail;
      mergeNativeDetail(detail);
      body.innerHTML = nativeDetailHtml(detail);
      bindNativeActions(detail);
      K.renderAssessment();
    } catch (e) {
      if (/SESSION_EXPIRED/.test(String(e.message || e))) {
        KRAssessmentAdapter.clear();
        assessmentPairView(caseInfo);
      } else body.innerHTML = '<div class="nativeAssessmentError"><b>査定を開けません</b><p>' + K.esc(String(e.message || e)) + '</p><button id="nativeRetry">再試行</button></div>';
      K.$("#nativeRetry")?.addEventListener("click", () => loadAssessmentCase(caseInfo));
    }
  }
  K.openAssessmentOps = async (caseInfo) => {
    await KRAssessmentAdapter.init();
    const nextBlueCase = String(caseInfo?.id || caseInfo?.caseId || "")
      .replace(/^BLUE-CASE-/, "")
      .replace(/^BLUE-SLIP-CASE-/, "");
    actionNotice = null;
    activeBlueCase = nextBlueCase;
    if (!activeBlueCase) return refreshBlueList();
    K.$("#assessmentOpsTitle").textContent = (caseInfo?.name || "") + " 様の査定";
    K.$("#assessmentOpsSub").textContent = activeBlueCase + " ・ NEXT安全接続";
    K.overlay("assessmentOpsModal").classList.add("on");
    if (!KRAssessmentAdapter.hasSession()) {
      K.__assessmentCase = caseInfo;
      K.$("#assessmentOpsBody").innerHTML = nativeDetailHtml(caseInfo, true);
    } else await loadAssessmentCase(caseInfo);
  };
  async function refreshBlueList() {
    const state = K.$("#assessmentBridgeState");
    if (state) {
      state.textContent = "同期中";
      state.classList.remove("connected");
    }
    if (await syncNativeDashboard()) {
      K.renderAssessment();
      if (state) {
        state.textContent = "ライブ接続";
        state.classList.add("connected");
      }
      return;
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
      const rowGroup = group(x),
        tel = K.digits(x.phone) ? "tel:" + K.digits(x.phone) : "";
      c.className = "assessmentCard compactAssessmentRow";
      c.dataset.group = rowGroup;
      c.innerHTML =
        '<div class="assessmentCompactMain"><span class="assessmentThumb ' +
        K.esc(rowGroup) +
        '" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H13l7 7-8.5 8.5a1.7 1.7 0 0 1-2.4 0L4.5 14.9A1.7 1.7 0 0 1 4 13.7z"/><circle cx="8" cy="8" r="1.3"/><path d="M11 11.2h5M13.5 9v4.4"/></svg></span><div class="assessmentCompactBody"><b>' +
        K.esc(x.name || "氏名未登録") +
        " 様</b><span>" +
        K.esc(x.id || "") +
        '</span><strong class="assessmentProduct">' +
        K.esc(x.product || "商品情報なし") +
        '</strong><small>' +
        K.esc([x.date, x.time, x.address].filter(Boolean).join(" ／ ") || "次：" + (x.next || "確認")) +
        '</small></div><div class="assessmentCompactSide"><em>' +
        K.esc(x.status || "未設定") +
        '</em><b>' +
        (x.total ? "¥" + x.total.toLocaleString("ja-JP") : "—") +
        '</b><i aria-hidden="true">›</i><button class="assessmentMore" type="button" aria-expanded="false" aria-label="査定のその他操作">•••</button></div></div><div class="assessmentActions compactActions">' +
        (tel
          ? '<a href="' + tel + '">☎ TEL</a>'
          : "<button disabled>☎ TEL</button>") +
        '<button class="schedule">訪問予定</button><button class="next">NEXT伝票</button></div>';
      c.querySelector(".assessmentMore").onclick = (event) => {
        event.stopPropagation();
        const expanded = c.classList.toggle("actionsOpen");
        event.currentTarget.setAttribute("aria-expanded", String(expanded));
      };
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
      c.querySelector(".next").onclick = async (event) => {
        const button = event.currentTarget;
        let source = x;
        button.disabled = true;
        button.textContent = "査定情報を確認中…";
        try {
          if (KRAssessmentAdapter?.hasSession?.()) {
            const detail = await KRAssessmentAdapter.getCase(x.id);
            if (detail) {
              mergeNativeDetail(detail);
              source = normCase({
                ...x,
                ...detail,
                product: detail.productText || detail.product || x.product,
                items: Array.isArray(detail.items) ? detail.items : x.items,
              });
            }
          }
        } catch {}
        button.disabled = false;
        button.textContent = "NEXT伝票";
        K.openSlip &&
          K.openSlip({
            caseId: source.caseId || source.id,
            name: source.name,
            phone: source.phone,
            address: source.address,
            email: source.email,
            assessmentProduct: source.product || "",
            assessmentItems: Array.isArray(source.items) ? source.items : [],
          });
      };
      c.tabIndex = 0;
      c.setAttribute("role", "button");
      c.setAttribute("aria-label", (x.name || "氏名未登録") + " 様の査定を開く");
      c.addEventListener("click", (event) => {
        if (event.target.closest("button,a")) return;
        K.openAssessmentOps(x);
      });
      c.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        K.openAssessmentOps(x);
      });
      list.appendChild(c);
    });
  };
  K.$("#assessmentSearch").addEventListener("input", (e) => {
    query = e.target.value;
    clearTimeout(window.__assT);
    window.__assT = setTimeout(K.renderAssessment, 100);
  });
  K.$("#openAssessmentDashboard").onclick = async () => {
    await refreshBlueList();
    K.$("#assessmentView").scrollTo({ top: 0, behavior: "smooth" });
  };
  K.$("#refreshAssessment").onclick = refreshBlueList;
  K.$("#assessmentOpsReload").onclick = () =>
    activeBlueCase && loadAssessmentCase({ id: activeBlueCase });
  K.$("#assessmentOpsClose").addEventListener("click", refreshBlueList);
  K.enableSwipeSheet?.(
    K.$("#assessmentOpsModal [data-swipe-sheet]"),
    () => {
      K.overlay("assessmentOpsModal").classList.remove("on");
      refreshBlueList();
    },
  );
  setTimeout(refreshBlueList, 1200);
})();
