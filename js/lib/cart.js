/**
 * Cart store — persisted to localStorage, framework-agnostic.
 * Any part of the UI can call ShafaafCart.add(...) etc, and any
 * part of the UI can listen for "shafaaf:cart:change" on
 * document to re-render. This event-driven shape is deliberate:
 * a future backend cart (synced per-account) can replace the
 * internals of this module without changing a single call site.
 *
 * Line item shape:
 * { id, productId, name, variantType, sizeLabel, price, qty, image }
 */

var ShafaafCart = (function () {
  var STORAGE_KEY = "shafaaf_cart_v1";
  var items = shafaafStorage.get(STORAGE_KEY, []);

  function persistAndNotify() {
    shafaafStorage.set(STORAGE_KEY, items);
    document.dispatchEvent(new CustomEvent("shafaaf:cart:change", { detail: { items: items.slice() } }));
  }

  function add(line, qty) {
    qty = qty || 1;
    var existing = items.find(function (i) { return i.id === line.id; });
    if (existing) {
      existing.qty += qty;
    } else {
      items.push(Object.assign({}, line, { qty: qty }));
    }
    persistAndNotify();
  }

  function removeLine(lineId) {
    items = items.filter(function (i) { return i.id !== lineId; });
    persistAndNotify();
  }

  function setQty(lineId, qty) {
    var line = items.find(function (i) { return i.id === lineId; });
    if (!line) return;
    if (qty <= 0) { return removeLine(lineId); }
    line.qty = qty;
    persistAndNotify();
  }

  function clear() {
    items = [];
    persistAndNotify();
  }

  function getItems() { return items.slice(); }

  function getCount() {
    return items.reduce(function (sum, i) { return sum + i.qty; }, 0);
  }

  function getSubtotal() {
    return items.reduce(function (sum, i) { return sum + i.qty * i.price; }, 0);
  }

  return {
    add: add,
    removeLine: removeLine,
    setQty: setQty,
    clear: clear,
    getItems: getItems,
    getCount: getCount,
    getSubtotal: getSubtotal
  };
})();
