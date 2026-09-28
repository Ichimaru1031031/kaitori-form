function syncEcForSale_(entityId, inv, sale, p, now) {
  const row = findRow_("EC_LISTINGS", "inventoryId", entityId);
  const previous = row ? rowObject_(sh_("EC_LISTINGS"), row) : {};
  const stage = String(sale.status || "");
  const status = stage === "販売中" ? "公開" : "非公開";
  const listing = {
    listingId: previous.listingId || ("EC-" + entityId),
    inventoryId: entityId,
    inventoryNo: inv.inventoryNo || "",
    status: status,
    title: String(p.ecTitle || previous.title || defaultEcTitle_(inv)),
    description: String(p.ecDescription || previous.description || defaultEcDescription_(inv)),
    salePrice: Number(sale.salePrice || inv.salePrice || 0),
    publishedAt: status === "公開" ? (previous.publishedAt || now) : (previous.publishedAt || ""),
    updatedAt: now,
    displayOrder: previous.displayOrder || "",
    employeeId: sale.employeeId || "",
    employeeName: sale.employeeName || "",
    photoIdsJson: inv.photoIdsJson || "[]",
    source: "NEXT"
  };
  if (row) updateRow_("EC_LISTINGS", row, listing);
  else appendObject_("EC_LISTINGS", listing);
  return listing;
}

function hideEcListing_(entityId, now) {
  const row = findRow_("EC_LISTINGS", "inventoryId", entityId);
  if (!row) return null;
  updateRow_("EC_LISTINGS", row, {status:"非公開", updatedAt:now});
  return rowObject_(sh_("EC_LISTINGS"), row);
}

function opEcListingUpsert_(entityId, p, key) {
  const invRow = findRow_("INVENTORY", "inventoryId", entityId);
  if (!invRow) throw new Error("INVENTORY_NOT_FOUND:" + entityId);
  const inv = rowObject_(sh_("INVENTORY"), invRow);
  const saleRow = findRow_("SALES", "inventoryId", entityId);
  const sale = saleRow ? rowObject_(sh_("SALES"), saleRow) : {
    inventoryId: entityId,
    inventoryNo: inv.inventoryNo || "",
    status: inv.stage || "",
    salePrice: inv.salePrice || 0,
    employeeId: p.employeeId || "",
    employeeName: p.employeeName || ""
  };
  const now = String(p.updatedAt || new Date().toISOString());
  const row = findRow_("EC_LISTINGS", "inventoryId", entityId);
  const previous = row ? rowObject_(sh_("EC_LISTINGS"), row) : {};
  const listing = {
    listingId: previous.listingId || ("EC-" + entityId),
    inventoryId: entityId,
    inventoryNo: inv.inventoryNo || "",
    status: p.status || previous.status || (String(sale.status)==="販売中" ? "公開" : "非公開"),
    title: p.title || previous.title || defaultEcTitle_(inv),
    description: p.description || previous.description || defaultEcDescription_(inv),
    salePrice: Number(p.salePrice || sale.salePrice || inv.salePrice || 0),
    publishedAt: previous.publishedAt || (p.status==="公開" ? now : ""),
    updatedAt: now,
    displayOrder: p.displayOrder || previous.displayOrder || "",
    employeeId: p.employeeId || sale.employeeId || "",
    employeeName: p.employeeName || sale.employeeName || "",
    photoIdsJson: p.photoIdsJson || inv.photoIdsJson || "[]",
    source: "NEXT"
  };
  if (row) updateRow_("EC_LISTINGS", row, listing);
  else appendObject_("EC_LISTINGS", listing);
  audit_("inventory", entityId, "ec-listing-upsert", listing, "NEXT");
  return listing;
}

function defaultEcTitle_(inv) {
  return [inv.maker, inv.category, inv.year ? String(inv.year) + "年" : "", inv.model]
    .filter(Boolean).join(" ");
}

function defaultEcDescription_(inv) {
  const lines = [];
  lines.push("中古家電専門リサイクルショップ 買取レスキュー流山");
  if (inv.year) lines.push("【" + inv.year + "年製】");
  if (inv.maker || inv.model) lines.push("【メーカー / 型番】" + [inv.maker, inv.model].filter(Boolean).join(" / "));
  if (inv.spec) lines.push("【仕様】" + inv.spec);
  lines.push("【確認・整備】清掃・動作確認済み");
  lines.push("掲載写真と商品状態をご確認ください。");
  return lines.join("\n");
}
