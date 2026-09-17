/**
 * Checkout page — pick a delivery address, review the order the
 * backend priced, place it, pay through Razorpay.
 *
 * Everything shown here comes from the backend, not from the browser's
 * copy of the cart: `POST /checkout/quote` prices the account cart with
 * today's prices and stock, and `POST /checkout/place` is the only call
 * that turns it into an order. A guest is asked to sign in first —
 * their cart is merged into the account the moment they do, and this
 * page carries on from there.
 */
(function () {
  var addresses = [];
  var selectedAddressId = null;
  var quote = null;
  var profile = null;
  var showForm = false;
  var busy = false;                 // a backend call is in flight
  var notice = null;                // { type, text, items? } shown near the Place order button
  var formNotice = null;            // shown inside the address form
  var draft = {};                   // what the shopper typed in the address form
  var userId = null;                // whose checkout is on screen

  function el() { return document.getElementById("checkout-content"); }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function openAccount(view) {
    if (typeof ShafaafAccountModal !== "undefined") ShafaafAccountModal.open(view || "signin");
  }

  // ---- states ----------------------------------------------------------

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
      "Sign in to check out",
      "Your bag is saved in this browser. Sign in (or create an account in a moment) and we will carry it over to your account.",
      '<div class="checkout-actions">' +
        '<button type="button" class="btn btn--primary" data-checkout-signin>Sign in</button>' +
        '<button type="button" class="btn btn--outline" data-checkout-signup>Create account</button>' +
      '</div>'
    );
  }

  function renderLoading(text) {
    el().innerHTML = '<p class="checkout-loading">' + (text || "Loading your checkout…") + '</p>';
  }

  // ---- address column ---------------------------------------------------

  function addressLines(a) {
    return [
      a.line1,
      a.line2,
      a.city + ", " + a.state + " " + a.postalCode
    ].filter(Boolean).map(escapeHtml).join("<br>");
  }

  function renderAddressCard(a) {
    var checked = a.id === selectedAddressId;
    return (
      '<label class="address-card' + (checked ? " is-selected" : "") + '">' +
        '<input type="radio" name="addressId" value="' + escapeHtml(a.id) + '"' + (checked ? " checked" : "") + '>' +
        '<span class="address-card__body">' +
          '<span class="address-card__top">' +
            '<span class="address-card__label">' + escapeHtml(a.label) + (a.isDefault ? ' <span class="badge badge--soft">Default</span>' : "") + '</span>' +
            '<button type="button" class="link-underline address-card__remove" data-address-remove="' + escapeHtml(a.id) + '">Remove</button>' +
          '</span>' +
          '<span class="address-card__name">' + escapeHtml(a.recipientName) + '</span>' +
          '<span class="address-card__lines">' + addressLines(a) + '</span>' +
          '<span class="address-card__phone">' + escapeHtml(a.phone) + '</span>' +
        '</span>' +
      '</label>'
    );
  }

  function field(name, label, attrs, hint) {
    return (
      '<div class="field">' +
        '<label class="field__label" for="addr-' + name + '">' + label + '</label>' +
        '<input class="input" id="addr-' + name + '" name="' + name + '" value="' + escapeHtml(draft[name] || "") + '" ' + (attrs || "") + '>' +
        (hint ? '<span class="field__hint">' + hint + '</span>' : "") +
      '</div>'
    );
  }

  function renderAddressForm() {
    var labelValue = draft.label || "Home";
    return (
      '<form class="address-form" data-address-form novalidate>' +
        '<h3 class="checkout-subtitle">' + (addresses.length ? "New address" : "Where should we deliver?") + '</h3>' +
        '<div class="address-form__grid">' +
          field("recipientName", "Full name", 'type="text" autocomplete="name" required maxlength="160"') +
          field("phone", "Phone", 'type="tel" autocomplete="tel" required minlength="6" maxlength="20" inputmode="tel"') +
          '<div class="address-form__full">' + field("line1", "Address line 1", 'type="text" autocomplete="address-line1" required maxlength="200"', "House / flat number, building, street") + '</div>' +
          '<div class="address-form__full">' + field("line2", "Address line 2 (optional)", 'type="text" autocomplete="address-line2" maxlength="200"', "Area, landmark") + '</div>' +
          field("city", "City", 'type="text" autocomplete="address-level2" required maxlength="100"') +
          field("state", "State", 'type="text" autocomplete="address-level1" required maxlength="100"') +
          field("postalCode", "PIN code", 'type="text" autocomplete="postal-code" required inputmode="numeric" maxlength="12"') +
          '<div class="field">' +
            '<label class="field__label" for="addr-label">Save as</label>' +
            '<select class="select" id="addr-label" name="label">' +
              ["Home", "Office", "Other"].map(function (o) {
                return '<option value="' + o + '"' + (o === labelValue ? " selected" : "") + '>' + o + '</option>';
              }).join("") +
            '</select>' +
          '</div>' +
        '</div>' +
        '<label class="checkbox-row"><input type="checkbox" name="isDefault"' + (draft.isDefault || !addresses.length ? " checked" : "") + '> Use as my default address</label>' +
        (formNotice ? '<p class="form-notice form-notice--' + formNotice.type + '" role="alert">' + escapeHtml(formNotice.text) + '</p>' : "") +
        '<div class="checkout-actions checkout-actions--start">' +
          '<button type="submit" class="btn btn--primary"' + (busy ? " disabled" : "") + '>' + (busy ? "Saving…" : "Save address") + '</button>' +
          (addresses.length ? '<button type="button" class="btn btn--ghost" data-address-cancel>Cancel</button>' : "") +
        '</div>' +
      '</form>'
    );
  }

  function renderAddressColumn() {
    var html = '<section class="checkout-section" aria-labelledby="checkout-address-title">' +
      '<span class="eyebrow">Step 1</span>' +
      '<h2 class="checkout-title" id="checkout-address-title">Delivery address</h2>';
    if (addresses.length) {
      html += '<div class="address-list">' + addresses.map(renderAddressCard).join("") + '</div>';
      if (!showForm) {
        html += '<button type="button" class="btn btn--outline btn--sm address-add" data-address-add>' + shafaafIcon("plus") + ' Add a new address</button>';
      }
    }
    if (showForm || !addresses.length) html += renderAddressForm();
    html += '</section>';
    return html;
  }

  // ---- summary column ---------------------------------------------------

  function renderQuoteLine(line) {
    return (
      '<div class="checkout-line">' +
        '<div class="checkout-line__info">' +
          '<p class="checkout-line__name">' + escapeHtml(line.productName) + '</p>' +
          '<p class="checkout-line__meta">' + escapeHtml(line.variantLabel) + ' × ' + line.quantity + '</p>' +
        '</div>' +
        '<span class="checkout-line__total">' + shafaafFormatPrice(line.lineTotal) + '</span>' +
      '</div>'
    );
  }

  function noticeHtml() {
    if (!notice) return "";
    var items = (notice.items || []).map(function (i) { return "<li>" + escapeHtml(i) + "</li>"; }).join("");
    return (
      '<div class="form-notice form-notice--' + notice.type + '" role="alert">' + escapeHtml(notice.text) +
        (items ? '<ul class="form-notice__list">' + items + '</ul>' : "") +
      '</div>'
    );
  }

  function renderSummaryColumn() {
    var canPlace = Boolean(selectedAddressId) && !busy;
    return (
      '<aside class="cart-summary checkout-summary" aria-labelledby="checkout-summary-title">' +
        '<span class="eyebrow">Step 2</span>' +
        '<h2 class="checkout-title" id="checkout-summary-title">Your order</h2>' +
        '<div class="checkout-lines">' + quote.items.map(renderQuoteLine).join("") + '</div>' +
        '<div class="cart-summary__row"><span>Subtotal</span><span>' + shafaafFormatPrice(quote.subtotal) + '</span></div>' +
        (quote.discount ? '<div class="cart-summary__row"><span>Discount</span><span>− ' + shafaafFormatPrice(quote.discount) + '</span></div>' : "") +
        '<div class="cart-summary__row"><span>Shipping</span><span>' + (quote.shipping ? shafaafFormatPrice(quote.shipping) : "Free") + '</span></div>' +
        (quote.tax ? '<div class="cart-summary__row"><span>Tax</span><span>' + shafaafFormatPrice(quote.tax) + '</span></div>' : "") +
        '<div class="cart-summary__row cart-summary__row--total"><span>Total</span><span>' + shafaafFormatPrice(quote.total) + '</span></div>' +
        noticeHtml() +
        '<button type="button" class="btn btn--primary btn--block checkout-place" data-place-order' + (canPlace ? "" : " disabled") + '>' +
          (busy ? "Placing your order…" : "Place order & pay") +
        '</button>' +
        (selectedAddressId ? "" : '<p class="cart-summary__note">Choose or add a delivery address to continue.</p>') +
        '<p class="cart-summary__note">' + shafaafIcon("shield") + ' Payment opens in Razorpay\'s secure window — cards, UPI, net banking and wallets. Your card details never touch our site.</p>' +
        '<a href="cart.html" class="link-underline checkout-back">Edit your bag</a>' +
      '</aside>'
    );
  }

  function render() {
    if (!quote) return;
    if (!quote.items.length) {
      renderMessage("Your bag is empty", "Add a fragrance before checking out.", '<a href="shop.html" class="btn btn--primary">Shop Fragrances</a>');
      return;
    }
    el().innerHTML = '<div class="checkout-layout">' + renderAddressColumn() + renderSummaryColumn() + '</div>';
    shafaafHydrateIcons(el());
  }

  // ---- data -------------------------------------------------------------

  function pickDefaultAddress() {
    if (selectedAddressId && addresses.some(function (a) { return a.id === selectedAddressId; })) return;
    var preferred = addresses.find(function (a) { return a.isDefault; }) || addresses[0];
    selectedAddressId = preferred ? preferred.id : null;
  }

  function load() {
    renderLoading();
    // Wait for the cart module to finish syncing (a guest cart merges into
    // the account right after sign-in) before asking the backend to price it.
    return ShafaafCart.refresh()
      .then(function () {
        return Promise.all([
          ShafaafApi.get("/me/addresses", { auth: true }),
          // An empty account cart is a 400 from the backend, not a failure.
          ShafaafApi.post("/checkout/quote", undefined, { auth: true }).catch(function (err) {
            if (err && err.status === 400) return { items: [], itemCount: 0, subtotal: 0, discount: 0, shipping: 0, tax: 0, total: 0 };
            throw err;
          }),
          ShafaafApi.get("/me", { auth: true }).catch(function () { return null; })
        ]);
      })
      .then(function (results) {
        addresses = results[0].addresses || [];
        quote = results[1];
        profile = results[2] ? results[2].profile : null;
        pickDefaultAddress();
        showForm = false;
        if (!draft.recipientName && profile && profile.fullName) draft.recipientName = profile.fullName;
        if (!draft.phone && profile && profile.phone) draft.phone = profile.phone;
        render();
      })
      .catch(function (err) {
        if (err && err.code === "NOT_SIGNED_IN") { renderSignedOut(); return; }
        renderMessage(
          "Checkout is not available right now",
          escapeHtml((err && err.message) || "Please try again in a moment."),
          '<button type="button" class="btn btn--primary" data-checkout-retry>Try again</button>'
        );
      });
  }

  function formValues(form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (input) {
      if (!input.name) return;
      out[input.name] = input.type === "checkbox" ? input.checked : input.value.trim();
    });
    return out;
  }

  function saveAddress(form) {
    var values = formValues(form);
    draft = values;
    var required = ["recipientName", "phone", "line1", "city", "state", "postalCode"];
    var missing = required.some(function (k) { return !values[k]; });
    if (missing) {
      formNotice = { type: "error", text: "Please fill in every field except address line 2." };
      render();
      return;
    }
    if (values.phone.replace(/\D/g, "").length < 6) {
      formNotice = { type: "error", text: "Please enter a valid phone number." };
      render();
      return;
    }
    busy = true;
    formNotice = null;
    render();
    ShafaafApi.post("/me/addresses", {
      label: values.label || "Home",
      recipientName: values.recipientName,
      phone: values.phone,
      line1: values.line1,
      line2: values.line2 || null,
      city: values.city,
      state: values.state,
      postalCode: values.postalCode,
      country: "IN",
      isDefault: Boolean(values.isDefault)
    }, { auth: true })
      .then(function (data) {
        busy = false;
        var saved = data.address;
        if (saved.isDefault) addresses.forEach(function (a) { a.isDefault = false; });
        addresses.push(saved);
        selectedAddressId = saved.id;
        showForm = false;
        draft = {};
        render();
        ShafaafToast.show("Address saved.");
      })
      .catch(function (err) {
        busy = false;
        formNotice = { type: "error", text: (err && err.message) || "The address could not be saved. Please try again." };
        render();
      });
  }

  function removeAddress(id) {
    busy = true;
    render();
    ShafaafApi.del("/me/addresses/" + id, { auth: true })
      .then(function () {
        addresses = addresses.filter(function (a) { return a.id !== id; });
        if (selectedAddressId === id) selectedAddressId = null;
        pickDefaultAddress();
      }, function (err) {
        ShafaafToast.show((err && err.message) || "The address could not be removed.", { type: "error" });
      })
      .then(function () { busy = false; render(); });
  }

  function placeOrder() {
    if (!selectedAddressId || busy) return;
    busy = true;
    notice = null;
    render();
    var placed = null;
    ShafaafApi.post("/checkout/place", { addressId: selectedAddressId }, { auth: true })
      .then(function (data) {
        placed = data;
        // The order is placed and the account cart is now empty on the
        // backend — let the badge and drawer catch up.
        ShafaafCart.refresh();
        var address = addresses.find(function (a) { return a.id === selectedAddressId; });
        var user = ShafaafAuth.getUser();
        if (!data.payment) return { status: "unavailable" };
        return ShafaafPayment.open(data.payment, {
          orderNumber: data.order.orderNumber,
          name: address ? address.recipientName : "",
          email: user ? user.email : "",
          contact: address ? address.phone : ""
        });
      })
      .then(function (result) {
        var target = "orders.html?id=" + encodeURIComponent(placed.order.id);
        if (result.status === "completed") target += "&paid=1";
        window.location.href = target;
      })
      .catch(function (err) {
        busy = false;
        if (placed) {
          // The order exists; only the payment window failed to open.
          window.location.href = "orders.html?id=" + encodeURIComponent(placed.order.id);
          return;
        }
        var issues = err && err.details && Array.isArray(err.details.issues) ? err.details.issues : [];
        notice = {
          type: "error",
          text: (err && err.message) || "Your order could not be placed. Please try again.",
          items: issues.map(function (i) {
            return i.productName + " (" + i.variantLabel + "): only " + i.availableQuantity + " left, you asked for " + i.requestedQuantity;
          })
        };
        if (issues.length) ShafaafCart.refresh();
        if (err && err.status === 400) {
          // Empty cart on the backend — reload so the page shows that.
          load();
          return;
        }
        render();
      });
  }

  // ---- events -----------------------------------------------------------

  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-checkout-signin]")) { openAccount("signin"); return; }
    if (e.target.closest("[data-checkout-signup]")) { openAccount("signup"); return; }
    if (e.target.closest("[data-checkout-retry]")) { init(); return; }
    if (e.target.closest("[data-address-add]")) { showForm = true; formNotice = null; render(); return; }
    if (e.target.closest("[data-address-cancel]")) { showForm = false; formNotice = null; render(); return; }
    var remove = e.target.closest("[data-address-remove]");
    if (remove) {
      e.preventDefault();
      if (!busy && window.confirm("Remove this address?")) removeAddress(remove.getAttribute("data-address-remove"));
      return;
    }
    if (e.target.closest("[data-place-order]")) { placeOrder(); }
  });

  document.addEventListener("change", function (e) {
    if (e.target.name === "addressId") {
      selectedAddressId = e.target.value;
      render();
    }
  });

  document.addEventListener("submit", function (e) {
    var form = e.target.closest("[data-address-form]");
    if (!form) return;
    e.preventDefault();
    if (!busy) saveAddress(form);
  });

  function init() {
    if (typeof ShafaafAuth === "undefined" || !ShafaafAuth.isAvailable()) {
      renderMessage("Checkout is not available right now", "Sign-in is temporarily unavailable, so orders cannot be placed. Please try again in a little while.");
      return;
    }
    ShafaafAuth.whenReady().then(function () {
      var user = ShafaafAuth.getUser();
      userId = user ? user.id : null;
      if (!user) { renderSignedOut(); return; }
      load();
    });
  }

  // Sign-in or sign-out changes whose checkout this is; a routine token
  // refresh (same account) must not wipe a half-typed address form.
  document.addEventListener("shafaaf:auth:change", function () {
    var user = ShafaafAuth.getUser();
    if ((user ? user.id : null) === userId) return;
    quote = null;
    addresses = [];
    selectedAddressId = null;
    draft = {};
    notice = null;
    init();
  });

  shafaafOnCatalogReady(init);
})();
