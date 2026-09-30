(() => {
  const K = window.KRN;
  let query = "",
    filter = "all";
  function parse(v) {
    try {
      return JSON.parse(v || "[]");
    } catch {
      return [];
    }
  }
  function customerMap() {
    const m = new Map();
    for (const c of K.customers || []) m.set(c.customerId, c);
    return m;
  }
  function caseMap() {
    const m = new Map();
    for (const c of K.snap.cases || []) m.set(c.caseId, c);
    return m;
  }
  function docMap() {
    const m = new Map();
    for (const d of K.snap.documents || []) {
      const key = String(d.serviceOrderId || "");
      const old = m.get(key);
      if (!key) continue;
      if (
        !old ||
        Number(d.version || 0) > Number(old.version || 0) ||
        (Number(d.version || 0) === Number(old.version || 0) &&
          String(d.sentAt || d.createdAt || "") >
            String(old.sentAt || old.createdAt || ""))
      )
        m.set(key, d);
    }
    return m;
  }
  function delivery(d) {
    if (!d || !d.fileUrl) return "";
    const version = "第" + Number(d.version || 1) + "版";
    if (String(d.status || "") === "sent")
      return (
        '<div class="slipDelivery sent">' +
        version +
        "・メール送信済み</div>"
      );
    if (String(d.status || "") === "failed")
      return (
        '<div class="slipDelivery failed">' + version + "・送信失敗</div>"
      );
    return (
      '<div class="slipDelivery unsent">' + version + "・顧客へ未送信</div>"
    );
  }
  function group(x) {
    if (/キャンセル/.test(x.status)) return "cancel";
    if (/在庫未連動|お客様確認待ち|保存済み|事前/.test(x.status)) return "open";
    if (/在庫連動済み|更新済み/.test(x.status)) return "done";
    return "other";
  }
  function bind() {
    const counts = { all: 0, open: 0, done: 0, cancel: 0 };
    for (const x of K.snap.serviceOrders || []) {
      counts.all++;
      const g = group(x);
      if (counts[g] != null) counts[g]++;
    }
    K.$("#slipFilters").innerHTML = [
      ["all", "全て"],
      ["open", "対応中"],
      ["done", "完了/連動済み"],
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
    K.$$("#slipFilters button").forEach(
      (b) =>
        (b.onclick = () => {
          filter = b.dataset.f;
          K.renderSlips();
        }),
    );
  }
  K.renderSlips = () => {
    if (!K.$("#slipList")) return;
    bind();
    const cm = customerMap(),
      kam = caseMap(),
      dm = docMap(),
      q = K.norm(query);
    let rows = (K.snap.serviceOrders || []).filter(
      (x) => filter === "all" || group(x) === filter,
    );
    rows = rows
      .filter((x) => {
        const c = cm.get(x.customerId) || {},
          k = kam.get(x.caseId) || {};
        return (
          !q ||
          K.norm(
            [
              x.serviceOrderId,
              c.name,
              k.title,
              x.status,
              x.selectedServicesJson,
            ].join(" "),
          ).includes(q)
        );
      })
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    K.$("#slipCount").textContent = rows.length + "件";
    const list = K.$("#slipList");
    list.innerHTML = "";
    if (!rows.length) {
      list.innerHTML = '<div class="empty">対象伝票はありません</div>';
      return;
    }
    rows.forEach((x) => {
      const c = cm.get(x.customerId) || {},
        k = kam.get(x.caseId) || {},
        d = dm.get(x.serviceOrderId),
        sv = parse(x.selectedServicesJson).map(
          (s) =>
            ({
              purchase: "買取",
              work: "工事",
              delivery: "配送",
              recycle: "リサイクル",
              sale: "販売",
              estimate: "見積",
            })[s] || s,
        );
      const name =
        c.name || String(k.title || "").replace(/様$/, "") || "顧客未登録";
      const openNextSlip = () =>
        K.openSlip &&
        K.openSlip({
          caseId: x.caseId,
          serviceOrderId: x.serviceOrderId,
          name,
          address: c.address,
          phone: c.phone,
          email: c.email,
        });
      const net = Number(x.netTotal || 0),
        amountLabel = net < 0 ? "買取 ¥" + Math.abs(net).toLocaleString() : "¥" + net.toLocaleString(),
        firstService = parse(x.selectedServicesJson)[0] || "other";
      const card = document.createElement("article");
      card.className = "slipCardNative compactSlipRow";
      card.innerHTML =
        '<div class="slipCompactMain"><span class="slipThumb ' +
        K.esc(firstService) +
        '" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg></span><div class="slipCompactBody"><b class="slipCustomerName">' +
        K.esc(name) +
        ' 様</b><span class="slipId">' +
        K.esc(x.serviceOrderId) +
        '</span><strong class="slipServices">' +
        K.esc(sv.join("・") || "業務未設定") +
        '</strong>' +
        delivery(d) +
        '</div><div class="slipCompactSide"><em>' +
        K.esc(x.status || "未設定") +
        '</em><b>' +
        K.esc(amountLabel) +
        '</b><i aria-hidden="true">›</i><button class="slipMore" type="button" aria-expanded="false" aria-label="伝票のその他操作">•••</button></div></div>' +
        '<div class="slipActions compactActions"><button class="edit">現行編集</button>' +
        (d && d.fileUrl
          ? '<a class="pdf" target="_blank" rel="noopener" href="' +
            K.esc(d.fileUrl) +
            '">PDF</a>'
          : "<button disabled>PDFなし</button>") +
        '<button class="related">関連在庫</button></div>';
      card.querySelector(".edit").onclick = () =>
        K.openBlue("slips", { slip: x.serviceOrderId });
      card.querySelector(".related").onclick = () =>
        K.openInventoryForSlip
          ? K.openInventoryForSlip(x.serviceOrderId)
          : K.openTab("inventory");
      card.querySelector(".slipMore").onclick = (event) => {
        event.stopPropagation();
        const expanded = card.classList.toggle("actionsOpen");
        event.currentTarget.setAttribute("aria-expanded", String(expanded));
      };
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", name + " 様の伝票を開く");
      card.addEventListener("click", (event) => {
        if (event.target.closest("button,a")) return;
        openNextSlip();
      });
      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openNextSlip();
      });
      list.appendChild(card);
    });
  };
  K.$("#slipSearch").addEventListener("input", (e) => {
    query = e.target.value;
    clearTimeout(window.__slipT);
    window.__slipT = setTimeout(K.renderSlips, 100);
  });
  K.$("#createSlipPrimary").onclick = () => K.openSlip && K.openSlip(null);
  K.$("#toggleSlipSearch").onclick = () => {
    K.$("#slipSearchBox").classList.add("open");
    setTimeout(() => K.$("#slipSearch").focus(), 30);
  };
  K.$("#closeSlipSearch").onclick = () => {
    K.$("#slipSearchBox").classList.remove("open");
  };
})();
