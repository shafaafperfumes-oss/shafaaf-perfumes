/**
 * Admin — Fragrances: the private list of imported / inspired oils behind
 * the Custom page (admin.html?view=fragrances).
 *
 *   - the list, with search; tick/untick "available" so the Custom page
 *     stops saying "in stock" the moment an oil runs out
 *   - edit a name, brand or gender in place; add a new entry
 *   - the sizes custom fragrances are made in, with the owner's selling
 *     price in rupees (sent as paise) — empty means "ask on WhatsApp"
 *   - what visitors searched for in the last 30 days, most-asked first,
 *     with the ones that matched nothing marked — the shopping list for
 *     the next supplier order
 *
 * Supplier prices never come near this screen; the backend only knows
 * names, brands and the owner's own selling prices.
 */
var ShafaafAdminInspired = (function () {
  var A = null;
  var GENDERS = ["", "Unisex", "Men", "Women"];
  var PER_PAGE = 50;

  var items = [];
  var total = 0;
  var page = 1;
  var search = "";
  var sizes = [];
  var queries = [];
  var editing = null;     // id of the row whose editor is open, or "new"
  var busy = false;
  var notice = null;

  function helpers() { return A || (A = window.ShafaafAdmin); }
  function esc(text) { return helpers().escapeHtml(text); }
  function el() { return helpers().el(); }
  function toPaise(rupees) { return Math.round(Number(rupees) * 100); }
  function toRupees(paise) { return paise == null ? "" : String(paise / 100); }

  function fail(err, fallback) {
    busy = false;
    var text = (err && err.message) || fallback;
    if (err && err.details && err.details.fields && err.details.fields.length) {
      text += " (" + err.details.fields.map(function (f) { return f.path + ": " + f.message; }).join("; ") + ")";
    }
    notice = { type: "error", text: text };
    render();
  }

  function load() {
    helpers().setTitle("Fragrances");
    helpers().renderLoading();
    var params = "?page=" + page + "&perPage=" + PER_PAGE + (search ? "&search=" + encodeURIComponent(search) : "");
    return Promise.all([
      ShafaafApi.get("/admin/inspired" + params, { auth: true, withMeta: true }),
      ShafaafApi.get("/admin/inspired/sizes", { auth: true }),
      ShafaafApi.get("/admin/inspired/queries?days=30", { auth: true }),
    ]).then(function (res) {
      items = res[0].data.fragrances;
      total = (res[0].meta && res[0].meta.total) || items.length;
      sizes = res[1].sizes;
      queries = res[2].queries;
      render();
    });
  }

  function reloadList() {
    var params = "?page=" + page + "&perPage=" + PER_PAGE + (search ? "&search=" + encodeURIComponent(search) : "");
    return ShafaafApi.get("/admin/inspired" + params, { auth: true, withMeta: true }).then(function (res) {
      items = res.data.fragrances;
      total = (res.meta && res.meta.total) || items.length;
      busy = false;
      render();
    });
  }

  function noticeHtml() {
    return notice ? '<p class="form-notice form-notice--' + notice.type + '" role="alert">' + esc(notice.text) + '</p>' : "";
  }

  function genderSelect(value) {
    return '<select class="input input--sm" name="gender">' + GENDERS.map(function (g) {
      return '<option value="' + g + '"' + ((value || "") === g ? " selected" : "") + '>' + (g || "—") + '</option>';
    }).join("") + '</select>';
  }

  function editorRow(f) {
    var isNew = !f;
    return '<tr class="admin-inspired__editor"><td colspan="4">' +
      '<form class="admin-inspired__form" data-inspired-form="' + (isNew ? "new" : esc(f.id)) + '">' +
        '<input class="input input--sm" name="name" placeholder="Fragrance name" required maxlength="160" value="' + esc(isNew ? "" : f.name) + '">' +
        '<input class="input input--sm" name="inspiredBy" placeholder="Inspired by (brand)" required maxlength="120" value="' + esc(isNew ? "" : f.inspiredBy) + '">' +
        genderSelect(isNew ? "" : f.gender) +
        '<button type="submit" class="btn btn--primary btn--sm"' + (busy ? " disabled" : "") + '>' + (isNew ? "Add" : "Save") + '</button>' +
        '<button type="button" class="btn btn--outline btn--sm" data-inspired-cancel>Cancel</button>' +
      '</form></td></tr>';
  }

  function listHtml() {
    var lastPage = Math.max(1, Math.ceil(total / PER_PAGE));
    return (
      '<div class="admin-toolbar">' +
        '<form data-inspired-search><input class="input admin-search" type="search" name="q" placeholder="Search the list…" value="' + esc(search) + '" aria-label="Search fragrances"></form>' +
        '<div class="admin-toolbar__end">' +
          '<span class="admin-count">' + total + ' in the list</span>' +
          '<button type="button" class="btn btn--primary btn--sm" data-inspired-add>' + shafaafIcon("plus") + ' Add fragrance</button>' +
        '</div>' +
      '</div>' +
      '<div class="admin-table__wrap"><table class="admin-table admin-table--inspired">' +
        '<thead><tr><th>Fragrance</th><th>Inspired by</th><th>For</th><th class="num">Available</th></tr></thead><tbody>' +
        (editing === "new" ? editorRow(null) : "") +
        (items.length ? items.map(function (f) {
          if (editing === f.id) return editorRow(f);
          return '<tr class="' + (f.isAvailable ? "" : "is-hidden") + '">' +
            '<td><button type="button" class="admin-link" data-inspired-edit="' + esc(f.id) + '">' + esc(f.name) + '</button></td>' +
            '<td>' + esc(f.inspiredBy) + '</td>' +
            '<td>' + esc(f.gender || "—") + '</td>' +
            '<td class="num"><label class="admin-switch"><input type="checkbox" data-inspired-available="' + esc(f.id) + '"' + (f.isAvailable ? " checked" : "") + (busy ? " disabled" : "") + '><span>' + (f.isAvailable ? "Yes" : "No") + '</span></label></td>' +
          '</tr>';
        }).join("") : '<tr><td colspan="4" class="admin-empty">' + (search ? "Nothing matches that search." : "The list is empty — add a fragrance or import the supplier list.") + '</td></tr>') +
      '</tbody></table></div>' +
      (lastPage > 1 ?
        '<div class="admin-pager">' +
          '<button type="button" class="btn btn--outline btn--sm" data-inspired-page="' + (page - 1) + '"' + (page <= 1 ? " disabled" : "") + '>Previous</button>' +
          '<span class="admin-count">Page ' + page + ' of ' + lastPage + '</span>' +
          '<button type="button" class="btn btn--outline btn--sm" data-inspired-page="' + (page + 1) + '"' + (page >= lastPage ? " disabled" : "") + '>Next</button>' +
        '</div>' : "")
    );
  }

  function sizesHtml() {
    return (
      '<h2 class="admin-h2">Sizes &amp; prices</h2>' +
      '<p class="admin-help">The sizes custom and inspired fragrances are made in. Leave a price empty and the Custom page says “ask” — the customer is told the price on WhatsApp.</p>' +
      '<div class="admin-table__wrap"><table class="admin-table admin-table--sizes-inspired">' +
        '<thead><tr><th>Size</th><th class="num">Price ₹</th><th class="num">Offered</th><th></th></tr></thead><tbody>' +
        sizes.map(function (s) {
          return '<tr class="' + (s.isActive ? "" : "is-hidden") + '">' +
            '<td>' + esc(s.label) + '</td>' +
            '<td class="num"><input class="input input--sm admin-price" type="number" min="1" step="1" placeholder="ask" value="' + esc(toRupees(s.pricePaise)) + '" data-size-price="' + esc(s.id) + '" aria-label="Price for ' + esc(s.label) + '"></td>' +
            '<td class="num"><label class="admin-switch"><input type="checkbox" data-size-active="' + esc(s.id) + '"' + (s.isActive ? " checked" : "") + '><span>' + (s.isActive ? "Yes" : "No") + '</span></label></td>' +
            '<td class="num"><button type="button" class="btn btn--outline btn--sm" data-size-save="' + esc(s.id) + '"' + (busy ? " disabled" : "") + '>Save</button></td>' +
          '</tr>';
        }).join("") +
      '</tbody></table></div>'
    );
  }

  function queriesHtml() {
    return (
      '<h2 class="admin-h2">What people searched for (30 days)</h2>' +
      (queries.length ?
        '<div class="admin-table__wrap"><table class="admin-table admin-table--queries">' +
          '<thead><tr><th>Searched</th><th class="num">Times</th><th>In the list?</th></tr></thead><tbody>' +
          queries.map(function (q) {
            return '<tr><td>' + esc(q.query) + '</td><td class="num">' + q.times + '</td>' +
              '<td>' + (q.matches > 0 ? '<span class="order-status order-status--delivered">Yes</span>' : '<span class="order-status order-status--cancelled">No — not stocked</span>') + '</td></tr>';
          }).join("") +
        '</tbody></table></div>' +
        '<p class="admin-help">“No” rows are fragrances customers want that are not in the list yet.</p>'
        : '<p class="admin-empty">No searches yet. They will appear here once the Custom page is used.</p>')
    );
  }

  function render() {
    el().innerHTML =
      '<p class="admin-help">The imported and inspired oils behind the Custom page. Names and brands only — the customer orders on WhatsApp.</p>' +
      noticeHtml() +
      listHtml() +
      '<div class="admin-inspired__grid">' +
        '<section>' + sizesHtml() + '</section>' +
        '<section>' + queriesHtml() + '</section>' +
      '</div>';
    notice = null;
  }

  // ---- events (delegated; admin.js owns the page shell) --------------------

  document.addEventListener("submit", function (e) {
    var searchForm = e.target.closest("[data-inspired-search]");
    if (searchForm) {
      e.preventDefault();
      search = searchForm.q.value.trim();
      page = 1;
      reloadList().catch(function (err) { fail(err, "Could not search the list."); });
      return;
    }
    var form = e.target.closest("[data-inspired-form]");
    if (!form || busy) return;
    e.preventDefault();
    var id = form.getAttribute("data-inspired-form");
    var body = { name: form.name.value.trim(), inspiredBy: form.inspiredBy.value.trim(), gender: form.gender.value || null };
    busy = true;
    var req = id === "new"
      ? ShafaafApi.post("/admin/inspired", body, { auth: true })
      : ShafaafApi.patch("/admin/inspired/" + id, body, { auth: true });
    req.then(function () {
      editing = null;
      notice = { type: "success", text: id === "new" ? "Added to the list." : "Saved." };
      return reloadList();
    }).catch(function (err) { fail(err, "Could not save that fragrance."); });
  });

  document.addEventListener("click", function (e) {
    var add = e.target.closest("[data-inspired-add]");
    if (add) { editing = "new"; render(); el().querySelector('[data-inspired-form] [name="name"]').focus(); return; }
    var edit = e.target.closest("[data-inspired-edit]");
    if (edit) { editing = edit.getAttribute("data-inspired-edit"); render(); return; }
    if (e.target.closest("[data-inspired-cancel]")) { editing = null; render(); return; }
    var pager = e.target.closest("[data-inspired-page]");
    if (pager && !pager.disabled) {
      page = Number(pager.getAttribute("data-inspired-page"));
      reloadList().catch(function (err) { fail(err, "Could not load that page."); });
      return;
    }
    var save = e.target.closest("[data-size-save]");
    if (save && !busy) {
      var sid = save.getAttribute("data-size-save");
      var priceInput = el().querySelector('[data-size-price="' + sid + '"]');
      var activeInput = el().querySelector('[data-size-active="' + sid + '"]');
      var rupees = priceInput.value.trim();
      if (rupees && !(Number(rupees) > 0)) { notice = { type: "error", text: "Price must be a whole number of rupees, or empty." }; render(); return; }
      busy = true;
      ShafaafApi.patch("/admin/inspired/sizes/" + sid, { pricePaise: rupees ? toPaise(rupees) : null, isActive: activeInput.checked }, { auth: true })
        .then(function (res) {
          sizes = sizes.map(function (s) { return s.id === sid ? res.size : s; });
          busy = false;
          notice = { type: "success", text: "Size saved." };
          render();
        })
        .catch(function (err) { fail(err, "Could not save that size."); });
    }
  });

  document.addEventListener("change", function (e) {
    var toggle = e.target.closest("[data-inspired-available]");
    if (!toggle || busy) return;
    var id = toggle.getAttribute("data-inspired-available");
    busy = true;
    ShafaafApi.patch("/admin/inspired/" + id, { isAvailable: toggle.checked }, { auth: true })
      .then(function (res) {
        items = items.map(function (f) { return f.id === id ? res.fragrance : f; });
        busy = false;
        render();
      })
      .catch(function (err) { fail(err, "Could not update availability."); });
  });

  return { load: load };
})();
