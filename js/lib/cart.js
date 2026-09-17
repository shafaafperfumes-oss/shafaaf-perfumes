/**
 * Cart store — framework-agnostic, event-driven.
 * Any part of the UI can call ShafaafCart.add(...) etc, and any
 * part of the UI can listen for "shafaaf:cart:change" on
 * document to re-render.
 *
 * Two modes, same API for every caller:
 *
 *   Guest      — the cart lives in this browser's localStorage, as it
 *                always has. Nothing leaves the device.
 *   Signed in  — the backend cart (GET/POST /cart) is the source of
 *                truth, so the same cart follows the customer to any
 *                device. This module keeps an in-memory mirror of it,
 *                applies every change locally first (so the UI feels
 *                instant), sends it to the backend, then adopts
 *                whatever the backend answers. If the backend refuses
 *                (item sold out, connection lost) the mirror is
 *                reloaded and the shopper sees a short message.
 *
 * The moment a guest signs in, whatever they had in the guest cart
 * is pushed into their account cart and the guest copy is emptied —
 * nothing they picked is lost. Signing out leaves the account cart
 * on the server and shows an empty guest cart.
 *
 * Line item shape (unchanged for every existing caller):
 *   { id, productId, name, variantType, sizeLabel, price, qty, image,
 *     variantId?,   // which size, as the backend knows it
 *     serverId? }   // the backend's id for this line, signed-in only
 */

