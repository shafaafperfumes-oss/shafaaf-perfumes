/**
 * AUTH — who is signed in
 * ------------------------------------------------------------
 * A thin wrapper around the Supabase browser library (loaded from a
 * CDN just before this file). The browser signs the customer in with
 * Supabase directly; what comes back is a short-lived signed token
 * that js/lib/api.js attaches to every backend call, and which the
 * backend verifies by signature — a password never touches our API.
 *
 * The session is kept in localStorage and refreshed automatically,
 * so a customer stays signed in across pages and visits.
 *
 * Any part of the UI can listen for "shafaaf:auth:change" on
 * document to re-render (header icon, account modal, cart sync).
 *
 * If the CDN script failed or config.js has no publishable key, every
 * method here degrades to "sign-in is unavailable" rather than
 * throwing, so the rest of the shop keeps working.
 */

var ShafaafAuth = (function () {
  var client = null;
  var session = null;
  var readyResolve = null;
  var ready = new Promise(function (resolve) { readyResolve = resolve; });

  function available() { return client !== null; }

  function notify(event) {
    document.dispatchEvent(new CustomEvent("shafaaf:auth:change", {
      detail: { user: getUser(), event: event || null }
    }));
  }

  function init() {
    var cfg = window.SHAFAAF_CONFIG || {};
    var sdk = window.supabase;
    if (!cfg.supabaseUrl || !cfg.supabasePublishableKey || !sdk || typeof sdk.createClient !== "function") {
      if (window.console) {
        console.warn("[shafaaf] sign-in unavailable: " + (sdk ? "no publishable key in js/config.js" : "Supabase library did not load"));
      }
      readyResolve();
      return;
    }

    client = sdk.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "shafaaf.auth"
      }
    });

    // INITIAL_SESSION fires once with whatever was saved from a previous
    // visit (or null); later events cover sign-in, sign-out and refresh.
    client.auth.onAuthStateChange(function (event, newSession) {
      session = newSession;
      if (event === "INITIAL_SESSION") readyResolve();
      notify(event);
    });
  }

  function getUser() {
    return session && session.user ? session.user : null;
  }

  function getDisplayName() {
    var user = getUser();
    if (!user) return "";
    var meta = user.user_metadata || {};
    return meta.full_name || user.email || "";
  }

  /** Resolves to a currently valid access token, or null when signed out. */
  function getAccessToken() {
    if (!client) return Promise.resolve(null);
    return client.auth.getSession().then(function (result) {
      var s = result && result.data ? result.data.session : null;
      return s ? s.access_token : null;
    });
  }

  /** Turns Supabase's own wording into something a shopper understands. */
  function friendlyError(error) {
    var raw = (error && error.message) || "";
    var lower = raw.toLowerCase();
    if (lower.indexOf("invalid login credentials") !== -1) return "That email and password do not match.";
    if (lower.indexOf("email not confirmed") !== -1) return "Please confirm your email first — check your inbox for our message.";
    if (lower.indexOf("already registered") !== -1 || lower.indexOf("already exists") !== -1) return "An account with this email already exists. Please sign in instead.";
    if (lower.indexOf("password should be") !== -1 || lower.indexOf("password is too") !== -1) return "Please choose a password of at least 6 characters.";
    if (lower.indexOf("rate limit") !== -1 || lower.indexOf("too many") !== -1) return "Too many attempts — please wait a minute and try again.";
    if (lower.indexOf("failed to fetch") !== -1 || lower.indexOf("network") !== -1) return "Could not reach the sign-in service. Please check your connection.";
    return raw || "Something went wrong. Please try again.";
  }

  function unavailable() {
    return Promise.reject(new Error("Sign-in is not available right now."));
  }

  /**
   * Creates an account. Resolves with `{ needsConfirmation }` — true when
   * Supabase is set to confirm emails, in which case the customer must
   * click the link we emailed before they can sign in.
   */
  function signUp(input) {
    if (!client) return unavailable();
    return client.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { full_name: input.fullName || "" } }
    }).then(function (result) {
      if (result.error) throw new Error(friendlyError(result.error));
      var data = result.data || {};
      // Supabase answers an existing, confirmed email with a fake user that
      // has no identities, to avoid revealing who has an account. Treat it
      // the same as "check your inbox" rather than pretending it worked.
      var needsConfirmation = !data.session;
      return { needsConfirmation: needsConfirmation, user: data.user || null };
    });
  }

  function signIn(input) {
    if (!client) return unavailable();
    return client.auth.signInWithPassword({ email: input.email, password: input.password })
      .then(function (result) {
        if (result.error) throw new Error(friendlyError(result.error));
        return result.data.user;
      });
  }

  function signOut() {
    if (!client) return Promise.resolve();
    return client.auth.signOut().then(function (result) {
      if (result && result.error) throw new Error(friendlyError(result.error));
    });
  }

  function resetPassword(email) {
    if (!client) return unavailable();
    return client.auth.resetPasswordForEmail(email).then(function (result) {
      if (result.error) throw new Error(friendlyError(result.error));
    });
  }

  init();

  return {
    isAvailable: available,
    whenReady: function () { return ready; },
    getUser: getUser,
    getDisplayName: getDisplayName,
    getAccessToken: getAccessToken,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    resetPassword: resetPassword
  };
})();
