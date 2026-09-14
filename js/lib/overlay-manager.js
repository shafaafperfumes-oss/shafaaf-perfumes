/**
 * Shared scrim + body-scroll-lock for drawers/modals/search overlay.
 * Tracks how many overlays are open so nested/overlapping opens
 * (e.g. quick view opened from within an already-open search
 * overlay) don't unlock scroll prematurely.
 */

var ShafaafOverlay = (function () {
  var openCount = 0;

  function scrim() { return document.querySelector("[data-scrim]"); }

  function lock() {
    openCount++;
    document.documentElement.style.overflow = "hidden";
    var s = scrim();
    if (s) s.classList.add("is-open");
  }

  function unlock() {
    openCount = Math.max(0, openCount - 1);
    if (openCount === 0) {
      document.documentElement.style.overflow = "";
      var s = scrim();
      if (s) s.classList.remove("is-open");
    }
  }

  function bindScrimClose(closeFns) {
    var s = scrim();
    if (!s) return;
    s.addEventListener("click", function () {
      closeFns.forEach(function (fn) { fn(); });
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && typeof shafaafCloseTopOverlay === "function") {
      shafaafCloseTopOverlay();
    }
  });

  return { lock: lock, unlock: unlock, bindScrimClose: bindScrimClose };
})();
