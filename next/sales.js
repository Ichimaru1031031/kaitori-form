(() => {
  const K = window.KRN;
  let filter = "selling",
    fulfillmentFilter = "",
    query = "",
    sort = "updated",
    activeItem = null,
    selectedEmployee = null;
  function state(x) {
    return K.inventoryEffectiveStage
      ? K.inventoryEffectiveStage(x)
      : x.stage || "";
  }
  function rows() {
    const q = K.norm(query);
    let r = (K.snap.inventory || []).filter((x) => {
      const s = state(x);
      const ok =
        filter === "all"
          ? [
              "販売準備",
              "販売準備完了",
              "販売中",
              "売約済み",
              "引渡し済み",
              "販売完了",
            ].includes(s)
          : filter === "prep"
            ? ["販売準備", "販売準備完了"].includes(s)
            : filter === "selling"
              ? s === "販売中"
              : filter === "reserved"
                ? s === "売約済み"
                : filter === "delivered"
                  ? s === "引渡し済み"
                  : filter === "complete"
                    ? s === "販売完了"
                    : true;
      return (
        ok &&
        (!q ||
          K.norm(
            [x.inventoryNo, x.maker, x.model, x.category].join(" "),
          ).includes(q))
      );
    });
    if (sort === "priceAsc")
      r.sort((a, b) => Number(a.salePrice || 0) - Number(b.salePrice || 0));
    else if (sort === "priceDesc")
      r.sort((a, b) => Number(b.salePrice || 0) - Number(a.salePrice || 0));
    else if (sort === "yearDesc")
      r.sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
    else
      r.sort((a, b) =>
        String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
      );
    return r;
  }
  function filters() {
    const inv = K.snap.inventory || [],
      cnt = {
        all: 0,
        prep: 0,
        selling: 0,
        reserved: 0,
        delivered: 0,
        complete: 0,
      };
    for (const x of inv) {
      const s = state(x);
      if (
        [
          "販売準備",
          "販売準備完了",
          "販売中",
          "売約済み",
          "引渡し済み",
          "販売完了",
        ].includes(s)
      )
        cnt.all++;
      if (["販売準備", "販売準備完了"].includes(s)) cnt.prep++;
      if (s === "販売中") cnt.selling++;
      if (s === "売約済み") cnt.reserved++;
      if (s === "引渡し済み") cnt.delivered++;
      if (s === "販売完了") cnt.complete++;
    }
    K.$("#salesFilters").innerHTML = [
      ["selling", "販売中"],
      ["prep", "販売準備"],
      ["reserved", "売約済み"],
      ["delivered", "引渡し済み"],
      ["complete", "販売完了"],
      ["all", "すべて"],
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
          cnt[k] +
          "</button>",
      )
      .join("");
    K.$$("#salesFilters button").forEach(
      (b) =>
        (b.onclick = () => {
          filter = b.dataset.f;
          fulfillmentFilter = "";
          K.renderStore();
        }),
    );
  }
  async function existingSale(x) {
    const local = await KRDB.getSale(x.inventoryId).catch(() => null),
      remote =
        (K.snap.sales || []).find((s) => s.inventoryId === x.inventoryId) ||
        null;
    return Object.assign({}, remote || {}, local || {});
  }
  function fulfillmentKind(sale) {
    const o = String(sale?.deliveryOption || "");
    if (o === "pickup") return "pickup";
    if (o && o !== "pickup")
      return sale.fulfillmentAppointmentId ? "scheduled" : "deliveryPending";
    return "";
  }
  async function fulfillmentSummary() {
    const counts = { deliveryPending: 0, scheduled: 0, pickup: 0 },
      saleMap = new Map();
    for (const x of K.snap.inventory || []) {
      if (state(x) !== "売約済み") continue;
      const sale = await existingSale(x);
      saleMap.set(x.inventoryId, sale);
      const k = fulfillmentKind(sale);
      if (k) counts[k]++;
    }
    return { counts, saleMap };
  }
  function renderFulfillment(summary) {
    const box = K.$("#salesFulfillment");
    if (!box) return;
    const defs = [
      ["deliveryPending", "配送日時未設定"],
      ["scheduled", "配送予定あり"],
      ["pickup", "店頭引渡し待ち"],
    ];
    box.innerHTML = defs
      .map(
        ([k, l]) =>
          '<button data-k="' +
          k +
          '" class="' +
          (fulfillmentFilter === k ? "active" : "") +
          '"><span>' +
          l +
          "</span><b>" +
          summary.counts[k] +
          "</b></button>",
      )
      .join("");
    K.$$("#salesFulfillment button").forEach(
      (b) =>
        (b.onclick = () => {
          fulfillmentFilter =
            fulfillmentFilter === b.dataset.k ? "" : b.dataset.k;
          if (fulfillmentFilter) filter = "reserved";
          K.renderStore();
        }),
    );
  }
  function employeeButtons() {
    const box = K.$("#saleFlowEmployees");
    box.innerHTML = "";
    const me = K.inventoryCurrentMe ? K.inventoryCurrentMe() : null;
    if (!selectedEmployee && me) selectedEmployee = me;
    for (const e of K.snap.employees || []) {
      if (String(e.active).toLowerCase() === "false") continue;
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = e.name;
      b.classList.toggle(
        "current",
        selectedEmployee?.employeeId === e.employeeId,
      );
      b.onclick = () => {
        selectedEmployee = e;
        employeeButtons();
      };
      box.appendChild(b);
    }
  }
  async function openFlow(x) {
    activeItem = x;
    selectedEmployee = K.inventoryCurrentMe ? K.inventoryCurrentMe() : null;
    const s = state(x),
      sale = await existingSale(x);
    K.$("#saleFlowTitle").textContent =
      s === "売約済み" ? "引渡し完了" : "売約登録";
    K.$("#saleFlowSub").textContent =
      (x.inventoryNo || x.inventoryId) +
      " " +
      ([x.maker, x.model].filter(Boolean).join(" / ") || x.category || "");
    K.$("#saleCustomerName").value = sale.customerName || "";
    K.$("#saleActualPrice").value = String(sale.salePrice || x.salePrice || "");
    K.$("#saleFlowNote").value = sale.notes || "";
    K.$("#saveReserved").style.display =
      s === "売約済み" || s === "引渡し済み" ? "none" : "";
    K.$("#saveDelivered").style.display = s === "売約済み" ? "" : "none";
    employeeButtons();
    K.overlay("saleFlowModal").classList.add("on");
  }
  async function saveStage(stage) {
    if (!activeItem) return;
    const customer = K.$("#saleCustomerName").value.trim(),
      price = Number(K.digits(K.$("#saleActualPrice").value || 0));
    if (stage === "売約済み" && !customer) {
      alert("お客様名を入力してください。");
      return;
    }
    if (price <= 0) {
      alert("販売価格を入力してください。");
      return;
    }
    if (!selectedEmployee) {
      alert("担当者を選択してください。");
      return;
    }
    const prev = await existingSale(activeItem),
      now = new Date().toISOString(),
      id = "PROC-" + activeItem.inventoryId + "-" + Date.now(),
      next = stage === "売約済み" ? "引渡し日時を確認" : "完了",
      sale = {
        inventoryId: activeItem.inventoryId,
        inventoryNo: activeItem.inventoryNo || "",
        saleId: prev.saleId || "SALE-" + activeItem.inventoryId,
        status: stage,
        customerName: customer || prev.customerName || "",
        salePrice: price,
        employeeId: selectedEmployee.employeeId,
        employeeName: selectedEmployee.name,
        reservedAt:
          stage === "売約済み" ? prev.reservedAt || now : prev.reservedAt || "",
        soldAt: stage === "売約済み" ? prev.soldAt || now : prev.soldAt || "",
        deliveredAt: stage === "引渡し済み" ? now : prev.deliveredAt || "",
        notes: K.$("#saleFlowNote").value.trim(),
        storageLocation: activeItem.storageLocation || "",
        ecTitle: prev.ecTitle || "",
        ecDescription: prev.ecDescription || "",
        ecStatus: "非公開",
        updatedAt: now,
        processLogId: id,
        nextAction: next,
      };
    await KRDB.putSale(sale);
    const log = {
      id,
      logId: id,
      inventoryId: activeItem.inventoryId,
      inventoryNo: activeItem.inventoryNo || "",
      stage,
      stageLabel: stage,
      employeeId: selectedEmployee.employeeId,
      employeeName: selectedEmployee.name,
      completedAt: now,
      source: "NEXT",
      idempotencyKey: id,
      note: sale.notes,
      nextAction: next,
    };
    await KRDB.putProcess(log);
    activeItem.stage = stage;
    activeItem.salePrice = price;
    activeItem.assignedEmployeeId = selectedEmployee.name;
    activeItem.updatedAt = now;
    activeItem.nextAction = next;
    if (K.recordInventoryProcessLocal) K.recordInventoryProcessLocal(log);
    await (window.KRAPI
      ? KRAPI.run("inventory-sale-update", activeItem.inventoryId, sale)
      : KRDB.enqueue({
          id: "sync-" + id,
          operation: "inventory-sale-update",
          entityId: activeItem.inventoryId,
          payload: sale,
          status: "pending",
          attempts: 0,
          createdAt: now,
        }));
    K.overlay("saleFlowModal").classList.remove("on");
    K.renderStore();
    K.renderHome && K.renderHome();
  }
  async function archiveItem(x) {
    const me = K.inventoryCurrentMe ? K.inventoryCurrentMe() : null;
    if (!me) {
      alert("在庫画面で「自分」を設定してください。");
      return;
    }
    if (
      !confirm(
        (x.inventoryNo || "この商品") + "を販売完了にしてアーカイブしますか？",
      )
    )
      return;
    const prev = await existingSale(x),
      now = new Date().toISOString(),
      id = "PROC-" + x.inventoryId + "-" + Date.now(),
      sale = {
        ...prev,
        inventoryId: x.inventoryId,
        inventoryNo: x.inventoryNo || "",
        saleId: prev.saleId || "SALE-" + x.inventoryId,
        status: "販売完了",
        ecStatus: "非公開",
        employeeId: me.employeeId,
        employeeName: me.name,
        archivedAt: now,
        updatedAt: now,
        processLogId: id,
        nextAction: "アーカイブ済み",
      };
    await KRDB.putSale(sale);
    const log = {
      id,
      logId: id,
      inventoryId: x.inventoryId,
      inventoryNo: x.inventoryNo || "",
      stage: "販売完了",
      stageLabel: "販売完了",
      employeeId: me.employeeId,
      employeeName: me.name,
      completedAt: now,
      source: "NEXT",
      idempotencyKey: id,
      note: sale.notes || "販売完了アーカイブ",
      nextAction: "アーカイブ済み",
    };
    await KRDB.putProcess(log);
    x.stage = "販売完了";
    x.assignedEmployeeId = me.name;
    x.updatedAt = now;
    x.archivedAt = now;
    x.nextAction = "アーカイブ済み";
    if (K.recordInventoryProcessLocal) K.recordInventoryProcessLocal(log);
    await (window.KRAPI
      ? KRAPI.run("inventory-archive", x.inventoryId, {
          ...sale,
          archivedAt: now,
        })
      : KRDB.enqueue({
          id: "sync-" + id,
          operation: "inventory-archive",
          entityId: x.inventoryId,
          payload: { ...sale, archivedAt: now },
          status: "pending",
          attempts: 0,
          createdAt: now,
        }));
    K.renderStore();
    K.renderInventory && K.renderInventory();
    K.renderHome && K.renderHome();
  }
  K.renderStore = async () => {
    if (!K.$("#salesList")) return;
    filters();
    const summary = await fulfillmentSummary();
    renderFulfillment(summary);
    let r = rows();
    if (fulfillmentFilter) {
      const selected = [];
      for (const x of r) {
        const sale =
          summary.saleMap.get(x.inventoryId) || (await existingSale(x));
        if (fulfillmentKind(sale) === fulfillmentFilter) selected.push(x);
      }
      r = selected;
    }
    K.$("#salesCount").textContent = r.length + "件";
    const list = K.$("#salesList");
    list.innerHTML = "";
    if (!r.length) {
      list.innerHTML = '<div class="salesEmpty">対象商品はありません</div>';
      return;
    }
    for (const x of r) {
      const c = document.createElement("article"),
        s = state(x),
        sale = summary.saleMap.get(x.inventoryId) || (await existingSale(x));
      c.className = "salesCard";
      const deliveryOption = String(sale.deliveryOption || ""),
        isDelivery = deliveryOption && deliveryOption !== "pickup",
        deliveryLabel =
          deliveryOption === "pickup"
            ? "店頭受取"
            : deliveryOption === "nagareyama"
              ? "流山市内配送"
              : deliveryOption === "kashiwa"
                ? "柏市内配送"
                : deliveryOption
                  ? "配送"
                  : "";
      let action = '<button class="primary detail">在庫詳細</button>';
      if (s === "販売中")
        action =
          '<button class="detail">在庫詳細</button><button class="reserve">売約登録</button>';
      else if (s === "売約済み")
        action = isDelivery
          ? sale.fulfillmentAppointmentId
            ? '<button class="detail">在庫詳細</button><button class="deliveryScheduled">配送予定あり</button><button class="deliver">引渡し完了</button>'
            : '<button class="detail">在庫詳細</button><button class="scheduleDelivery">配送予定</button><button class="deliver">引渡し完了</button>'
          : '<button class="detail">在庫詳細</button><button class="deliver pickupDeliver">店頭引渡し</button>';
      else if (s === "引渡し済み")
        action =
          '<button class="detail">在庫詳細</button><button class="archive">販売完了</button>';
      else if (s === "販売完了")
        action =
          '<button class="detail">在庫詳細</button><button class="archived" disabled>アーカイブ済み</button>';
      else if (["販売準備", "販売準備完了"].includes(s))
        action =
          '<button class="detail">在庫詳細</button><button class="primary prep">販売準備</button>';
      const contact = [sale.customerPhone, sale.customerEmail]
          .filter(Boolean)
          .join(" / "),
        fulfillment = [deliveryLabel, sale.shippingAddress]
          .filter(Boolean)
          .join(" / ");
      const orderInfo =
        ["売約済み", "引渡し済み", "販売完了"].includes(s) &&
        (sale.customerName || sale.notes || fulfillment)
          ? '<div class="salesOrderInfo"><b>' +
            K.esc(sale.customerName || "購入者未登録") +
            "</b>" +
            (fulfillment
              ? '<span class="fulfillmentLine">' +
                K.esc(fulfillment) +
                "</span>"
              : "") +
            (contact ? "<span>" + K.esc(contact) + "</span>" : "") +
            (sale.notes ? "<span>" + K.esc(sale.notes) + "</span>" : "") +
            (sale.employeeName
              ? "<small>担当 " + K.esc(sale.employeeName) + "</small>"
              : "") +
            "</div>"
          : "";
      const ecInfo =
        s === "販売中" && sale.ecStatus
          ? '<span class="salesEcBadge ' +
            (sale.ecStatus === "公開" ? "published" : "") +
            '">EC ' +
            K.esc(sale.ecStatus) +
            "</span>"
          : "";
      c.innerHTML =
        '<div class="salesTop"><div><b>' +
        K.esc(x.inventoryNo || x.inventoryId) +
        "</b><span>" +
        K.esc(s) +
        '</span></div><div class="salesPrice">¥' +
        Number(sale.salePrice || x.salePrice || 0).toLocaleString() +
        '</div></div><div class="salesName">' +
        K.esc([x.maker, x.model].filter(Boolean).join(" / ") || x.category) +
        '</div><div class="salesMeta">' +
        K.esc([x.category, x.year, x.spec].filter(Boolean).join(" ・ ")) +
        ecInfo +
        "</div>" +
        orderInfo +
        '<div class="salesActions">' +
        action +
        "</div>";
      c.querySelector(".detail").onclick = () =>
        K.openInventoryDetail && K.openInventoryDetail(x);
      const reserve = c.querySelector(".reserve");
      if (reserve) reserve.onclick = () => openFlow(x);
      const deliveryScheduled = c.querySelector(".deliveryScheduled");
      if (deliveryScheduled)
        deliveryScheduled.onclick = () =>
          K.openAppointmentById
            ? K.openAppointmentById(sale.fulfillmentAppointmentId)
            : K.openTab("schedule");
      const scheduleDelivery = c.querySelector(".scheduleDelivery");
      if (scheduleDelivery)
        scheduleDelivery.onclick = () => {
          const siblings = sale.checkoutId
            ? (K.snap.sales || []).filter(
                (z) => String(z.checkoutId || "") === String(sale.checkoutId),
              )
            : [];
          const inventoryNos = (siblings.length ? siblings : [sale])
            .map((z) => z.inventoryNo)
            .filter(Boolean);
          if (!inventoryNos.includes(x.inventoryNo || ""))
            inventoryNos.push(x.inventoryNo || x.inventoryId);
          const notes = ["EC注文", inventoryNos.join("・"), sale.notes]
            .filter(Boolean)
            .join(" / ");
          const ref = sale.checkoutId || sale.saleId || "SALE-" + x.inventoryId;
          if (K.openAppointmentFromCase)
            K.openAppointmentFromCase({
              caseId: "",
              ref: ref,
              name: sale.customerName || "EC購入",
              phone: sale.customerPhone || "",
              address: sale.shippingAddress || "",
              category: "配送",
              notes: notes,
            });
          else K.openTab("schedule");
        };
      const deliver = c.querySelector(".deliver");
      if (deliver) deliver.onclick = () => openFlow(x);
      const prep = c.querySelector(".prep");
      if (prep)
        prep.onclick = () => K.openInventoryDetail && K.openInventoryDetail(x);
      const archive = c.querySelector(".archive");
      if (archive) archive.onclick = () => archiveItem(x);
      list.appendChild(c);
    }
  };
  K.$("#salesSearch").oninput = (e) => {
    query = e.target.value;
    clearTimeout(window.__salesT);
    window.__salesT = setTimeout(K.renderStore, 100);
  };
  K.$("#salesSort").onchange = (e) => {
    sort = e.target.value;
    K.renderStore();
  };
  const shop = K.$("#openPublicShop");
  if (shop) shop.onclick = () => window.open("./shop/", "_blank", "noopener");
  K.$("#saveReserved").onclick = () => saveStage("売約済み");
  K.$("#saveDelivered").onclick = () => saveStage("引渡し済み");
  window.addEventListener("kr-next-appointment-saved", async (e) => {
    const a = e.detail || {},
      ref = String(a.sourceRef || "");
    if (!ref) return;
    const local = await KRDB.listSales().catch(() => []);
    const targets = local.filter(
      (s) =>
        String(s.saleId || "") === ref || String(s.checkoutId || "") === ref,
    );
    for (const s of targets) {
      s.fulfillmentAppointmentId = a.appointmentId;
      s.updatedAt = new Date().toISOString();
      await KRDB.putSale(s);
    }
    for (const s of K.snap.sales || []) {
      if (String(s.saleId || "") === ref || String(s.checkoutId || "") === ref)
        s.fulfillmentAppointmentId = a.appointmentId;
    }
    K.renderStore && K.renderStore();
    K.renderHomeFulfillment && K.renderHomeFulfillment();
  });
  K.openSalesFulfillment = (k) => {
    fulfillmentFilter = k || "";
    if (fulfillmentFilter) filter = "reserved";
    K.openTab("store");
    K.renderStore();
  };
  K.getSaleRecord = existingSale;
})();
