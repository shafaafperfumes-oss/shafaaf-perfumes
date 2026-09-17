/**
 * Floating WhatsApp button — a green circle pinned to the bottom-right
 * of every customer page. One tap opens a chat with the shop on the
 * same business number the footer and contact page use, with a short
 * greeting already typed so the customer only has to press send.
 *
 * Pages may set <body data-whatsapp-topic="…"> (the product page does
 * this with the product name) to mention what the customer is looking
 * at in that greeting.
 */

(function () {
  var NUMBER = "919796906804"; // country code + number, digits only
  var GREETING = "Hello Shafaaf Perfumes!";

  function chatUrl(topic) {
    var text = topic ? GREETING + " I have a question about " + topic + "." : GREETING + " I have a question.";
    return "https://wa.me/" + NUMBER + "?text=" + encodeURIComponent(text);
  }

  function inject() {
    if (document.querySelector(".wa-fab")) return;
    var link = document.createElement("a");
    link.className = "wa-fab";
    link.href = chatUrl(document.body.getAttribute("data-whatsapp-topic"));
    link.target = "_blank";
    link.rel = "noopener";
    link.setAttribute("aria-label", "Chat with us on WhatsApp");
    link.title = "Chat with us on WhatsApp";
    link.innerHTML = shafaafIcon("whatsapp", "wa-fab__icon") + '<span class="wa-fab__label">Chat with us</span>';
    // The shared icon keeps a little air around the logo; crop it so the
    // logo fills the circle.
    var svg = link.querySelector("svg");
    if (svg) svg.setAttribute("viewBox", "1.6 1.6 20.8 20.8");
    document.body.appendChild(link);
  }

  // Product page fills in its name after loading; keep the greeting current.
  function refresh() {
    var link = document.querySelector(".wa-fab");
    if (link) link.href = chatUrl(document.body.getAttribute("data-whatsapp-topic"));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inject);
  } else {
    inject();
  }
  document.addEventListener("shafaaf:whatsapp:topic", refresh);
})();
