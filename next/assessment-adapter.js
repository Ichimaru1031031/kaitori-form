(() => {
  const URL = "https://script.google.com/macros/s/AKfycbyna99PhsT4kx3gFNsUYY3QJwY2C6aMJrx0bP4eSq2wVMJxbfCa6M0sr5I0DV2w20OP/exec?action=bridge";
  const TOKEN_KEY = "kr-next-assessment-session";
  let frame;
  let ready;
  let resolveReady;
  const pending = new Map();

  function init() {
    if (frame) return ready;
    ready = new Promise((resolve) => (resolveReady = resolve));
    frame = document.createElement("iframe");
    frame.title = "査定安全接続";
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;border:0";
    frame.src = URL + "&_=" + Date.now();
    document.body.appendChild(frame);
    return ready;
  }

  function allowedOrigin(origin) {
    try {
      const host = new URL(origin).hostname;
      return host === "script.google.com" || host.endsWith(".googleusercontent.com");
    } catch {
      return false;
    }
  }

  addEventListener("message", (event) => {
    if (!allowedOrigin(event.origin)) return;
    const data = event.data || {};
    if (data.type === "kr-assessment-adapter-ready") {
      resolveReady?.(true);
      return;
    }
    if (data.type !== "kr-assessment-adapter-response" || !data.requestId) return;
    const item = pending.get(data.requestId);
    if (!item) return;
    clearTimeout(item.timer);
    pending.delete(data.requestId);
    data.error ? item.reject(new Error(data.error)) : item.resolve(data.result);
  });

  async function request(operation, payload, timeout = 20000) {
    await Promise.race([
      init(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("接続に時間がかかっています")), 12000)),
    ]);
    const requestId = "ass-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("査定サーバーから応答がありません"));
      }, timeout);
      pending.set(requestId, { resolve, reject, timer });
      frame.contentWindow.postMessage(
        {
          type: "kr-assessment-adapter-request",
          requestId,
          operation,
          token: localStorage.getItem(TOKEN_KEY) || "",
          payload: payload || {},
        },
        "*",
      );
    });
  }

  async function pair(code) {
    const result = await request("pair", { code: String(code || "") });
    if (!result?.token) throw new Error("接続情報を保存できませんでした");
    localStorage.setItem(TOKEN_KEY, result.token);
    return result;
  }

  function clear() {
    localStorage.removeItem(TOKEN_KEY);
  }

  window.KRAssessmentAdapter = {
    init,
    pair,
    clear,
    hasSession: () => Boolean(localStorage.getItem(TOKEN_KEY)),
    getCase: (id) => request("case", { id }),
    run: (operation, payload) => request(operation, payload, 30000),
  };
  addEventListener("DOMContentLoaded", () => setTimeout(init, 0));
})();
