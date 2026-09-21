/**
 * Custom & Inspired page — the search box over the owner's private list of
 * imported oils (GET /inspired/search). Nothing is bought here: a match
 * shows the sizes the fragrance is made in, the customer picks one, and the
 * WhatsApp button opens a chat with the name and size already written. If
 * the list has no match, the same button asks for it as a custom blend.
 *
 * Prices come from the backend only when the owner has set them; a size
 * with no price reads "ask" and the chat message asks for a quote.
 */
(function () {
  var NUMBER = "919796906804"; // same business number as the rest of the site
  var form = document.getElementById("custom-search");
  var input = document.getElementById("custom-query");
  var results = document.getElementById("custom-results");
  if (!form || !input || !results) return;

  var esc = function (v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var lastQuery = "";
  var lastSizes = [];
  var chosen = {};   // match id -> size id

  function waUrl(text) { return "https://wa.me/" + NUMBER + "?text=" + encodeURIComponent(text); }

  function priceLabel(size) {
    return size.pricePaise != null && typeof shafaafFormatPrice === "function" ? shafaafFormatPrice(size.pricePaise / 100) : "ask";
  }

  function messageFor(match, size) {
    var line = "Hello Shafaaf Perfumes! I'd like " + match.name + " (inspired by " + match.inspiredBy + ")";
    if (size) line += " in " + size.label;
    line += size && size.pricePaise != null ? ". Please confirm price and delivery." : ". Please share the price and delivery time.";
    return line;
  }

  function renderMatch(m) {
    var sizeId = chosen[m.id] || (lastSizes[0] && lastSizes[0].id);
    chosen[m.id] = sizeId;
    var size = lastSizes.filter(function (s) { return s.id === sizeId; })[0];
    return (
      '<article class="custom-match" data-match="' + esc(m.id) + '">' +
        '<div class="custom-match__head">' +
          '<div><h2 class="custom-match__name">' + esc(m.name) + '</h2>' +
          '<p class="custom-match__brand">inspired by ' + esc(m.inspiredBy) + '</p></div>' +
          (m.gender ? '<span class="custom-match__gender">' + esc(m.gender) + '</span>' : "") +
        '</div>' +
        '<p class="custom-match__status">In stock — made to order</p>' +
        (lastSizes.length ?
          '<div class="custom-sizes" role="group" aria-label="Size">' +
            lastSizes.map(function (s) {
              return '<button type="button" class="custom-size" data-size="' + esc(s.id) + '" aria-pressed="' + (s.id === sizeId) + '">' +
                esc(s.label) + '<span class="custom-size__price">' + esc(priceLabel(s)) + '</span></button>';
            }).join("") +
          '</div>' : "") +
        '<div class="custom-match__actions">' +
          '<a class="btn btn--whatsapp" data-wa href="' + esc(waUrl(messageFor(m, size))) + '" target="_blank" rel="noopener">' + shafaafIcon("whatsapp") + ' Order on WhatsApp</a>' +
          '<span class="custom-match__note">' + (size && size.pricePaise != null ? "Price shown is for " + esc(size.label) + "." : "We'll reply with the price.") + '</span>' +
        '</div>' +
      '</article>'
    );
  }

  function renderEmpty(q) {
    var text = "Hello Shafaaf Perfumes! I'm looking for \"" + q + "\". Can you make it as a custom blend? Please share sizes and price.";
    return (
      '<div class="custom-empty">' +
        '<h2 class="custom-empty__title">Not in the list yet</h2>' +
        '<p class="custom-empty__text">We couldn\'t find “' + esc(q) + '” — but with hundreds of oils on the shelf we can usually still blend it. Ask us.</p>' +
        '<a class="btn btn--whatsapp" href="' + esc(waUrl(text)) + '" target="_blank" rel="noopener">' + shafaafIcon("whatsapp") + ' Ask on WhatsApp</a>' +
      '</div>'
    );
  }

  function render(matches) {
    if (!matches.length) { results.innerHTML = renderEmpty(lastQuery); return; }
    results.innerHTML =
      '<p class="custom-results__title"><strong>' + matches.length + (matches.length === 10 ? "+" : "") + ' found</strong> for “' + esc(lastQuery) + '”</p>' +
      matches.map(renderMatch).join("");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = input.value.trim();
    if (q.length < 2) { input.focus(); return; }
    lastQuery = q;
    results.innerHTML = '<p class="custom-results__title">Searching…</p>';
    ShafaafApi.get("/inspired/search?q=" + encodeURIComponent(q))
      .then(function (res) {
        var data = res && res.data ? res.data : res;
        lastSizes = (data && data.sizes) || [];
        render((data && data.matches) || []);
      })
      .catch(function (err) {
        results.innerHTML =
          '<div class="custom-empty"><h2 class="custom-empty__title">Search is taking a break</h2>' +
          '<p class="custom-empty__text">' + esc((err && err.message) || "Please try again in a moment.") + '</p>' +
          '<a class="btn btn--whatsapp" href="' + esc(waUrl("Hello Shafaaf Perfumes! Do you have \"" + q + "\"?")) + '" target="_blank" rel="noopener">' + shafaafIcon("whatsapp") + ' Ask on WhatsApp</a></div>';
      });
  });

  // Picking a size rewrites that card's WhatsApp link so the message names it.
  results.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-size]");
    if (!btn) return;
    var card = btn.closest("[data-match]");
    var matchId = card.getAttribute("data-match");
    chosen[matchId] = btn.getAttribute("data-size");
    card.querySelectorAll("[data-size]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
    var size = lastSizes.filter(function (s) { return s.id === chosen[matchId]; })[0];
    var name = card.querySelector(".custom-match__name").textContent;
    var brand = card.querySelector(".custom-match__brand").textContent.replace(/^inspired by /, "");
    card.querySelector("[data-wa]").setAttribute("href", waUrl(messageFor({ name: name, inspiredBy: brand }, size)));
    card.querySelector(".custom-match__note").textContent = size && size.pricePaise != null ? "Price shown is for " + size.label + "." : "We'll reply with the price.";
  });

  // ?q=sauvage in the address bar searches straight away (shareable links).
  var preset = new URLSearchParams(location.search).get("q");
  if (preset && preset.trim().length >= 2) {
    input.value = preset.trim();
    form.dispatchEvent(new Event("submit", { cancelable: true }));
  }
})();
