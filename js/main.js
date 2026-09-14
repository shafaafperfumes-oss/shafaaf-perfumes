/**
 * Shared page bootstrap — newsletter form handling and a small
 * analytics stub. Real analytics/email providers plug in here
 * later without touching any page-level markup.
 */

function shafaafTrackEvent(name, payload) {
  if (window.location.hostname === "localhost" || window.location.protocol === "file:") {
    console.debug("[shafaaf:event]", name, payload || {});
  }
}

document.addEventListener("submit", function (e) {
  var form = e.target.closest("[data-newsletter-form]");
  if (!form) return;
  e.preventDefault();
  var input = form.querySelector("input[type='email']");
  if (input && input.value) {
    ShafaafToast.show("Thanks for subscribing — welcome to Shafaaf.");
    shafaafTrackEvent("newsletter_signup", { email: input.value });
    form.reset();
  }
});

document.addEventListener("DOMContentLoaded", function () {
  document.body.classList.add("is-ready");
});
