(() => {
  const ENDPOINT = "https://script.google.com/macros/s/AKfycbyna99PhsT4kx3gFNsUYY3QJwY2C6aMJrx0bP4eSq2wVMJxbfCa6M0sr5I0DV2w20OP/exec";
  const TOKEN_KEY = "kr-next-assessment-session";
  const pending = new Map();
  let initPromise = null;

  function hasSession() {
    return Boolean(localStorage.getItem(TOKEN_KEY));
  }

  function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const params = new URLSearchParams(String(location.hash || "").replace(/^#/, ""));
      const deviceToken = params.get("connect") || "";
      if (!deviceToken) return hasSession();
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
    if (data.type !== "kr-assessment-adapter-response" || !data.requestId) return;
    const item = pending.get(data.requestId);
    if (!item) return;
    if (!allowedOrigin(event.origin) || data.channel !== item.channel) return;
    clearTimeout(item.timer);
    pending.delete(data.requestId);
    item.form.remove();
    item.frame.remove();
    data.error ? item.reject(new Error(data.error)) : item.resolve(data.result);
  });

  function request(operation, payload, timeout = 30000) {
    const requestId = "ass-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    const channel = crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now();
    return new Promise((resolve, reject) => {
      const target = "kr-assessment-" + requestId;
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
        requestId,
        channel,
        operation,
        token: localStorage.getItem(TOKEN_KEY) || "",
        payload: JSON.stringify(payload || {}),
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
        pending.delete(requestId);
        form.remove();
        frame.remove();
        reject(new Error("査定サーバーから応答がありません"));
      }, timeout);
      pending.set(requestId, { resolve, reject, timer, form, frame, channel });
      form.submit();
    });
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

  function clear() {
    localStorage.removeItem(TOKEN_KEY);
  }

  window.KRAssessmentAdapter = {
    init,
    pair,
    createDeviceLink,
    clear,
    hasSession,
    getCase: (id) => request("case", { id }),
    run: (operation, payload) => request(operation, payload, operation === "label-ocr" ? 65000 : 30000),
  };
  addEventListener("DOMContentLoaded", () => setTimeout(init, 0));
})();
