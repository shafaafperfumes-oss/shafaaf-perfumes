/**
 * Admin page — the shop owner's view of orders and stock.
 *
 *   admin.html                       every customer's orders, newest first
 *   admin.html?status=paid&page=2    filtered / paged
 *   admin.html?view=order&id=…       one order: customer, items, address,
 *                                    history, and the one action it allows
 *   admin.html?view=stock            stock per variant, with adjustments
 *
 * The browser does none of the deciding. Every request goes to
 * /api/v1/admin/*, where the backend re-checks that the signed-in account
 * has the admin role (from its own database, never from the token) and
 * refuses anything else — a customer who opens this page simply sees
 * "no access". The rules about what an order may become (paid only via
 * Razorpay, cancel only while unpaid, ship only once paid…) live there
 * too; this page only offers the button the backend would accept.
 */
(function () {
  var STATUS = {
    pending_payment: { label: "Awaiting payment", tone: "pending" },
    paid: { label: "Paid", tone: "paid" },
    shipped: { label: "Shipped", tone: "shipped" },
    delivered: { label: "Delivered", tone: "delivered" },
    cancelled: { label: "Cancelled", tone: "cancelled" }
  };
  var STATUS_ORDER = ["pending_payment", "paid", "shipped", "delivered", "cancelled"];
  var PER_PAGE = 20;

  var params = new URLSearchParams(window.location.search);
  var view = params.get("view") || "orders";
  var userId = null;
  var busy = false;
  var notice = null;

  // Per-view data
  var order = null;
  var products = [];
  var productDetails = {};   // productId -> { ...product, variants }
  var openProductId = null;
  var lowStock = [];
  var search = "";

  function el() { return document.getElementById("admin-content"); }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function formatDate(value) {
    var d = new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
      ", " + d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  }

  function statusBadge(status) {
    var info = STATUS[status] || { label: status, tone: "pending" };
    return '<span class="order-status order-status--' + info.tone + '">' + escapeHtml(info.label) + '</span>';
  }

  function href(query) {
    var q = new URLSearchParams();
    Object.keys(query).forEach(function (key) {
      if (query[key] !== undefined && query[key] !== null && query[key] !== "") q.set(key, query[key]);
    });
    var s = q.toString();
    return "admin.html" + (s ? "?" + s : "");
  }

  function setTitle(text) {
    var title = document.getElementById("admin-title");
    if (title) title.textContent = text;
    document.title = text + " — Admin — Shafaaf Perfumes";
  }

  function renderNav() {
    var nav = document.getElementById("admin-nav");
    if (!nav) return;
    var section = view === "stock" ? "stock" : "orders";
    nav.innerHTML =
      '<a href="' + href({}) + '"' + (section === "orders" ? ' class="is-active"' : "") + '>Orders</a>' +
      '<a href="' + href({ view: "stock" }) + '"' + (section === "stock" ? ' class="is-active"' : "") + '>Stock</a>';
  }

  // ---- states -----------------------------------------------------------

  function renderMessage(title, text, actionsHtml) {
    el().innerHTML =
      '<div class="state-block">' +
        shafaafIcon("shield", "state-block__icon") +
        '<h2 class="state-block__title">' + title + '</h2>' +
        '<p class="state-block__text">' + text + '</p>' +
        (actionsHtml || "") +
      '</div>';
    shafaafHydrateIcons(el());
  }

  function renderSignedOut() {
    renderMessage(
      "Sign in to manage the store",
      "This page is for the Shafaaf Perfumes team.",
      '<div class="checkout-actions"><button type="button" class="btn btn--primary" data-admin-signin>Sign in</button></div>'
    );
  }

  function renderForbidden() {
    renderMessage(
      "No access",
      "This account is not an administrator. If it should be, ask the store owner to grant access.",
      '<div class="checkout-actions"><a href="index.html" class="btn btn--outline">Back to the shop</a></div>'
    );
  }

  function renderLoading() {
    el().innerHTML = '<p class="checkout-loading">Loading…</p>';
  }

  function renderError(err) {
    renderMessage(
      "Something went wrong",
      escapeHtml((err && err.message) || "Please try again in a moment."),
      '<div class="checkout-actions"><button type="button" class="btn btn--primary" data-admin-retry>Try again</button></div>'
    );
  }

  function noticeHtml() {
    return notice ? '<p class="form-notice form-notice--' + notice.type + '" role="alert">' + escapeHtml(notice.text) + '</p>' : "";
  }

  // ---- orders list ------------------------------------------------------

  function loadOrders() {
    setTitle("Orders");
    renderLoading();
    var status = params.get("status") || "";
    var page = Math.max(1, parseInt(params.get("page"), 10) || 1);
    var query = "?page=" + page + "&perPage=" + PER_PAGE + (status ? "&status=" + encodeURIComponent(status) : "");
    return ShafaafApi.get("/admin/orders" + query, { auth: true, withMeta: true }).then(function (res) {
      renderOrders(res.data.orders || [], res.meta || { page: page, perPage: PER_PAGE, total: 0 }, status);
    });
  }

  function renderOrders(orders, meta, status) {
    var chips = [{ value: "", label: "All" }].concat(STATUS_ORDER.map(function (s) { return { value: s, label: STATUS[s].label }; }));
    var first = meta.total ? (meta.page - 1) * meta.perPage + 1 : 0;
    var last = Math.min(meta.total, meta.page * meta.perPage);
    var lastPage = Math.max(1, Math.ceil(meta.total / meta.perPage));

    el().innerHTML =
      '<div class="admin-toolbar">' +
        '<div class="admin-chips">' +
          chips.map(function (c) {
            return '<a class="admin-chip' + (c.value === status ? " is-active" : "") + '" href="' + href({ status: c.value }) + '">' + escapeHtml(c.label) + '</a>';
          }).join("") +
        '</div>' +
        '<span class="admin-count">' + (meta.total ? first + "–" + last + " of " + meta.total : "No orders") + '</span>' +
      '</div>' +
      (orders.length
        ? '<div class="orders-list admin-orders">' +
            orders.map(function (o) {
              return (
                '<a class="order-row" href="' + href({ view: "order", id: o.id }) + '">' +
                  '<span class="order-row__main">' +
                    '<span class="order-row__number">' + escapeHtml(o.orderNumber) + '</span>' +
                    '<span class="order-row__date">' + escapeHtml(formatDate(o.createdAt)) + '</span>' +
                  '</span>' +
                  '<span class="order-row__customer">' + escapeHtml(o.customerName || "Customer") + '</span>' +
                  '<span class="order-row__items">' + o.itemCount + (o.itemCount === 1 ? " item" : " items") + '</span>' +
                  statusBadge(o.status) +
                  '<span class="order-row__total">' + shafaafFormatPrice(o.total) + '</span>' +
                  shafaafIcon("chevronRight", "order-row__chevron") +
                '</a>'
              );
            }).join("") +
          '</div>'
        : '<p class="admin-empty">' + (status ? "No orders with this status." : "No orders have been placed yet.") + '</p>') +
      (lastPage > 1
        ? '<div class="admin-pager">' +
            '<a class="btn btn--outline btn--sm" href="' + href({ status: status, page: meta.page - 1 }) + '"' + (meta.page <= 1 ? ' aria-disabled="true"' : "") + '>Previous</a>' +
            '<span>Page ' + meta.page + ' of ' + lastPage + '</span>' +
            '<a class="btn btn--outline btn--sm" href="' + href({ status: status, page: meta.page + 1 }) + '"' + (meta.page >= lastPage ? ' aria-disabled="true"' : "") + '>Next</a>' +
          '</div>'
        : "");
    shafaafHydrateIcons(el());
  }

  // ---- order detail -----------------------------------------------------

  function fetchOrder(id) {
    return ShafaafApi.get("/admin/orders/" + encodeURIComponent(id), { auth: true }).then(function (data) {
      order = data.order;
      return order;
    });
  }

  function loadOrder() {
    var id = params.get("id");
    setTitle("Order");
    renderLoading();
    return fetchOrder(id).then(renderOrder).catch(function (err) {
      if (err && err.status === 404) {
        renderMessage("Order not found", "No order has that id.", '<div class="checkout-actions"><a href="' + href({}) + '" class="btn btn--primary">All orders</a></div>');
        return;
      }
      throw err;
    });
  }

  function renderAddress(a) {
    if (!a || typeof a !== "object") return "";
    return [
      "<strong>" + escapeHtml(a.recipientName) + "</strong>",
      a.line1, a.line2,
      [a.city, a.state].filter(Boolean).join(", ") + " " + (a.postalCode || ""),
      a.phone
    ].filter(Boolean).map(function (line, i) { return i === 0 ? line : escapeHtml(line); }).join("<br>");
  }

  /** The one thing the backend will accept for this order right now, if any. */
  function renderActions() {
    var body = "";
    if (order.status === "pending_payment") {
      body =
        '<p class="admin-actions__hint">Waiting for the customer to pay. Nothing has been charged. Cancelling releases the stock this order is holding.</p>' +
        '<div class="field"><label class="field__label" for="admin-note">Reason (optional, shown to the customer)</label>' +
        '<input class="input" id="admin-note" maxlength="300" placeholder="e.g. Customer asked to cancel"></div>' +
        '<button type="button" class="btn btn--outline btn--danger btn--block" data-admin-status="cancelled"' + (busy ? " disabled" : "") + '>' + (busy ? "Working…" : "Cancel order") + '</button>';
    } else if (order.status === "paid") {
      body =
        '<p class="admin-actions__hint">Payment received. Pack the order, then mark it shipped — the note goes on the customer&#39;s order page.</p>' +
        '<div class="field"><label class="field__label" for="admin-note">Courier and tracking number (optional)</label>' +
        '<input class="input" id="admin-note" maxlength="300" placeholder="e.g. Delhivery, tracking 1234567890"></div>' +
        '<button type="button" class="btn btn--primary btn--block" data-admin-status="shipped"' + (busy ? " disabled" : "") + '>' + (busy ? "Working…" : "Mark as shipped") + '</button>';
    } else if (order.status === "shipped") {
      body =
        '<p class="admin-actions__hint">On its way. Once the customer has it, mark it delivered.</p>' +
        '<button type="button" class="btn btn--primary btn--block" data-admin-status="delivered"' + (busy ? " disabled" : "") + '>' + (busy ? "Working…" : "Mark as delivered") + '</button>';
    } else if (order.status === "delivered") {
      body = '<p class="admin-actions__hint">Delivered. Nothing more to do.</p>';
    } else {
      body = '<p class="admin-actions__hint">This order was cancelled and its stock released.</p>';
    }
    return '<div class="admin-actions">' + noticeHtml() + body + '</div>';
  }

  function renderOrder() {
    setTitle("Order " + order.orderNumber);
    el().innerHTML =
      '<a class="admin-back" href="' + href({}) + '">' + shafaafIcon("chevronLeft") + ' All orders</a>' +
      '<div class="order-detail__head">' +
        '<p class="order-detail__date">Placed ' + escapeHtml(formatDate(order.createdAt)) + '</p>' +
        statusBadge(order.status) +
      '</div>' +
      '<div class="checkout-layout">' +
        '<section class="checkout-section">' +
          '<h2 class="checkout-title">Customer</h2>' +
          '<dl class="admin-customer">' +
            '<div><dt>Name</dt><dd>' + escapeHtml(order.customerName || "—") + '</dd></div>' +
            '<div><dt>Phone</dt><dd>' + escapeHtml(order.customerPhone || (order.shippingAddress && order.shippingAddress.phone) || "—") + '</dd></div>' +
            '<div><dt>Items</dt><dd>' + order.itemCount + '</dd></div>' +
          '</dl>' +
          '<h2 class="checkout-title order-detail__section">Items</h2>' +
          '<div class="checkout-lines order-detail__lines">' +
            order.items.map(function (line) {
              return (
                '<div class="checkout-line">' +
                  '<div class="checkout-line__info">' +
                    '<p class="checkout-line__name">' + escapeHtml(line.productName) + '</p>' +
                    '<p class="checkout-line__meta">' + escapeHtml(line.variantLabel) + ' × ' + line.quantity + ' · ' + shafaafFormatPrice(line.unitPrice) + ' each · SKU ' + escapeHtml(line.sku) + '</p>' +
                  '</div>' +
                  '<span class="checkout-line__total">' + shafaafFormatPrice(line.lineTotal) + '</span>' +
                '</div>'
              );
            }).join("") +
          '</div>' +
          '<h2 class="checkout-title order-detail__section">Delivery address</h2>' +
          '<p class="order-detail__address">' + renderAddress(order.shippingAddress) + '</p>' +
          '<h2 class="checkout-title order-detail__section">History</h2>' +
          '<ol class="order-history">' +
            order.statusHistory.map(function (h) {
              return '<li><span class="order-history__when">' + escapeHtml(formatDate(h.createdAt)) + '</span>' +
                '<span class="order-history__what">' + escapeHtml((STATUS[h.status] || {}).label || h.status) + (h.note ? " — " + escapeHtml(h.note) : "") + '</span></li>';
            }).join("") +
          '</ol>' +
        '</section>' +
        '<aside class="cart-summary checkout-summary">' +
          '<h2 class="checkout-title">Summary</h2>' +
          '<div class="cart-summary__row"><span>Subtotal</span><span>' + shafaafFormatPrice(order.subtotal) + '</span></div>' +
          (order.discount ? '<div class="cart-summary__row"><span>Discount</span><span>− ' + shafaafFormatPrice(order.discount) + '</span></div>' : "") +
          '<div class="cart-summary__row"><span>Shipping</span><span>' + (order.shipping ? shafaafFormatPrice(order.shipping) : "Free") + '</span></div>' +
          (order.tax ? '<div class="cart-summary__row"><span>Tax</span><span>' + shafaafFormatPrice(order.tax) + '</span></div>' : "") +
          '<div class="cart-summary__row cart-summary__row--total"><span>Total</span><span>' + shafaafFormatPrice(order.total) + '</span></div>' +
          renderActions() +
        '</aside>' +
      '</div>';
    shafaafHydrateIcons(el());
  }

  function updateStatus(status) {
    if (busy || !order) return;
    var noteEl = document.getElementById("admin-note");
    var note = noteEl ? noteEl.value.trim() : "";
    if (status === "cancelled" && !window.confirm("Cancel order " + order.orderNumber + "? Its reserved stock will be released.")) return;

    busy = true;
    notice = null;
    renderOrder();
    var body = { status: status };
    if (note) body.note = note;
    ShafaafApi.patch("/admin/orders/" + encodeURIComponent(order.id), body, { auth: true })
      .then(function (data) {
        busy = false;
        order = data.order;
        renderOrder();
        ShafaafToast.show("Order " + order.orderNumber + " marked " + STATUS[order.status].label.toLowerCase() + ".");
      })
      .catch(function (err) {
        busy = false;
        notice = { type: "error", text: (err && err.message) || "The change could not be saved. Please try again." };
        // 409: the order moved on since this page loaded — show its real state.
        if (err && err.status === 409) return fetchOrder(order.id).then(renderOrder, renderOrder);
        renderOrder();
      });
  }

  // ---- stock ------------------------------------------------------------

  function loadStock() {
    setTitle("Stock");
    renderLoading();
    return Promise.all([
      ShafaafApi.get("/admin/inventory/low-stock", { auth: true }),
      ShafaafApi.get("/admin/products?perPage=100", { auth: true })
    ]).then(function (results) {
      lowStock = results[0].variants || [];
      products = results[1].products || [];
      renderStock();
    });
  }

  function refreshLowStock() {
    return ShafaafApi.get("/admin/inventory/low-stock", { auth: true }).then(function (data) {
      lowStock = data.variants || [];
    }).catch(function () {});
  }

  function variantLabel(v) {
    var type = shafaafGetProductType(v.variantType);
    return (type ? type.label : v.variantType) + " · " + v.sizeLabel;
  }

  // What the shop shows the customer for this product, for reference —
  // read-only here, so names, notes and copy can never be changed by accident.
  function renderDetails(detail) {
    var groups = shafaafGroupNotes(detail.notes || []);
    var bands = [["top", "Top"], ["heart", "Heart"], ["base", "Base"]];
    var notesHtml = bands.map(function (b) {
      if (!groups[b[0]].length) return "";
      return (
        '<div class="admin-notes__band"><span class="admin-notes__label">' + b[1] + '</span>' +
          groups[b[0]].map(function (n) { return '<span class="badge badge--soft">' + escapeHtml(n) + '</span>'; }).join("") +
        '</div>'
      );
    }).join("");
    return (
      '<div class="admin-details">' +
        '<p class="admin-details__desc">' + (detail.description ? escapeHtml(detail.description) : '<span class="admin-empty">No description yet.</span>') + '</p>' +
        '<div class="admin-notes">' + (notesHtml || '<span class="admin-empty">No notes yet.</span>') + '</div>' +
      '</div>'
    );
  }

  function renderVariants(detail) {
    if (!detail) return '<p class="admin-empty">Loading…</p>';
    if (!detail.variants.length) return renderDetails(detail) + '<p class="admin-empty">No sizes yet.</p>';
    return (
      renderDetails(detail) +
      '<div class="admin-table__wrap"><table class="admin-table">' +
        '<thead><tr><th>Size</th><th>SKU</th><th class="num">Price</th><th class="num">In stock</th><th class="num">Reserved</th><th class="num">Available</th><th>Adjust</th></tr></thead>' +
        '<tbody>' +
          detail.variants.map(function (v) {
            var available = v.quantity - v.reserved;
            var low = available <= v.lowStockThreshold;
            return (
              '<tr' + (v.isActive ? "" : ' class="is-hidden"') + '>' +
                '<td>' + escapeHtml(variantLabel(v)) + (v.isActive ? "" : " (hidden)") + '</td>' +
                '<td>' + escapeHtml(v.sku) + '</td>' +
                '<td class="num">' + shafaafFormatPrice(v.pricePaise / 100) + '</td>' +
                '<td class="num">' + v.quantity + '</td>' +
                '<td class="num">' + v.reserved + '</td>' +
                '<td class="num' + (low ? " is-low" : "") + '">' + available + '</td>' +
                '<td>' +
                  '<form class="admin-adjust" data-adjust="' + escapeHtml(v.id) + '">' +
                    '<input class="input admin-adjust__delta" name="delta" type="number" step="1" placeholder="+5" aria-label="Amount to add or remove" required>' +
                    '<input class="input admin-adjust__note" name="note" maxlength="300" placeholder="Reason, e.g. new batch received" aria-label="Reason" required>' +
                    '<button type="submit" class="btn btn--outline btn--sm"' + (busy ? " disabled" : "") + '>Apply</button>' +
                  '</form>' +
                '</td>' +
              '</tr>'
            );
          }).join("") +
        '</tbody>' +
      '</table></div>'
    );
  }

  function renderStock() {
    var term = search.trim().toLowerCase();
    var visible = term ? products.filter(function (p) { return p.name.toLowerCase().indexOf(term) !== -1; }) : products;

    el().innerHTML =
      '<section class="admin-panel">' +
        '<h2 class="admin-panel__title">Running low ' + (lowStock.length ? '<span class="order-status order-status--cancelled">' + lowStock.length + '</span>' : "") + '</h2>' +
        (lowStock.length
          ? '<div class="admin-table__wrap"><table class="admin-table">' +
              '<thead><tr><th>Product</th><th>SKU</th><th class="num">Available</th><th class="num">Alert at</th></tr></thead><tbody>' +
              lowStock.map(function (v) {
                return '<tr><td>' + escapeHtml(v.productName) + '</td><td>' + escapeHtml(v.sku) + '</td>' +
                  '<td class="num is-low">' + v.available + '</td><td class="num">' + v.lowStockThreshold + '</td></tr>';
              }).join("") +
            '</tbody></table></div>'
          : '<p class="admin-empty">Everything is comfortably in stock.</p>') +
      '</section>' +
      '<div class="admin-toolbar">' +
        '<input class="input admin-search" type="search" placeholder="Search products…" value="' + escapeHtml(search) + '" data-admin-search aria-label="Search products">' +
        '<span class="admin-count">' + visible.length + ' of ' + products.length + ' products</span>' +
      '</div>' +
      noticeHtml() +
      '<div class="admin-products">' +
        visible.map(function (p) {
          var open = p.id === openProductId;
          return (
            '<div class="admin-product' + (open ? " is-open" : "") + '">' +
              '<button type="button" class="admin-product__head" data-admin-product="' + escapeHtml(p.id) + '" aria-expanded="' + open + '">' +
                '<span><span class="admin-product__name">' + escapeHtml(p.name) + '</span>' +
                  '<span class="admin-product__meta">' + escapeHtml([p.family, p.gender].filter(Boolean).join(" · ")) + (p.isActive ? "" : " · hidden from shop") + '</span></span>' +
                '<span class="admin-product__stock">' + p.variantCount + (p.variantCount === 1 ? " size" : " sizes") + '</span>' +
                '<span class="admin-product__stock">' + p.stockOnHand + ' in stock</span>' +
                shafaafIcon("chevronRight", "admin-product__chevron") +
              '</button>' +
              (open ? '<div class="admin-product__body">' + renderVariants(productDetails[p.id]) + '</div>' : "") +
            '</div>'
          );
        }).join("") +
      '</div>';
    shafaafHydrateIcons(el());
  }

  function toggleProduct(id) {
    openProductId = openProductId === id ? null : id;
    notice = null;
    renderStock();
    if (openProductId && !productDetails[openProductId]) {
      ShafaafApi.get("/admin/products/" + encodeURIComponent(openProductId), { auth: true })
        .then(function (data) {
          productDetails[data.product.id] = data.product;
          renderStock();
        })
        .catch(function (err) {
          notice = { type: "error", text: (err && err.message) || "Could not load this product." };
          renderStock();
        });
    }
  }

  function adjustStock(form) {
    if (busy) return;
    var variantId = form.getAttribute("data-adjust");
    var delta = parseInt(form.elements.delta.value, 10);
    var note = form.elements.note.value.trim();
    if (!delta || !note) return;

    busy = true;
    notice = null;
    ShafaafApi.post("/admin/inventory/adjust", { variantId: variantId, delta: delta, note: note }, { auth: true })
      .then(function (data) {
        busy = false;
        var stock = data.stock;
        var detail = productDetails[openProductId];
        if (detail) {
          detail.variants.forEach(function (v) {
            if (v.id === variantId) { v.quantity = stock.quantity; v.reserved = stock.reserved; }
          });
        }
        products.forEach(function (p) {
          if (p.id === openProductId) p.stockOnHand += delta;
        });
        ShafaafToast.show((delta > 0 ? "Added " + delta : "Removed " + Math.abs(delta)) + " — " + stock.available + " now available.");
        return refreshLowStock().then(renderStock);
      })
      .catch(function (err) {
        busy = false;
        notice = { type: "error", text: (err && err.message) || "The stock change could not be saved." };
        renderStock();
      });
  }

  // ---- routing ----------------------------------------------------------

  function route() {
    renderNav();
    var load = view === "order" ? loadOrder : view === "stock" ? loadStock : loadOrders;
    load().catch(function (err) {
      if (err && err.code === "NOT_SIGNED_IN") { renderSignedOut(); return; }
      if (err && err.status === 403) { renderForbidden(); return; }
      renderError(err);
    });
  }

  function init() {
    renderNav();
    if (typeof ShafaafAuth === "undefined" || !ShafaafAuth.isAvailable()) {
      renderMessage("Admin is not available right now", "Sign-in is temporarily unavailable. Please try again in a little while.");
      return;
    }
    ShafaafAuth.whenReady().then(function () {
      var user = ShafaafAuth.getUser();
      userId = user ? user.id : null;
      if (!user) { renderSignedOut(); return; }
      renderLoading();
      // The backend decides who is an admin; this just asks it.
      ShafaafApi.get("/admin/whoami", { auth: true })
        .then(route)
        .catch(function (err) {
          if (err && err.status === 403) { renderForbidden(); return; }
          if (err && err.code === "NOT_SIGNED_IN") { renderSignedOut(); return; }
          renderError(err);
        });
    });
  }

  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-admin-signin]")) { ShafaafAccountModal.open("signin"); return; }
    if (e.target.closest("[data-admin-retry]")) { init(); return; }
    var statusBtn = e.target.closest("[data-admin-status]");
    if (statusBtn) { updateStatus(statusBtn.getAttribute("data-admin-status")); return; }
    var productBtn = e.target.closest("[data-admin-product]");
    if (productBtn) { toggleProduct(productBtn.getAttribute("data-admin-product")); }
  });

  document.addEventListener("submit", function (e) {
    var form = e.target.closest("[data-adjust]");
    if (form) { e.preventDefault(); adjustStock(form); }
  });

  // Filtering re-renders the list around the search box, so keep the
  // caret where it was instead of losing focus on every keystroke.
  document.addEventListener("input", function (e) {
    if (!e.target.matches("[data-admin-search]")) return;
    search = e.target.value;
    renderStock();
    var input = el().querySelector("[data-admin-search]");
    if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  });

  // Signing in or out on this page: start over only when the person changed.
  document.addEventListener("shafaaf:auth:change", function () {
    var user = ShafaafAuth.getUser();
    var id = user ? user.id : null;
    if (id === userId) return;
    userId = id;
    init();
  });

  init();
})();
