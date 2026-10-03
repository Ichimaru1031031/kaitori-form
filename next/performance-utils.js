(() => {
  // Rebuild from the current snapshot each render: no stale data or TTL.
  window.KRN.buildPhotoLookup = (catalog, listings) => {
    const ids=new Map(),numbers=new Map(),listingIds=new Map();
    catalog.forEach((row,index)=>{if(!ids.has(row.inventoryId))ids.set(row.inventoryId,{row,index});if(!numbers.has(row.inventoryNo))numbers.set(row.inventoryNo,{row,index});});
    listings.forEach(row=>{if(!listingIds.has(row.inventoryId))listingIds.set(row.inventoryId,row);});
    return {catalog(item){const id=ids.get(item.inventoryId),no=item.inventoryNo?numbers.get(item.inventoryNo):undefined;return !id?no?.row:!no||id.index<=no.index?id.row:no.row;},listing:id=>listingIds.get(id)};
  };
})();
