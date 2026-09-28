(() => {
  const K = window.KRN;
  let filter = "all",
    query = "",
    loaded = false,
    activeBlueCase = "";
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
  function assessmentPairView(caseInfo) {
    const body = K.$("#assessmentOpsBody");
    body.innerHTML =
      '<div class="assessmentPair"><div class="assessmentPairIcon">🔐</div><h2>NEXT査定を接続</h2><p>初回のみ接続コードを入力します。コードはこの端末に安全に保存されます。</p><input id="assessmentPairCode" inputmode="text" autocomplete="off" placeholder="接続コード"><button id="assessmentPairButton" class="assessmentPrimary">接続して査定を開く</button><small id="assessmentPairError"></small></div>';
    K.$("#assessmentPairButton").onclick = async () => {
      const button = K.$("#assessmentPairButton");
      const error = K.$("#assessmentPairError");
      button.disabled = true;
      button.textContent = "接続中…";
      error.textContent = "";
      try {
        await KRAssessmentAdapter.pair(K.$("#assessmentPairCode").value);
        await loadAssessmentCase(caseInfo);
      } catch (e) {
        error.textContent = String(e.message || e);
        button.disabled = false;
        button.textContent = "接続して査定を開く";
      }
    };
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
    try {
      const result = await KRAssessmentAdapter.run(operation, payload);
      alert(success || result?.message || "保存しました");
      await loadAssessmentCase({ id: activeBlueCase });
      refreshBlueList();
    } catch (e) {
      if (/SESSION_EXPIRED/.test(String(e.message || e))) {
        KRAssessmentAdapter.clear();
        assessmentPairView({ id: activeBlueCase });
      } else alert("処理できません：" + String(e.message || e));
    } finally {
      buttons.forEach((x) => (x.disabled = false));
    }
  }
  function nativeDetailHtml(c) {
    const status = String(c.status || "");
    const assessable = /新規|査定中|予約変更/.test(status);
    const visitEdit = /買取確定/.test(status) && !/確認待ち/.test(String(c.nextAction || ""));
    const combined = assessable && (c.mode === "出張買取希望" || /予約変更/.test(status));
    const rawItems = Array.isArray(c.items) && c.items.length ? c.items : String(c.productText || c.product || "商品").split(/\n/).filter(Boolean).map((name) => ({ name, amount: "" }));
    const itemRows = rawItems.map((item, index) => '<div class="nativeItem"><div><small>商品 ' + (index + 1) + '</small><b>' + K.esc(item.name || item.product || "商品") + '</b></div>' + (assessable ? '<label><span>査定額</span><input class="nativeAmount" inputmode="numeric" value="' + K.esc(item.amount || "") + '" placeholder="0"></label>' : '<strong>' + money(item.amount || 0) + '</strong>') + '</div>').join("");
    const visitFields = '<div class="nativeVisit"><label>訪問日<input id="nativeVisitDate" type="date" value="' + K.esc(c.visitDate || "") + '"></label><label>開始<input id="nativeVisitStart" type="time" value="' + K.esc(String(c.visitTime || "").split(/〜/)[0] || "10:00") + '"></label><label>終了<input id="nativeVisitEnd" type="time" value="' + K.esc(String(c.visitTime || "").split(/〜/)[1] || "12:00") + '"></label></div>';
    let actions = '<div class="nativeLocked">この案件は現在「' + K.esc(c.nextAction || status || "確認") + '」です。</div>';
    if (assessable) actions = (combined ? visitFields : "") + '<textarea id="nativeMessage" placeholder="お客様への追加メッセージ（任意）"></textarea><div class="nativeActionBar"><button id="nativeSaveAssessment">下書き保存</button><button id="nativeSendAssessment" class="assessmentPrimary">' + (combined ? "査定額と訪問日時を確認・送信" : "査定結果を確認・送信") + "</button></div>";
    else if (visitEdit) actions = visitFields + '<textarea id="nativeMessage" placeholder="お客様への追加メッセージ（任意）"></textarea><div class="nativeActionBar"><button id="nativeSaveVisit">下書き保存</button><button id="nativeSendVisit" class="assessmentPrimary">訪問日時を確認・送信</button></div>';
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
      body.innerHTML = nativeDetailHtml(detail);
      bindNativeActions(detail);
    } catch (e) {
      if (/SESSION_EXPIRED/.test(String(e.message || e))) {
        KRAssessmentAdapter.clear();
        assessmentPairView(caseInfo);
      } else body.innerHTML = '<div class="nativeAssessmentError"><b>査定を開けません</b><p>' + K.esc(String(e.message || e)) + '</p><button id="nativeRetry">再試行</button></div>';
      K.$("#nativeRetry")?.addEventListener("click", () => loadAssessmentCase(caseInfo));
    }
  }
  K.openAssessmentOps = async (caseInfo) => {
    activeBlueCase = String(caseInfo?.id || caseInfo?.caseId || "")
      .replace(/^BLUE-CASE-/, "")
      .replace(/^BLUE-SLIP-CASE-/, "");
    if (!activeBlueCase) {
      K.$("#assessmentOpsTitle").textContent = "NEXT査定接続";
      K.$("#assessmentOpsSub").textContent = "Blue本番・LINE経路を安全に利用";
      K.overlay("assessmentOpsModal").classList.add("on");
      if (!KRAssessmentAdapter.hasSession()) assessmentPairView(caseInfo);
      else K.$("#assessmentOpsBody").innerHTML = '<div class="nativeAssessmentError"><b>接続済みです</b><p>一覧から案件の「査定を開く」を押してください。</p></div>';
      return;
    }
    K.$("#assessmentOpsTitle").textContent = (caseInfo?.name || "") + " 様の査定";
    K.$("#assessmentOpsSub").textContent = activeBlueCase + " ・ NEXT安全接続";
    K.overlay("assessmentOpsModal").classList.add("on");
    if (!KRAssessmentAdapter.hasSession()) assessmentPairView(caseInfo);
    else await loadAssessmentCase(caseInfo);
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
  K.$("#assessmentOpsReload").onclick = () =>
    activeBlueCase && loadAssessmentCase({ id: activeBlueCase });
  K.$("#assessmentOpsClose").addEventListener("click", refreshBlueList);
})();
