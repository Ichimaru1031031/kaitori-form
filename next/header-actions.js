(() => {
  const K = window.KRN;
  if (!K) return;
  let qrLibraryPromise = null;
  function notice(message) {
    K.$("#headerQrNotice")?.remove();
    const el = document.createElement("div");
    el.id = "headerQrNotice";
    el.className = "headerQrNotice";
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }
  function loadQrLibrary() {
    if (window.jsQR) return Promise.resolve(window.jsQR);
    if (qrLibraryPromise) return qrLibraryPromise;
    qrLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
      script.onload = () => (window.jsQR ? resolve(window.jsQR) : reject(new Error("QR_LIBRARY_UNAVAILABLE")));
      script.onerror = () => reject(new Error("QR_LIBRARY_LOAD_FAILED"));
      document.head.appendChild(script);
    });
    return qrLibraryPromise;
  }
  async function qrText(file) {
    let source = null,
      objectUrl = "";
    try {
      if ("createImageBitmap" in window) source = await createImageBitmap(file);
      else {
        objectUrl = URL.createObjectURL(file);
        source = await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = objectUrl;
        });
      }
      if ("BarcodeDetector" in window) {
        try {
          const detector = new BarcodeDetector({ formats: ["qr_code"] });
          const codes = await detector.detect(source);
          if (codes[0]?.rawValue) return codes[0].rawValue;
        } catch {}
      }
      const width = source.width || source.naturalWidth,
        height = source.height || source.naturalHeight,
        scale = Math.min(1, 1800 / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const jsQR = await loadQrLibrary();
      const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
      if (!code?.data) throw new Error("QR_NOT_FOUND");
      return code.data;
    } finally {
      source.close?.();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }
  function inventoryKey(text) {
    const raw = String(text || "").trim();
    try {
      const url = new URL(raw, location.href);
      return url.searchParams.get("inventory") || url.searchParams.get("inventoryId") || url.searchParams.get("inventoryNo") || url.searchParams.get("qr") || raw;
    } catch {
      return raw;
    }
  }
  async function openInventoryFromQr(text) {
    const key = inventoryKey(text);
    notice("在庫情報を確認しています…");
    try {
      const live = await KRAPI.getSnapshot();
      if (live?.inventory) K.snap = live;
    } catch {}
    const normalized = K.norm(key);
    const item = (K.snap.inventory || []).find((x) =>
      [x.inventoryId, x.inventoryNo, x.qrToken].some((value) => K.norm(value) === normalized),
    );
    if (!item) throw new Error("INVENTORY_NOT_FOUND");
    K.openTab("inventory");
    await K.openInventoryDetail?.(item);
    K.$("#headerQrNotice")?.remove();
  }
  const input = K.$("#headerQrInput");
  K.$("#headerQrScan").onclick = () => input.click();
  input.onchange = async () => {
    try {
      const file = input.files?.[0];
      if (!file) return;
      notice("QRコードを読み取っています…");
      await openInventoryFromQr(await qrText(file));
    } catch (error) {
      notice(String(error?.message || error).includes("INVENTORY_NOT_FOUND") ? "該当する在庫が見つかりません" : "QRを読み取れませんでした。明るい場所で撮り直してください");
    } finally {
      input.value = "";
    }
  };
  K.$("#headerNewSlip").onclick = () => K.openSlip?.(null);
  K.$("#settingsQuick").onclick = () => K.overlay("drawer").classList.add("on");
})();
