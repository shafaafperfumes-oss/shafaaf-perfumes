/**
 * Header behavior: transparent→solid scroll transition (only on
 * pages that opt in via [data-transparent="true"]), mobile menu
 * drawer, and live cart/wishlist count badges.
 */

(function () {
  function initScrollState() {
    var header = document.querySelector(".site-header");
    if (!header) return;
    var transparentCapable = header.getAttribute("data-transparent") === "true";

    function update() {
      var scrolled = window.scrollY > 40;
      if (transparentCapable) {
        header.classList.toggle("is-transparent", !scrolled);
        header.classList.toggle("is-solid", scrolled);
      } else {
        header.classList.add("is-solid");
      }
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
  }

  function initMobileMenu() {
    var toggle = document.querySelector("[data-mobile-menu-toggle]");
    var drawer = document.getElementById("mobile-menu");
    if (!toggle || !drawer) return;

    function open() {
      drawer.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      ShafaafOverlay.lock();
      window.shafaafActiveOverlayClose = close;
    }
    function close() {
      drawer.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      ShafaafOverlay.unlock();
    }
    toggle.addEventListener("click", function () {
      drawer.classList.contains("is-open") ? close() : open();
    });
    var closeBtn = drawer.querySelector("[data-close]");
    if (closeBtn) closeBtn.addEventListener("click", close);
    drawer.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", close); });
    window.shafaafCloseMobileMenu = close;
  }

  function updateBadge(selector, count) {
    document.querySelectorAll(selector).forEach(function (el) {
      el.textContent = count;
      el.setAttribute("data-empty", count === 0 ? "true" : "false");
    });
  }

  function bumpBadge(selector) {
    document.querySelectorAll(selector).forEach(function (el) {
      el.classList.remove("bump");
      void el.offsetWidth;
      el.classList.add("bump");
    });
  }

  function initCounts() {
    updateBadge("[data-cart-count]", ShafaafCart.getCount());
    updateBadge("[data-wishlist-count]", ShafaafWishlist.getCount());
    document.addEventListener("shafaaf:cart:change", function () {
      updateBadge("[data-cart-count]", ShafaafCart.getCount());
      bumpBadge("[data-cart-count]");
    });
    document.addEventListener("shafaaf:wishlist:change", function () {
      updateBadge("[data-wishlist-count]", ShafaafWishlist.getCount());
      bumpBadge("[data-wishlist-count]");
    });
  }

  function initAccountStub() {
    document.querySelectorAll("[data-account-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        ShafaafToast.show("Accounts are coming soon — order directly via WhatsApp for now.");
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initScrollState();
    initMobileMenu();
    initCounts();
    initAccountStub();
  });
})();

/** Closes whichever overlay is currently on top (Escape key handler target). */
function shafaafCloseTopOverlay() {
  if (typeof window.shafaafActiveOverlayClose === "function") {
    window.shafaafActiveOverlayClose();
    window.shafaafActiveOverlayClose = null;
  }
}
