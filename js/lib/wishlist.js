/**
 * Wishlist store — persisted to localStorage. Stores product ids
 * only; architected so an authenticated user's wishlist can later
 * be synced from/to a backend by swapping this module's internals.
 */

var ShafaafWishlist = (function () {
  var STORAGE_KEY = "shafaaf_wishlist_v1";
  var ids = shafaafStorage.get(STORAGE_KEY, []);

  function persistAndNotify() {
    shafaafStorage.set(STORAGE_KEY, ids);
    document.dispatchEvent(new CustomEvent("shafaaf:wishlist:change", { detail: { ids: ids.slice() } }));
  }

  function has(productId) { return ids.indexOf(productId) !== -1; }

  function toggle(productId) {
    if (has(productId)) {
      ids = ids.filter(function (id) { return id !== productId; });
    } else {
      ids.push(productId);
    }
    persistAndNotify();
    return has(productId);
  }

  function remove(productId) {
    ids = ids.filter(function (id) { return id !== productId; });
    persistAndNotify();
  }

  function getIds() { return ids.slice(); }
  function getCount() { return ids.length; }

  function getProducts() {
    return ids
      .map(function (id) { return shafaafGetProductById(id); })
      .filter(Boolean);
  }

  return {
    has: has,
    toggle: toggle,
    remove: remove,
    getIds: getIds,
    getCount: getCount,
    getProducts: getProducts
  };
})();
