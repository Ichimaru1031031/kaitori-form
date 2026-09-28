(() => {
  const K = window.KRN;
  let filter = "all",
    query = "",
    loaded = false;
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
    };
  }
  function group(x) {
    if (/キャンセル/.test(x.status)) return "cancel";
    if (/新規/.test(x.status)) return "new";
    if (/確定|訪問予定/.test(x.status)) return "confirmed";
    if (K.needsReply(x)) return "reply";
    return "other";
  }
  function bindFilters() {
    const counts = { all: 0, new: 0, reply: 0, confirmed: 0, cancel: 0 };
    K.casesNow()
      .map(normCase)
      .forEach((x) => {
        counts.all++;
        const g = group(x);
        if (counts[g] != null) counts[g]++;
      });
    K.$("#assessmentFilters").innerHTML = [
      ["all", "全て"],
      ["new", "新規"],
      ["reply", "要返信"],
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
  K.renderAssessment = async () => {
    await ensureCustomers();
    if (!K.$("#assessmentList")) return;
    bindFilters();
    const q = K.norm(query);
    let rows = K.casesNow()
      .map(normCase)
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
    const list = K.$("#assessmentList");
    list.innerHTML = "";
    if (!rows.length) {
      list.innerHTML = '<div class="empty">対象案件はありません</div>';
      return;
    }
    rows.forEach((x) => {
      const c = document.createElement("article");
      c.className = "assessmentCard";
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
        '</div><div class="assessmentActions">' +
        (tel
          ? '<a href="' + tel + '">☎ TEL</a>'
          : "<button disabled>☎ TEL</button>") +
        '<button class="schedule">訪問予定</button><button class="blue">現行で対応</button><button class="next">NEXT伝票</button></div>';
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
      c.querySelector(".blue").onclick = () => K.openBlue("assessment");
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
})();
