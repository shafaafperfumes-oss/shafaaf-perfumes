/**
 * Account modal — sign in, create an account, sign out.
 * Opened by any [data-account-toggle] element (header icon, mobile
 * menu). Injects its own markup, so pages only need the script tag.
 * Re-renders whenever "shafaaf:auth:change" fires, so it always
 * shows the right state without any page-level wiring.
 *
 * Administrators also get a "Store admin" shortcut to admin.html. That
 * is purely a convenience: the role is asked of the backend (/me) and
 * every admin page and API re-checks it server-side, so hiding or
 * showing the button here grants nothing.
 */

var ShafaafAccountModal = (function () {
  var MODAL_ID = "account-modal";
  // Which form the signed-out view shows: "signin" | "signup" | "forgot".
  var view = "signin";
  var notice = null;   // { type: "success" | "error", text }
  var busy = false;
  // What the shopper last typed, so an error re-render does not wipe it.
  var draft = { fullName: "", email: "" };
  // The signed-in account's role, looked up once per sign-in:
  // { userId, isAdmin }. Null until asked, or after a sign-out.
  var role = null;

  function modal() { return document.getElementById(MODAL_ID); }
  function body() { return document.getElementById("account-modal-body"); }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function inject() {
    if (modal()) return;
    var wrap = document.createElement("div");
    wrap.className = "modal";
    wrap.id = MODAL_ID;
    wrap.setAttribute("aria-hidden", "true");
    wrap.setAttribute("aria-label", "Account");
    wrap.innerHTML =
      '<div class="modal__panel account-panel">' +
        '<button type="button" class="close-btn" data-close aria-label="Close" style="position:absolute;top:14px;right:14px;z-index:2"><span data-icon="close"></span></button>' +
        '<div id="account-modal-body"></div>' +
      '</div>';
    document.body.appendChild(wrap);
    shafaafHydrateIcons(wrap);
    wrap.querySelector("[data-close]").addEventListener("click", close);
    wrap.addEventListener("click", function (evt) { if (evt.target === wrap) close(); });
  }

  function valueAttr(name) {
    return ' value="' + escapeHtml(draft[name] || "") + '"';
  }

  function noticeHtml() {
    if (!notice) return "";
    return '<p class="form-notice form-notice--' + notice.type + '" role="alert">' + escapeHtml(notice.text) + '</p>';
  }

  function submitLabel(text) {
    return busy ? "Please wait…" : text;
  }

  function renderSignedIn(user) {
    var name = ShafaafAuth.getDisplayName();
    return (
      '<span class="eyebrow">Your account</span>' +
      '<h2 class="section-title account-panel__title">Hello, ' + escapeHtml(name.split(" ")[0] || "there") + '</h2>' +
      '<p class="section-sub account-panel__email">' + escapeHtml(user.email || "") + '</p>' +
      noticeHtml() +
      '<div class="account-panel__actions">' +
        (isAdmin(user) ? '<a href="admin.html" class="btn btn--primary btn--block">Store admin</a>' : "") +
        '<a href="orders.html" class="btn btn--' + (isAdmin(user) ? "outline" : "primary") + ' btn--block">Your orders</a>' +
        '<a href="cart.html" class="btn btn--outline btn--block">View your cart</a>' +
        '<button type="button" class="btn btn--outline btn--block" data-account-signout>' + submitLabel("Sign out") + '</button>' +
      '</div>'
    );
  }

  function isAdmin(user) {
    return Boolean(role && user && role.userId === user.id && role.isAdmin);
  }

  /**
   * Asks the backend whether the signed-in account is an administrator,
   * then re-renders if the modal is still open for that same account.
   * A failed lookup (offline, backend down) just means no shortcut.
   */
  function lookupRole(user) {
    if (!user || (role && role.userId === user.id)) return;
    if (typeof ShafaafApi === "undefined") return;
    ShafaafApi.get("/me", { auth: true }).then(function (data) {
      var profile = data && data.profile;
      if (!profile) return;
      role = { userId: user.id, isAdmin: profile.role === "admin" };
      var current = ShafaafAuth.getUser();
      if (isOpen() && current && current.id === user.id) render();
    }).catch(function () { /* no shortcut this time */ });
  }

  function renderTabs() {
    return (
      '<div class="auth-tabs" role="tablist">' +
        '<button type="button" role="tab" class="auth-tab' + (view === "signin" ? " is-active" : "") + '" data-account-view="signin" aria-selected="' + (view === "signin") + '">Sign in</button>' +
        '<button type="button" role="tab" class="auth-tab' + (view === "signup" ? " is-active" : "") + '" data-account-view="signup" aria-selected="' + (view === "signup") + '">Create account</button>' +
      '</div>'
    );
  }

  function renderSignIn() {
    return (
      '<form class="auth-form" data-account-form="signin" novalidate>' +
        '<div class="field"><label class="field__label" for="acct-signin-email">Email</label>' +
          '<input class="input" type="email" id="acct-signin-email" name="email" autocomplete="email" required' + valueAttr("email") + '></div>' +
        '<div class="field"><label class="field__label" for="acct-signin-password">Password</label>' +
          '<input class="input" type="password" id="acct-signin-password" name="password" autocomplete="current-password" required></div>' +
        noticeHtml() +
        '<button type="submit" class="btn btn--primary btn--block"' + (busy ? " disabled" : "") + '>' + submitLabel("Sign in") + '</button>' +
        '<button type="button" class="link-underline auth-form__link" data-account-view="forgot">Forgot your password?</button>' +
      '</form>'
    );
  }

  function renderSignUp() {
    return (
      '<form class="auth-form" data-account-form="signup" novalidate>' +
        '<div class="field"><label class="field__label" for="acct-signup-name">Full name</label>' +
          '<input class="input" type="text" id="acct-signup-name" name="fullName" autocomplete="name" required maxlength="160"' + valueAttr("fullName") + '></div>' +
        '<div class="field"><label class="field__label" for="acct-signup-email">Email</label>' +
          '<input class="input" type="email" id="acct-signup-email" name="email" autocomplete="email" required' + valueAttr("email") + '></div>' +
        '<div class="field"><label class="field__label" for="acct-signup-password">Password</label>' +
          '<input class="input" type="password" id="acct-signup-password" name="password" autocomplete="new-password" required minlength="6">' +
          '<span class="field__hint">At least 6 characters.</span></div>' +
        noticeHtml() +
        '<button type="submit" class="btn btn--primary btn--block"' + (busy ? " disabled" : "") + '>' + submitLabel("Create account") + '</button>' +
      '</form>'
    );
  }

  function renderForgot() {
    return (
      '<form class="auth-form" data-account-form="forgot" novalidate>' +
        '<p class="section-sub">Enter your email and we will send you a link to choose a new password.</p>' +
        '<div class="field"><label class="field__label" for="acct-forgot-email">Email</label>' +
          '<input class="input" type="email" id="acct-forgot-email" name="email" autocomplete="email" required' + valueAttr("email") + '></div>' +
        noticeHtml() +
        '<button type="submit" class="btn btn--primary btn--block"' + (busy ? " disabled" : "") + '>' + submitLabel("Send reset link") + '</button>' +
        '<button type="button" class="link-underline auth-form__link" data-account-view="signin">Back to sign in</button>' +
      '</form>'
    );
  }

  function render() {
    var el = body();
    if (!el) return;

    if (!ShafaafAuth.isAvailable()) {
      el.innerHTML =
        '<span class="eyebrow">Your account</span>' +
        '<h2 class="section-title account-panel__title">Sign-in is not available right now</h2>' +
        '<p class="section-sub">Please try again in a little while. You can keep browsing and adding to your cart in the meantime.</p>';
      return;
    }

    var user = ShafaafAuth.getUser();
    if (user) {
      el.innerHTML = renderSignedIn(user);
      lookupRole(user);
      return;
    }

    var heading = view === "signup" ? "Create your account" : view === "forgot" ? "Reset your password" : "Welcome back";
    el.innerHTML =
      '<span class="eyebrow">Your account</span>' +
      '<h2 class="section-title account-panel__title">' + heading + '</h2>' +
      (view === "forgot" ? "" : renderTabs()) +
      (view === "signup" ? renderSignUp() : view === "forgot" ? renderForgot() : renderSignIn());
  }

  function setNotice(type, text) {
    notice = text ? { type: type, text: text } : null;
  }

  function isOpen() {
    var m = modal();
    return Boolean(m && m.classList.contains("is-open"));
  }

  function open(startView) {
    inject();
    if (startView) view = startView;
    setNotice(null);
    render();
    var m = modal();
    m.classList.add("is-open");
    m.setAttribute("aria-hidden", "false");
    ShafaafOverlay.lock();
    window.shafaafActiveOverlayClose = close;
    var first = m.querySelector("input");
    if (first) setTimeout(function () { first.focus(); }, 60);
  }

  function close() {
    var m = modal();
    if (!m || !m.classList.contains("is-open")) return;
    m.classList.remove("is-open");
    m.setAttribute("aria-hidden", "true");
    ShafaafOverlay.unlock();
  }

  function fieldValues(form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (input) {
      if (input.name) out[input.name] = input.value.trim();
    });
    return out;
  }

  function run(work) {
    busy = true;
    setNotice(null);
    render();
    return work().then(
      function () { busy = false; },
      function (err) {
        busy = false;
        setNotice("error", (err && err.message) || "Something went wrong. Please try again.");
        render();
      }
    );
  }

  function handleSubmit(form) {
    var kind = form.getAttribute("data-account-form");
    var values = fieldValues(form);
    draft = { fullName: values.fullName || draft.fullName, email: values.email || "" };

    if (!values.email || (kind !== "forgot" && !values.password) || (kind === "signup" && !values.fullName)) {
      setNotice("error", "Please fill in every field.");
      render();
      return;
    }
    if (kind !== "forgot" && values.password.length < 6) {
      setNotice("error", "Please choose a password of at least 6 characters.");
      render();
      return;
    }

    if (kind === "signin") {
      run(function () {
        return ShafaafAuth.signIn(values).then(function () {
          close();
          ShafaafToast.show("Welcome back, " + (ShafaafAuth.getDisplayName().split(" ")[0] || "there") + ".");
        });
      });
    } else if (kind === "signup") {
      run(function () {
        return ShafaafAuth.signUp(values).then(function (result) {
          if (result.needsConfirmation) {
            view = "signin";
            setNotice("success", "Almost there — we have emailed you a confirmation link. Click it, then sign in here.");
            render();
          } else {
            close();
            ShafaafToast.show("Welcome to Shafaaf, " + (values.fullName.split(" ")[0]) + ".");
          }
        });
      });
    } else if (kind === "forgot") {
      run(function () {
        return ShafaafAuth.resetPassword(values.email).then(function () {
          setNotice("success", "If an account exists for that email, a reset link is on its way.");
          render();
        });
      });
    }
  }

  function handleSignOut() {
    run(function () {
      return ShafaafAuth.signOut().then(function () {
        close();
        ShafaafToast.show("You have been signed out.");
      });
    });
  }

  /** Header icon shows a small dot, and menu links change wording, when signed in. */
  function reflectHeader() {
    var user = ShafaafAuth.getUser();
    document.querySelectorAll("[data-account-toggle]").forEach(function (el) {
      el.classList.toggle("is-signed-in", Boolean(user));
      el.setAttribute("aria-label", user ? "Your account" : "Sign in");
    });
    document.querySelectorAll("[data-account-label]").forEach(function (el) {
      el.textContent = user ? "Account" : "Sign in";
    });
  }

  function bind() {
    document.addEventListener("click", function (e) {
      var toggle = e.target.closest("[data-account-toggle]");
      if (toggle) {
        e.preventDefault();
        if (typeof window.shafaafCloseMobileMenu === "function") window.shafaafCloseMobileMenu();
        open();
        return;
      }
      var tab = e.target.closest("[data-account-view]");
      if (tab && isOpen()) {
        view = tab.getAttribute("data-account-view");
        setNotice(null);
        render();
        return;
      }
      if (e.target.closest("[data-account-signout]") && isOpen()) {
        handleSignOut();
      }
    });

    document.addEventListener("submit", function (e) {
      var form = e.target.closest("[data-account-form]");
      if (!form) return;
      e.preventDefault();
      if (!busy) handleSubmit(form);
    });

    document.addEventListener("shafaaf:auth:change", function () {
      var user = ShafaafAuth.getUser();
      if (!user || (role && role.userId !== user.id)) role = null;
      reflectHeader();
      if (isOpen()) render();
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bind();
    ShafaafAuth.whenReady().then(reflectHeader);
  });

  return { open: open, close: close };
})();
