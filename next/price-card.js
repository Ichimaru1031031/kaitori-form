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

  function cardMarkup() {
    const maker = item?.maker || "メーカー不明",
      model = item?.model || "型番不明",
      category = item?.category || "リユース家電",
      year = displayYear(item?.year),
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
    K.$("#priceCardCatch").value = "安心して選べるリユース家電";
    K.$("#priceCardNote").value = "";
    K.$("#priceCardPrice").value = String(source.salePrice || "");
    K.$("#priceCardWarranty").value = "安心の動作保証6か月";
    K.$("#priceCardCondition").value = source.saleNote || source.spec || "";
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
