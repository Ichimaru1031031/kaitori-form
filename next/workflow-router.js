(() => {
  const K = window.KRN,
    oldStart = K.startBridge;
  K.openTab = (tab) => {
    if (tab === "home") {
      K.screen("home");
      K.setNav("home");
      return;
    }
    const native = {
      schedule: ["scheduleView", "renderCalendar"],
      assessment: ["assessmentView", "renderAssessment"],
      slips: ["slipsView", "renderSlips"],
      inventory: ["inventoryView", "renderInventory"],
      recycle: ["recycleView", "renderRecycle"],
      store: ["storeView", "renderStore"],
    }[tab];
    if (native) {
      K.screen(native[0]);
      K.setNav(tab);
      K[native[1]] && K[native[1]]();
      return;
    }
    K.openBlue(tab);
  };
  K.loadSnapshot = async () => {
    try {
      let live = null;
      if (
        window.KRAPI &&
        (KRAPI.apiUrl() || KRAPI.hasProtectedAdapter?.())
      ) {
        try {
          live = await KRAPI.getSnapshot();
        } catch (_e) {
          live = null;
        }
      }
      if (live && Array.isArray(live.inventory)) {
        K.snap = live;
        K.customers = live.customers || [];
      } else {
        const [a, b] = await Promise.all([
          fetch("./data/snapshot.json?_=" + Date.now(), { cache: "no-store" }),
          fetch("./data/customers.json?_=" + Date.now(), { cache: "no-store" }),
        ]);
        if (!a.ok) throw Error(a.status);
        K.snap = await a.json();
        if (b.ok) {
          const j = await b.json();
          K.customers = j.customers || [];
        }
      }
      const t = new Date(K.snap.generatedAt),
        label =
          (live ? "ライブ " : "同期 ") +
          t.toLocaleString("ja-JP", {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
      ["scheduleSync", "inventorySync", "assessmentSync", "slipsSync"].forEach(
        (id) => {
          const e = K.$("#" + id);
          if (e) e.textContent = label + (live ? "・Green" : "・読取専用");
        },
      );
      K.renderHome();
      [
        "renderCalendar",
        "renderAssessment",
        "renderSlips",
        "renderInventory",
        "renderStore",
      ].forEach((f) => K[f] && K[f]());
    } catch (e) {
      ["scheduleSync", "inventorySync", "assessmentSync", "slipsSync"].forEach(
        (id) => {
          const x = K.$("#" + id);
          if (x) x.textContent = "Green読込失敗・現行へ切替可能";
        },
      );
      K.renderHome();
    }
  };
  K.startBridge = () => {
    oldStart();
    setInterval(() => {
      const v = K.$("#assessmentView");
      if (v && v.classList.contains("active") && K.renderAssessment)
        K.renderAssessment();
    }, 2500);
  };
})();
