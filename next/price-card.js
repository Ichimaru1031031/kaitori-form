(() => {
  const K = window.KRN;
  if (!K) return;
  let item = null,
    template = "premium";

  const value = (id) => K.$("#" + id)?.value.trim() || "";
  const price = () => Number(K.digits(value("priceCardPrice"))) || 0;
  const fitClass = (text, medium = 18, long = 28) =>
    String(text || "").length > long
      ? " fitSmall"
      : String(text || "").length > medium
        ? " fitMedium"
        : "";
  const displayYear = (year) => {
    const raw = String(year || "").trim();
    if (!raw || /不明/.test(raw)) return "年式不明";
    return raw.includes("年") ? raw : raw + "年製";
  };
  const descriptionLine = (description, label) => {
    const line = String(description || "")
      .split(/\n+/)
      .find((row) => row.trim().startsWith(label));
    return line ? line.replace(new RegExp("^" + label + "\\s*[→:：]?\\s*"), "").trim() : "";
  };
  const suggestedModel = (raw) => {
    const text = String(raw || "").trim();
    if (text.length <= 32) return text;
    const tokens = [...text.matchAll(/[A-Z0-9][A-Z0-9().\/-]{3,}/gi)]
      .map((match) => ({ token: match[0], index: match.index || 0 }))
      .filter(({ token, index }) => {
        const before = text.slice(Math.max(0, index - 3), index);
        return (
          /[A-Z]/i.test(token) &&
          /\d/.test(token) &&
          !/^20\d{2}$/.test(token) &&
          !/^\d+(?:\.\d+)?(?:KG|L|V|K)$/.test(token) &&
          !/管理$/.test(before) &&
          !/^KR[A-Z]?\d+$/i.test(token)
        );
      });
    const preferred = tokens.find(({ token }) => token.includes("-"));
    return preferred?.token || tokens[0]?.token || text;
  };

  function cardMarkup() {
    const maker = value("priceCardMaker") || "メーカー不明",
      model = value("priceCardModel") || "型番不明",
      category = value("priceCardCategory") || "リユース家電",
      year = displayYear(value("priceCardYear")),
      spec = item?.spec || "詳しい状態はスタッフまで",
      condition = value("priceCardCondition") || spec,
      catchText = value("priceCardCatch"),
      note = value("priceCardNote"),
      warranty = value("priceCardWarranty"),
      money = price().toLocaleString(),
      inventoryNo = item?.inventoryNo || item?.inventoryId || "";
    return (
      '<div class="pcBrand"><b>買取レスキュー</b><small>中古家電専門店</small></div>' +
      '<span class="pcCategory">' + K.esc(category) + "</span>" +
      '<div class="pcCatch">' + K.esc(catchText) + "</div>" +
      '<div class="pcMaker' + fitClass(maker, 15, 25) + '">' + K.esc(maker) + "</div>" +
      '<div class="pcModel' + fitClass(model, 16, 27) + '">' + K.esc(model) + "</div>" +
      '<div class="pcFacts"><span><small>年式</small><b>' + K.esc(year) +
      '</b></span><span><small>仕様</small><b>' + K.esc(spec) + "</b></span></div>" +
      '<div class="pcCondition">' + K.esc(condition) + "</div>" +
      (note ? '<div class="pcNote">' + K.esc(note) + "</div>" : "") +
      '<div class="pcFooter"><div><small>店頭販売価格・税込</small><b class="pcWarranty">' +
      K.esc(warranty) + '</b><em>' + K.esc(inventoryNo) +
      '</em></div><strong class="pcPrice"><i>¥</i>' + money + "</strong></div>"
    );
  }

  function render() {
    const preview = K.$("#priceCardPreview");
    if (!preview || !item) return;
    preview.className = "priceCard " + template;
    preview.innerHTML = cardMarkup();
    K.$$("#priceCardTemplates button").forEach((button) =>
      button.classList.toggle("active", button.dataset.template === template),
    );
  }

  function close() {
    K.overlay("priceCardModal").classList.remove("on");
  }

  K.openPriceCard = (source) => {
    item = { ...source };
    template = "premium";
    const description = source.description || "",
      state = descriptionLine(description, "商品状態"),
      accessories = descriptionLine(description, "付属品"),
      warranty = descriptionLine(description, "保証");
    K.$("#priceCardCatch").value = /清掃|クリーニング/.test(description)
      ? "清掃・動作確認済み"
      : "安心して選べるリユース家電";
    K.$("#priceCardNote").value = source.spec || "";
    K.$("#priceCardCategory").value = source.category || "";
    K.$("#priceCardMaker").value = source.maker || "";
    K.$("#priceCardModel").value = suggestedModel(source.model || "");
    K.$("#priceCardYear").value = source.year || "";
    K.$("#priceCardPrice").value = String(source.salePrice || "");
    K.$("#priceCardWarranty").value = warranty || "動作保証あり";
    K.$("#priceCardCondition").value =
      source.saleNote || [state, accessories].filter(Boolean).join(" ／ ") || source.spec || "";
    render();
    K.overlay("priceCardModal").classList.add("on");
  };

  K.$$("#priceCardTemplates button").forEach((button) => {
    button.onclick = () => {
      template = button.dataset.template;
      render();
    };
  });
  [
    "priceCardCatch",
    "priceCardNote",
    "priceCardCategory",
    "priceCardMaker",
    "priceCardModel",
    "priceCardYear",
    "priceCardPrice",
    "priceCardWarranty",
    "priceCardCondition",
  ].forEach((id) => K.$("#" + id)?.addEventListener("input", render));
  K.$("#closePriceCard").onclick = close;
  K.$("#printPriceCard").onclick = () => {
    render();
    window.print();
  };
  K.enableSwipeSheet?.(K.$("#priceCardModal [data-swipe-sheet]"), close);
})();
