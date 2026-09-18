/**
 * API CLIENT — talking to the backend
 * ------------------------------------------------------------
 * One small helper every feature uses to call the backend, so the
 * base URL, the sign-in token, JSON encoding and the response
 * envelope are handled in exactly one place.
 *
 * The backend always answers with `{ success: true, data }` or
 * `{ success: false, error: { code, message } }`. Callers get `data`
 * back on success; on failure they get a rejected promise carrying a
 * `ShafaafApiError` whose `.message` is safe to show to a shopper and
 * whose `.status` lets them tell "not signed in" (401) from "sold out"
 * (409) and so on.
 *
 *   ShafaafApi.get("/me", { auth: true }).then(function (data) { ... });
 *   ShafaafApi.post("/cart/items", { variantId: id, quantity: 1 }, { auth: true });
 */

function ShafaafApiError(message, status, code, details) {
  this.name = "ShafaafApiError";
  this.message = message;
  this.status = status;
  this.code = code || null;
  this.details = details || null;
}
ShafaafApiError.prototype = Object.create(Error.prototype);
ShafaafApiError.prototype.constructor = ShafaafApiError;

var ShafaafApi = (function () {
  var TIMEOUT_MS = 15000;
  /** A multi-megabyte photo on a slow connection needs far longer than a JSON call. */
  var UPLOAD_TIMEOUT_MS = 120000;

  function baseUrl() {
    return (window.SHAFAAF_CONFIG && window.SHAFAAF_CONFIG.apiBaseUrl) || "";
  }

  function tokenFor(opts) {
    if (!opts.auth) return Promise.resolve(null);
    if (typeof ShafaafAuth === "undefined") return Promise.resolve(null);
    return ShafaafAuth.whenReady().then(ShafaafAuth.getAccessToken);
  }

  function request(path, opts) {
    opts = opts || {};
    var base = baseUrl();
    if (!base || typeof window.fetch !== "function") {
      return Promise.reject(new ShafaafApiError("The shop's backend is not configured.", 0, "NO_API"));
    }

    return tokenFor(opts).then(function (token) {
      if (opts.auth && !token) {
        throw new ShafaafApiError("Please sign in to continue.", 401, "NOT_SIGNED_IN");
      }

      var headers = { Accept: "application/json" };
      if (token) headers.Authorization = "Bearer " + token;
      // A file goes up as the raw request body with its own type; anything
      // else is JSON.
      var body;
      if (opts.file) {
        headers["Content-Type"] = opts.file.type;
        body = opts.file;
      } else if (opts.body !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(opts.body);
      }

      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timer = setTimeout(function () { if (controller) controller.abort(); }, opts.file ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS);

      return fetch(base + path, {
        method: opts.method || "GET",
        headers: headers,
        body: body,
        signal: controller ? controller.signal : undefined
      })
        .then(function (res) {
          clearTimeout(timer);
          if (res.status === 204) return { success: true, data: null, status: 204 };
          return res.json().then(
            function (body) { body = body || {}; body.status = res.status; return body; },
            function () { return { success: false, status: res.status, error: { message: "The backend gave an unexpected reply." } }; }
          );
        })
        .then(function (body) {
          // Paged replies carry { page, perPage, total } in `meta`; a
          // caller that needs it asks with { withMeta: true }.
          if (body.success) return opts.withMeta ? { data: body.data, meta: body.meta || null } : body.data;
          var err = body.error || {};
          throw new ShafaafApiError(
            err.message || "Something went wrong. Please try again.",
            body.status,
            err.code,
            err.details
          );
        })
        .catch(function (err) {
          clearTimeout(timer);
          if (err instanceof ShafaafApiError) throw err;
          var aborted = err && err.name === "AbortError";
          throw new ShafaafApiError(
            aborted ? "The backend took too long to answer. Please try again." : "Could not reach the backend. Please check your connection.",
            0,
            aborted ? "TIMEOUT" : "NETWORK"
          );
        });
    });
  }

  return {
    request: request,
    get: function (path, opts) { return request(path, Object.assign({}, opts, { method: "GET" })); },
    post: function (path, body, opts) { return request(path, Object.assign({}, opts, { method: "POST", body: body })); },
    patch: function (path, body, opts) { return request(path, Object.assign({}, opts, { method: "PATCH", body: body })); },
    /** Sends a File/Blob as the request body (used by the admin photo upload). */
    upload: function (path, file, opts) { return request(path, Object.assign({}, opts, { method: "POST", file: file })); },
    del: function (path, opts) { return request(path, Object.assign({}, opts, { method: "DELETE" })); }
  };
})();
