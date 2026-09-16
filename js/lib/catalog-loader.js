/**
 * CATALOG LOADER
 * ------------------------------------------------------------
 * Fetches the live catalog from the backend and swaps it into the
 * product list before any page draws, so every page shows what is
 * actually in the database — the admin's latest prices and products —
 * not what was typed into js/data/products.js months ago.
 *
 * If the backend cannot be reached (no internet, backend down, page
 * opened straight from disk), the embedded copy in js/data/products.js
 * is used instead and the shop still renders. Pages wait for whichever
 * outcome happens first, capped by a short timeout, so a slow network
 * delays the page by at most a few seconds and never blanks it.
 *
 * Pages call `shafaafOnCatalogReady(fn)` instead of listening for
 * DOMContentLoaded — it fires once both the DOM and the catalog are
 * ready.
 */
(function () {
  // A cold backend (first visitor after a quiet spell) can take ~4s to
  // answer; this must comfortably clear that or it would fall back to
  // the embedded copy precisely when the live data matters most.
  var TIMEOUT_MS = 8000;

  var domReady = new Promise(function (resolve) {
    if (document.readyState !== "loading") {
      resolve();
    } else {
      document.addEventListener("DOMContentLoaded", function () { resolve(); });
    }
  });

  function fetchCatalog() {
    var base = window.SHAFAAF_CONFIG && window.SHAFAAF_CONFIG.apiBaseUrl;
    if (!base || typeof window.fetch !== "function") {
      return Promise.reject(new Error("no API configured"));
    }

    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, TIMEOUT_MS);

    return fetch(base + "/products", {
      headers: { Accept: "application/json" },
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (body) {
        var list = body && body.success && body.data && body.data.products;
        if (!Array.isArray(list) || list.length === 0) throw new Error("empty catalog");
        clearTimeout(timer);
        return list;
      })
      .catch(function (err) {
        clearTimeout(timer);
        throw err;
      });
  }

  var catalogLoaded = fetchCatalog()
    .then(function (list) {
      shafaafReplaceCatalog(list);
      window.SHAFAAF_CATALOG_SOURCE = "api";
    })
    .catch(function (err) {
      window.SHAFAAF_CATALOG_SOURCE = "embedded";
      if (window.console) {
        console.warn("[shafaaf] live catalog unavailable, showing embedded copy:", err && err.message);
      }
    });

  window.shafaafCatalogReady = Promise.all([domReady, catalogLoaded]).then(function () {});

  window.shafaafOnCatalogReady = function (fn) {
    window.shafaafCatalogReady.then(fn).catch(function (err) {
      // Surface page errors as real uncaught errors instead of letting the
      // promise swallow them — otherwise a broken page would fail silently.
      setTimeout(function () { throw err; });
    });
  };
})();