var ShafaafCart = (function () {
  var STORAGE_KEY = "shafaaf_cart_v1";          // guest cart
  var MIRROR_KEY = "shafaaf_cart_account_v1";   // last known account cart, so pages draw it instantly
  var MAX_QTY = 20;                             // same cap as the backend

  var mirror = shafaafStorage.get(MIRROR_KEY, null);
  var items = mirror && Array.isArray(mirror.items) ? mirror.items : shafaafStorage.get(STORAGE_KEY, []);
  // The signed-in customer's id once ShafaafAuth has told us; null for guests
  // (and for the first few hundred milliseconds before auth has answered).
  var userId = null;
  // Backend calls run one after another so a quick "+ + +" never races.
  var queue = Promise.resolve();

  function notify() {
    document.dispatchEvent(new CustomEvent("shafaaf:cart:change", { detail: { items: items.slice() } }));
  }

  function persistAndNotify() {
    if (userId) {
      shafaafStorage.set(MIRROR_KEY, { userId: userId, items: items });
    } else if (!mirror) {
      shafaafStorage.set(STORAGE_KEY, items);
    }
    // Otherwise auth has not answered yet and we are showing the remembered
    // account cart: keep changes in memory; the merge below picks them up.
    notify();
  }

  function find(lineId) {
    return items.find(function (i) { return i.id === lineId; });
  }

  function signedIn() {
    return Boolean(userId);
  }

  function toast(text) {
    if (typeof ShafaafToast !== "undefined") ShafaafToast.show(text);
  }

  /** The backend's id for a size: stored on the line, or looked up in the catalog. */
  function resolveVariantId(line) {
    if (line.variantId) return line.variantId;
    var product = typeof shafaafGetProductById === "function" ? shafaafGetProductById(line.productId) : null;
    if (!product) return null;
    var variant = (product.variants || []).find(function (v) { return v.type === line.variantType; });
    var size = variant && variant.sizes.find(function (s) { return s.label === line.sizeLabel; });
    return (size && size.variantId) || null;
  }

  /** Backend cart line -> the line shape the pages already render. */
  function fromServer(line) {
    var typeLabel = line.variantType === "attar" ? "Attar" : "Perfume";
    var product = typeof shafaafGetProductById === "function" ? shafaafGetProductById(line.productSlug) : null;
    return {
      id: shafaafLineId(line.productSlug, typeLabel, line.sizeLabel),
      serverId: line.id,
      variantId: line.variantId,
      productId: line.productSlug,
      name: line.productName,
      variantType: typeLabel,
      sizeLabel: line.sizeLabel,
      price: line.unitPrice,
      qty: line.quantity,
      image: product ? product.image : null
    };
  }

  function applyServer(summary) {
    if (!summary || !Array.isArray(summary.items)) return;
    items = summary.items.map(fromServer);
    persistAndNotify();
  }

  function fetchServerCart() {
    return ShafaafApi.get("/cart", { auth: true });
  }

  /**
   * Runs one backend call after the previous one finished. `work` is
   * called at that moment (not now), so it can look up a line's serverId
   * that an earlier call has only just produced.
   */
  function remote(work) {
    queue = queue
      .then(work)
      .then(applyServer, function (err) {
        toast((err && err.message) || "Your cart could not be updated. Please try again.");
        return fetchServerCart().then(applyServer, function () {});
      });
    return queue;
  }

  // ---- public operations ----------------------------------------------

  function add(line, qty) {
    qty = qty || 1;
    var existing = find(line.id);
    var previousQty = existing ? existing.qty : 0;
    if (existing) {
      existing.qty = Math.min(existing.qty + qty, MAX_QTY);
    } else {
      items.push(Object.assign({}, line, { qty: Math.min(qty, MAX_QTY) }));
    }
    persistAndNotify();

    if (!signedIn()) return;
    var variantId = resolveVariantId(existing || line);
    if (!variantId) {
      // Cannot tell the backend which size this is (catalog offline) — undo.
      if (existing) existing.qty = previousQty;
      else items = items.filter(function (i) { return i.id !== line.id; });
      persistAndNotify();
      toast("That item could not be added right now. Please try again.");
      return;
    }
    remote(function () {
      return ShafaafApi.post("/cart/items", { variantId: variantId, quantity: qty }, { auth: true });
    });
  }

  function removeLine(lineId) {
    var line = find(lineId);
    var serverId = line ? line.serverId : null;
    items = items.filter(function (i) { return i.id !== lineId; });
    persistAndNotify();

    if (!signedIn()) return;
    remote(function () {
      // If the backend's id was not known yet (the add was still in flight),
      // ask the backend for its cart and look the line up there.
      var known = serverId
        ? Promise.resolve(serverId)
        : fetchServerCart().then(function (summary) {
            var match = summary.items.map(fromServer).find(function (i) { return i.id === lineId; });
            return match ? match.serverId : null;
          });
      return known.then(function (id) {
        if (!id) return fetchServerCart();
        return ShafaafApi.del("/cart/items/" + id, { auth: true }).then(fetchServerCart);
      });
    });
  }

  function setQty(lineId, qty) {
    var line = find(lineId);
    if (!line) return;
    if (qty <= 0) { return removeLine(lineId); }
    qty = Math.min(qty, MAX_QTY);
    line.qty = qty;
    persistAndNotify();

    if (!signedIn()) return;
    remote(function () {
      var current = find(lineId);
      if (!current || !current.serverId) return fetchServerCart();
      return ShafaafApi.patch("/cart/items/" + current.serverId, { quantity: qty }, { auth: true });
    });
  }

  function clear() {
    items = [];
    persistAndNotify();

    if (!signedIn()) return;
    remote(function () {
      return ShafaafApi.del("/cart", { auth: true }).then(function () {
        return { items: [], itemCount: 0, subtotal: 0 };
      });
    });
  }

  /** Re-read the account cart from the backend (no-op for guests). */
  function refresh() {
    if (!signedIn()) return Promise.resolve();
    return remote(fetchServerCart);
  }

  function getItems() { return items.slice(); }

  function getCount() {
    return items.reduce(function (sum, i) { return sum + i.qty; }, 0);
  }

  function getSubtotal() {
    return items.reduce(function (sum, i) { return sum + i.qty * i.price; }, 0);
  }

  // ---- following the sign-in state -------------------------------------

  /** Push every guest line into the account cart, then adopt the account cart. */
  function mergeGuestCart() {
    var catalogReady = window.shafaafCatalogReady || Promise.resolve();
    // Lines the backend does not know about: whatever is in memory without a
    // serverId, plus anything still sitting in the guest copy on disk.
    var guestLines = items.filter(function (i) { return !i.serverId; });
    shafaafStorage.get(STORAGE_KEY, []).forEach(function (line) {
      if (!guestLines.some(function (i) { return i.id === line.id; })) guestLines.push(line);
    });
    remote(function () {
      return Promise.all([catalogReady, fetchServerCart()]).then(function (results) {
        // Sizes the account cart already holds are left as they are — so a
        // merge interrupted half-way (tab closed, link clicked) is never
        // applied twice on the next visit.
        var alreadyThere = {};
        results[1].items.forEach(function (i) { alreadyThere[i.variantId] = true; });
        var networkFailed = false;
        return guestLines
          .reduce(function (chain, line) {
            return chain.then(function () {
              var variantId = resolveVariantId(line);
              if (!variantId || alreadyThere[variantId]) return;
              return ShafaafApi
                .post("/cart/items", { variantId: variantId, quantity: line.qty }, { auth: true })
                .catch(function (err) {
                  if (err && (err.code === "NETWORK" || err.code === "TIMEOUT")) networkFailed = true;
                  // Anything else (sold out, hidden) is simply dropped.
                });
            });
          }, Promise.resolve())
          .then(function () {
            // Keep the guest copy only if we could not reach the backend, so
            // the merge is retried on the next visit instead of losing items.
            if (!networkFailed) shafaafStorage.remove(STORAGE_KEY);
            return fetchServerCart();
          });
      });
    });
  }

  function onAuthChange() {
    if (typeof ShafaafAuth === "undefined") return;
    var user = ShafaafAuth.getUser();
    var nextId = user ? user.id : null;
    if (nextId === userId) return;

    if (!nextId) {
      // Signed out: the account cart stays on the server; show the guest cart.
      userId = null;
      mirror = null;
      shafaafStorage.remove(MIRROR_KEY);
      items = shafaafStorage.get(STORAGE_KEY, []);
      notify();
      return;
    }

    // Signed in. A remembered cart for a different account is not theirs.
    if (mirror && mirror.userId !== nextId) {
      items = items.filter(function (i) { return !i.serverId; });
    }
    userId = nextId;
    mirror = null;
    persistAndNotify();
    mergeGuestCart();
  }

  document.addEventListener("shafaaf:auth:change", onAuthChange);
  document.addEventListener("DOMContentLoaded", function () {
    if (typeof ShafaafAuth === "undefined") return;
    ShafaafAuth.whenReady().then(onAuthChange);
  });

  return {
    add: add,
    removeLine: removeLine,
    setQty: setQty,
    clear: clear,
    refresh: refresh,
    getItems: getItems,
    getCount: getCount,
    getSubtotal: getSubtotal,
    isSignedIn: signedIn
  };
})();
