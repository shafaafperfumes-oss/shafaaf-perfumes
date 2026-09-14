/**
 * Toast notifications. Requires a <div id="toast-region" class="toast-region" aria-live="polite"></div>
 * to exist in the page (injected by main.js on every page).
 */

var ShafaafToast = (function () {
  function region() { return document.getElementById("toast-region"); }

  function show(message, opts) {
    opts = opts || {};
    var el = document.createElement("div");
    el.className = "toast" + (opts.type === "error" ? " toast--error" : "");
    el.setAttribute("role", "status");
    el.innerHTML = shafaafIcon(opts.type === "error" ? "close" : "check", "toast__icon") +
      "<span>" + message + "</span>";
    var r = region();
    if (!r) return;
    r.appendChild(el);
    var timeout = opts.duration || 3200;
    setTimeout(function () {
      el.classList.add("is-leaving");
      setTimeout(function () { el.remove(); }, 220);
    }, timeout);
  }

  return { show: show };
})();
