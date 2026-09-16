/**
 * SHAFAAF PERFUMES — FRONTEND CONFIG
 * ------------------------------------------------------------
 * The one place the website learns where its backend lives.
 * Nothing in here is secret: this file is served to every visitor's
 * browser, and the backend only ever accepts a public key from it.
 *
 * `supabaseUrl` + `supabasePublishableKey` let the browser sign a
 * customer in through Supabase directly — the backend never sees a
 * password. The publishable key is DESIGNED to sit in a browser: on
 * its own it can do nothing to the database (every table is locked
 * down); it only identifies which Supabase project to sign in to.
 * The secret keys (service role, database password) must never
 * appear here — they belong in backend/.env only.
 *
 * Add `?api=local` to any page URL to point this browser tab at a
 * backend running on your own machine (npm run dev in backend/);
 * `?api=live` switches it back. The choice sticks for the tab.
 */
(function () {
  var LIVE_API = "https://shafaaf-perfumes-production.up.railway.app/api/v1";
  var LOCAL_API = "http://localhost:4000/api/v1";
  var STORAGE_KEY = "shafaaf.api";

  var requested = null;
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get("api") === "local" || params.get("api") === "live") {
      requested = params.get("api");
      sessionStorage.setItem(STORAGE_KEY, requested);
    }
    if (!requested) requested = sessionStorage.getItem(STORAGE_KEY);
  } catch (e) {
    requested = null;
  }

  window.SHAFAAF_CONFIG = {
    apiBaseUrl: requested === "local" ? LOCAL_API : LIVE_API,
    supabaseUrl: "https://uaigqaqpghsqvwelmofx.supabase.co",
    // Supabase dashboard -> Project Settings -> API Keys -> "Publishable key".
    // Leave empty and the site still works; sign-in just says it is unavailable.
    supabasePublishableKey: ""
  };
})();
