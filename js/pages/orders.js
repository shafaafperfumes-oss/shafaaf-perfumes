/**
 * Orders page — the signed-in customer's own orders.
 *
 *   orders.html          list of every order, newest first
 *   orders.html?id=…     one order: status, items, address, totals
 *   orders.html?id=…&paid=1   the shopper just finished Razorpay's
 *                        popup — keep asking the backend until it has
 *                        heard from Razorpay and marked the order paid
 *
 * The browser never marks an order paid. Razorpay tells the backend
 * directly (a webhook) and the backend updates the order; this page
 * only reads that status back. An order still "awaiting payment" gets
 * a "Pay now" button that asks the backend for a fresh payment window.
 */
(function () {
  var STATUS = {
    pending_payment: { label: "Awaiting payment", tone: "pending" },
    paid: { label: "Paid", tone: "paid" },
    shipped: { label: "Shipped", tone: "shipped" },
    delivered: { label: "Delivered", tone: "delivered" },
    cancelled: { label: "Cancelled", tone: "cancelled" }
  };
  var CONFIRM_ATTEMPTS = 12;   // ~30 seconds of polling after the popup closes
  var CONFIRM_DELAY_MS = 2500;

  var params = new URLSearchParams(window.location.search);
  var orderId = params.get("id");
  var justPaid = params.get("paid") === "1";
  var order = null;
  var busy = false;
  var notice = null;
  var confirming = false;
  var userId = null;

  function el() { return document.getElementById("orders-content"); }

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

  function setTitle(text, crumb) {
    var title = document.getElementById("orders-title");
    if (title) title.textContent = text;
    var crumbs = document.getElementById("orders-breadcrumbs");
    if (crumbs && crumb) {
      crumbs.innerHTML =
        '<a href="index.html">Home</a><span class="breadcrumbs__sep">/</span>' +
        '<a href="orders.html">Your Orders</a><span class="breadcrumbs__sep">/</span>' +
        '<span aria-current="page">' + escapeHtml(crumb) + '</span>';
    }
  }

  // ---- states -----------------------------------------------------------

  function renderMessage(title, text, actionsHtml) {
    el().innerHTML =
      '<div class="state-block">' +
        shafaafIcon("bag", "state-block__icon") +
        '<h2 class="state-block__title">' + title + '</h2>' +
        '<p class="state-block__text">' + text + '</p>' +
        (actionsHtml || "") +
      '</div>';
  }

  function renderSignedOut() {
    renderMessage(
      "Sign in to see your orders",
      "Your orders are kept with your account.",
      '<div class="checkout-actions"><button type="button" class="btn btn--primary" data-orders-signin>Sign in</button></div>'
    );
  }

  function renderLoading() {
    el().innerHTML = '<p class="checkout-loading">Loading…</p>';
  }

  function renderError(err) {
    renderMessage(
      "Your orders are not available right now",
      escapeHtml((err && err.message) || "Please try again in a moment."),
      '<button type="button" class="btn btn--primary" data-orders-retry>Try again</button>'
    );
  }

  // ---- list -------------------------------------------------------------

  function renderList(orders) {
    if (!orders.length) {
      renderMessage("No orders yet", "When you place an order it will show up here.", '<a href="shop.html" class="btn btn--primary">Shop Fragrances</a>');
      return;
    }
    el().innerHTML =
      '<div class="orders-list">' +
        orders.map(function (o) {
          return (
            '<a class="order-row" href="orders.html?id=' + encodeURIComponent(o.id) + '">' +
              '<span class="order-row__main">' +
                '<span class="order-row__number">' + escapeHtml(o.orderNumber) + '</span>' +
                '<span class="order-row__date">' + escapeHtml(formatDate(o.createdAt)) + '</span>' +
              '</span>' +
              '<span class="order-row__items">' + o.itemCount + (o.itemCount === 1 ? " item" : " items") + '</span>' +
              statusBadge(o.status) +
              '<span class="order-row__total">' + shafaafFormatPrice(o.total) + '</span>' +
              shafaafIcon("chevronRight", "order-row__chevron") +
            '</a>'
          );
        }).join("") +
      '</div>';
  }

  // ---- detail -----------------------------------------------------------

  function renderAddress(a) {
    if (!a || typeof a !== "object") return "";
    return [
      "<strong>" + escapeHtml(a.recipientName) + "</strong>",
      a.line1, a.line2,
      [a.city, a.state].filter(Boolean).join(", ") + " " + (a.postalCode || ""),
      a.phone
    ].filter(Boolean).map(function (line, i) { return i === 0 ? line : escapeHtml(line); }).join("<br>");
  }

  function renderPaymentPanel() {
    if (confirming) {
      return (
        '<div class="form-notice form-notice--success order-confirming" role="status">' +
          '<span class="order-confirming__spinner" aria-hidden="true"></span>' +
          'Thank you — confirming your payment with Razorpay…' +
        '</div>'
      );
    }
    if (order.status === "paid") {
      return '<div class="form-notice form-notice--success" role="status">' + shafaafIcon("check") + ' Payment received. We will pack your order and be in touch about dispatch.</div>';
    }
    if (order.status === "cancelled") {
      return '<div class="form-notice form-notice--error" role="status">This order was cancelled. Any reserved stock has been released.</div>';
    }
    var text = justPaid
      ? "We have not heard back from Razorpay yet. If you completed the payment, it can take a minute to show here — refresh this page in a moment. If not, you can pay now."
      : "This order is waiting for payment. Nothing has been charged yet.";
    return (
      '<div class="order-pay">' +
        (notice ? '<p class="form-notice form-notice--' + notice.type + '" role="alert">' + escapeHtml(notice.text) + '</p>' : "") +
        '<p class="cart-summary__note">' + text + '</p>' +
        '<button type="button" class="btn btn--primary btn--block" data-order-pay' + (busy ? " disabled" : "") + '>' + (busy ? "Opening payment…" : "Pay now") + '</button>' +
      '</div>'
    );
  }

  function renderDetail() {
    setTitle("Order " + order.orderNumber, order.orderNumber);
    el().innerHTML =
      '<div class="order-detail">' +
        '<div class="order-detail__head">' +
          '<div>' +
            '<p class="order-detail__date">Placed ' + escapeHtml(formatDate(order.createdAt)) + '</p>' +
          '</div>' +
          statusBadge(order.status) +
        '</div>' +
        '<div class="checkout-layout">' +
          '<section class="checkout-section">' +
            '<h2 class="checkout-title">Items</h2>' +
            '<div class="checkout-lines order-detail__lines">' +
              order.items.map(function (line) {
                return (
                  '<div class="checkout-line">' +
                    '<div class="checkout-line__info">' +
                      '<p class="checkout-line__name">' + escapeHtml(line.productName) + '</p>' +
                      '<p class="checkout-line__meta">' + escapeHtml(line.variantLabel) + ' × ' + line.quantity + ' · ' + shafaafFormatPrice(line.unitPrice) + ' each</p>' +
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
            renderPaymentPanel() +
            '<a href="orders.html" class="link-underline checkout-back">All your orders</a>' +
          '</aside>' +
        '</div>' +
      '</div>';
    shafaafHydrateIcons(el());
  }

  // ---- data -------------------------------------------------------------

  function fetchOrder() {
    return ShafaafApi.get("/orders/" + encodeURIComponent(orderId), { auth: true }).then(function (data) {
      order = data.order;
      return order;
    });
  }

  /** After the popup reports success, wait for the backend to hear it from Razorpay. */
  function confirmPayment(attempt) {
    confirming = true;
    renderDetail();
    return fetchOrder().then(function () {
      if (order.status !== "pending_payment" || attempt >= CONFIRM_ATTEMPTS) {
        confirming = false;
        renderDetail();
        if (order.status === "paid") ShafaafToast.show("Payment received — thank you!");
        return;
      }
      return new Promise(function (resolve) { setTimeout(resolve, CONFIRM_DELAY_MS); })
        .then(function () { return confirmPayment(attempt + 1); });
    }).catch(function () {
      confirming = false;
      renderDetail();
    });
  }

  function payNow() {
    if (busy) return;
    busy = true;
    notice = null;
    renderDetail();
    ShafaafApi.post("/orders/" + encodeURIComponent(order.id) + "/pay", undefined, { auth: true })
      .then(function (data) {
        var user = ShafaafAuth.getUser();
        var a = order.shippingAddress || {};
        return ShafaafPayment.open(data.payment, {
          orderNumber: order.orderNumber,
          name: a.recipientName || "",
          email: user ? user.email : "",
          contact: a.phone || ""
        });
      })
      .then(function (result) {
        busy = false;
        if (result.status === "completed") {
          justPaid = true;
          return confirmPayment(1);
        }
        renderDetail();
      })
      .catch(function (err) {
        busy = false;
        notice = { type: "error", text: (err && err.message) || "Payment could not be started. Please try again." };
        // A 409 means the order is no longer pending (already paid or
        // cancelled) — re-read it so the page shows the real state.
        if (err && err.status === 409) return fetchOrder().then(renderDetail, renderDetail);
        renderDetail();
      });
  }

  function load() {
    renderLoading();
    if (orderId) {
      fetchOrder()
        .then(function () {
          if (justPaid && order.status === "pending_payment") return confirmPayment(1);
          renderDetail();
        })
        .catch(function (err) {
          if (err && err.code === "NOT_SIGNED_IN") { renderSignedOut(); return; }
          if (err && err.status === 404) {
            renderMessage("Order not found", "We could not find that order in your account.", '<a href="orders.html" class="btn btn--primary">All your orders</a>');
            return;
          }
          renderError(err);
        });
      return;
    }
    ShafaafApi.get("/orders", { auth: true })
      .then(function (data) { renderList(data.orders || []); })
      .catch(function (err) {
        if (err && err.code === "NOT_SIGNED_IN") { renderSignedOut(); return; }
        renderError(err);
      });
  }

  function init() {
    if (typeof ShafaafAuth === "undefined" || !ShafaafAuth.isAvailable()) {
      renderMessage("Your orders are not available right now", "Sign-in is temporarily unavailable. Please try again in a little while.");
      return;
    }
    ShafaafAuth.whenReady().then(function () {
      var user = ShafaafAuth.getUser();
      userId = user ? user.id : null;
      if (!user) { renderSignedOut(); return; }
      load();
    });
  }

  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-orders-signin]")) { ShafaafAccountModal.open("signin"); return; }
    if (e.target.closest("[data-orders-retry]")) { init(); return; }
    if (e.target.closest("[data-order-pay]")) { payNow(); }
  });

  document.addEventListener("shafaaf:auth:change", function () {
    var user = ShafaafAuth.getUser();
    if ((user ? user.id : null) === userId) return;
    order = null;
    notice = null;
    init();
  });

  shafaafOnCatalogReady(init);
})();
