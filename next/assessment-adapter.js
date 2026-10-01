(() => {
  const ENDPOINT = "https://script.google.com/macros/s/AKfycbyna99PhsT4kx3gFNsUYY3QJwY2C6aMJrx0bP4eSq2wVMJxbfCa6M0sr5I0DV2w20OP/exec";
  const BRIDGE_URL = ENDPOINT + "?action=bridge";
  const TOKEN_KEY = "kr-next-assessment-session";
  const OCR_TOKEN_KEY = "kr-next-ocr-session";
  const pending = new Map();
  let initPromise = null;
  let bridgeFrame = null;
  let bridgeReady = false;
  let bridgePromise = null;
  let bridgeResolve = null;

  function hasSession() {
    return Boolean(localStorage.getItem(TOKEN_KEY));
  }

  function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const params = new URLSearchParams(String(location.hash || "").replace(/^#/, ""));
      const deviceToken = params.get("connect") || "";
      if (!deviceToken) {
        const warmBridge = () => ensureBridge().catch(() => {});
        if ("requestIdleCallback" in window)
          requestIdleCallback(warmBridge, { timeout: 3000 });
        else setTimeout(warmBridge, 1200);
        return hasSession();
      }
      try {
        const result = await request("claim-device-link", { token: deviceToken });
        saveSession(result);
        history.replaceState(null, "", location.pathname + location.search);
        dispatchEvent(new CustomEvent("kr-assessment-connected"));
        return true;
      } catch (error) {
        sessionStorage.setItem("kr-next-device-link-error", String(error.message || error));
        history.replaceState(null, "", location.pathname + location.search);
        return false;
      }
    })();
    return initPromise;
  }

  function allowedOrigin(origin) {
    if (origin === "null") return true;
    try {
      const host = new URL(origin).hostname;
      return host === "script.google.com" || host.endsWith(".googleusercontent.com");
    } catch {
      return false;
    }
  }

  addEventListener("message", (event) => {
    const data = event.data || {};
    if (
      data.type === "kr-assessment-adapter-ready" &&
      allowedOrigin(event.origin) &&
      bridgeFrame &&
      event.source === bridgeFrame.contentWindow
    ) {
      bridgeReady = true;
      bridgeResolve?.(true);
      return;
    }
    if (data.type !== "kr-assessment-adapter-response" || !data.requestId) return;
    const item = pending.get(data.requestId);
    if (!item) return;
    if (!allowedOrigin(event.origin) || data.channel !== item.channel) return;
    if (
      item.transport === "bridge" &&
      (!bridgeFrame || event.source !== bridgeFrame.contentWindow)
    )
      return;
    clearTimeout(item.timer);
    pending.delete(data.requestId);
    item.form?.remove();
    item.frame?.remove();
    data.error ? item.reject(new Error(data.error)) : item.resolve(data.result);
  });

  function resetBridge() {
    bridgeFrame?.remove();
    bridgeFrame = null;
    bridgeReady = false;
    bridgePromise = null;
    bridgeResolve = null;
  }

  function ensureBridge(timeout = 4500) {
    if (bridgeReady && bridgeFrame?.contentWindow) return Promise.resolve(true);
    if (!bridgePromise) {
      bridgePromise = new Promise((resolve) => {
        bridgeResolve = resolve;
      });
      bridgeFrame = document.createElement("iframe");
      bridgeFrame.title = "査定高速接続";
      bridgeFrame.setAttribute("aria-hidden", "true");
      bridgeFrame.style.cssText =
        "position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;border:0";
      bridgeFrame.src = BRIDGE_URL + "&_=" + Date.now();
      document.body.appendChild(bridgeFrame);
    }
    return Promise.race([
      bridgePromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("ASSESSMENT_BRIDGE_NOT_READY")), timeout),
      ),
    ]);
  }

  function requestMeta(operation, payload, tokenOverride) {
    const requestId = "ass-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    const channel = crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now();
    return {
      requestId,
      channel,
      operation,
      token:
        tokenOverride === undefined
          ? localStorage.getItem(TOKEN_KEY) || ""
          : tokenOverride,
      payload: payload || {},
    };
  }

  function requestBridge(operation, payload, timeout, tokenOverride) {
    const message = requestMeta(operation, payload, tokenOverride);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(message.requestId);
        resetBridge();
        reject(new Error("査定サーバーから応答がありません"));
      }, timeout);
      pending.set(message.requestId, {
        resolve,
        reject,
        timer,
        channel: message.channel,
        transport: "bridge",
      });
      bridgeFrame.contentWindow.postMessage(
        { type: "kr-assessment-adapter-request", ...message },
        "*",
      );
    });
  }

  function requestPost(operation, payload, timeout, tokenOverride) {
    const message = requestMeta(operation, payload, tokenOverride);
    return new Promise((resolve, reject) => {
      const target = "kr-assessment-" + message.requestId;
      const frame = document.createElement("iframe");
      frame.name = target;
      frame.title = "査定安全接続";
      frame.setAttribute("aria-hidden", "true");
      frame.style.cssText = "position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;border:0";
      const form = document.createElement("form");
      form.method = "post";
      form.action = ENDPOINT;
      form.target = target;
      form.style.display = "none";
      const fields = {
        ...message,
        payload: JSON.stringify(message.payload),
      };
      Object.entries(fields).forEach(([name, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      });
      document.body.append(frame, form);
      const timer = setTimeout(() => {
        pending.delete(message.requestId);
        form.remove();
        frame.remove();
        reject(new Error("査定サーバーから応答がありません"));
      }, timeout);
      pending.set(message.requestId, {
        resolve,
        reject,
        timer,
        form,
        frame,
        channel: message.channel,
        transport: "post",
      });
      form.submit();
    });
  }

  async function request(operation, payload, timeout = 30000, tokenOverride) {
    try {
      await ensureBridge();
    } catch {
      return requestPost(operation, payload, timeout, tokenOverride);
    }
    return requestBridge(operation, payload, timeout, tokenOverride);
  }

  async function pair(code) {
    const result = await request("pair", { code: String(code || "") });
    saveSession(result);
    return result;
  }

  function saveSession(result) {
    if (!result?.token) throw new Error("接続情報を保存できませんでした");
    localStorage.setItem(TOKEN_KEY, result.token);
  }

  async function createDeviceLink() {
    const result = await request("create-device-link", {});
    if (!result?.deviceToken) throw new Error("端末追加リンクを作成できませんでした");
    const url = new URL(location.href);
    url.hash = "connect=" + encodeURIComponent(result.deviceToken);
    return { ...result, url: url.toString() };
  }

  async function claimLink(value) {
    const raw = String(value || "").trim();
    let token = raw;
    try {
      const url = new URL(raw, location.href);
      token =
        new URLSearchParams(String(url.hash || "").replace(/^#/, "")).get("connect") ||
        url.searchParams.get("connect") ||
        (/^[A-Za-z0-9]+$/.test(raw) ? raw : "");
    } catch {}
    token = token.replace(/[^A-Za-z0-9]/g, "");
    if (!token) throw new Error("接続リンクをコピーしてください");
    const result = await request("claim-device-link", { token });
    saveSession(result);
    dispatchEvent(new CustomEvent("kr-assessment-connected"));
    return result;
  }

  function clear() {
    localStorage.removeItem(TOKEN_KEY);
  }

  async function ensureOcrSession() {
    const stored = localStorage.getItem(OCR_TOKEN_KEY) || "";
    if (stored) return stored;
    const result = await request("ocr-bootstrap", {}, 30000, "");
    if (!result?.token) throw new Error("OCR接続情報を保存できませんでした");
    localStorage.setItem(OCR_TOKEN_KEY, result.token);
    return result.token;
  }

  async function run(operation, payload) {
    if (operation === "label-ocr" || operation === "label-ocr-status") {
      let token = await ensureOcrSession();
      try {
        return await request(
          operation,
          payload,
          operation === "label-ocr" ? 65000 : 30000,
          token,
        );
      } catch (error) {
        if (!/SESSION_EXPIRED/.test(String(error?.message || error))) throw error;
        localStorage.removeItem(OCR_TOKEN_KEY);
        token = await ensureOcrSession();
        return request(
          operation,
          payload,
          operation === "label-ocr" ? 65000 : 30000,
          token,
        );
      }
    }
    return request(
      operation,
      payload,
      operation === "green-write" ? 120000 : 30000,
    );
  }

  window.KRAssessmentAdapter = {
    init,
    pair,
    createDeviceLink,
    claimLink,
    clear,
    hasSession,
    getCase: (id) => request("case", { id }),
    run,
  };
  addEventListener("DOMContentLoaded", () => setTimeout(init, 0));
})();
