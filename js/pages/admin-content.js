/**
 * Admin — Content: social post drafts waiting for the owner
 * (admin.html?view=content).
 *
 *   - the Content agent writes Instagram / Facebook / YouTube / WhatsApp
 *     drafts (caption, hashtags, which photo); they land here as "draft"
 *   - the owner reads each one, fixes the words if needed, and presses
 *     Approve or Reject (with a note the agent reads next round)
 *   - "Copy" puts caption + hashtags on the clipboard for posting by hand;
 *     the auto-poster (a later step) only ever takes approved posts
 *   - the owner can also write a post from scratch with "New post"
 *
 * Nothing on this screen is public and nothing here posts anywhere.
 */
var ShafaafAdminContent = (function () {
  var A = null;
  var PER_PAGE = 20;
  var PLATFORMS = ["instagram", "facebook", "youtube", "whatsapp"];
  var KINDS = ["post", "reel", "story"];
  var TABS = [
    { key: "draft", label: "Drafts" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
    { key: "published", label: "Published" },
    { key: "", label: "All" },
  ];

  var posts = [];
  var counts = { draft: 0, approved: 0, rejected: 0, published: 0 };
  var total = 0;
  var page = 1;
  var filter = "draft";
  var composing = false;   // the "New post" form is open
  var busy = false;
  var notice = null;

  function helpers() { return A || (A = window.ShafaafAdmin); }
  function esc(text) { return helpers().escapeHtml(text); }
  function el() { return helpers().el(); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }

  function fail(err, fallback) {
    busy = false;
    var text = (err && err.message) || fallback;
    if (err && err.details && err.details.fields && err.details.fields.length) {
      text += " (" + err.details.fields.map(function (f) { return f.path + ": " + f.message; }).join("; ") + ")";
    }
    notice = { type: "error", text: text };
    render();
  }

  function query() {
    return "?page=" + page + "&perPage=" + PER_PAGE + (filter ? "&status=" + filter : "");
  }

  function load() {
    helpers().setTitle("Content");
    helpers().renderLoading();
    var p = helpers().params;
    if (p && typeof p.get === "function") {
      var wanted = p.get("status");
      if (wanted !== null && TABS.some(function (t) { return t.key === wanted; })) filter = wanted;
    }
    return reload();
  }

  function reload() {
    return ShafaafApi.get("/admin/content" + query(), { auth: true, withMeta: true }).then(function (res) {
      posts = res.data.posts;
      total = (res.meta && res.meta.total) || posts.length;
      if (res.meta && res.meta.counts) counts = res.meta.counts;
      busy = false;
      render();
    });
  }

  // ---- pieces ---------------------------------------------------------

  function noticeHtml() {
    return notice ? '<p class="form-notice form-notice--' + notice.type + '" role="alert">' + esc(notice.text) + '</p>' : "";
  }

  function statusHtml(status) {
    var cls = status === "approved" ? "paid" : status === "rejected" ? "cancelled" : status === "published" ? "delivered" : "pending";
    return '<span class="order-status order-status--' + cls + '">' + esc(cap(status)) + '</span>';
  }

  function tabsHtml() {
    var all = counts.draft + counts.approved + counts.rejected + counts.published;
    return '<nav class="admin-tabs" aria-label="Post status">' + TABS.map(function (t) {
      var n = t.key ? counts[t.key] : all;
      return '<button type="button" class="admin-tab' + (filter === t.key ? ' is-active' : '') + '" data-content-tab="' + t.key + '">' +
        esc(t.label) + ' <span class="admin-tab__count">' + n + '</span></button>';
    }).join("") + '</nav>';
  }

  function imageHtml(post) {
    if (!post.imageUrl) {
      return '<div class="admin-content__img admin-content__img--empty">' + shafaafIcon("bottle") + '</div>';
    }
    return '<img class="admin-content__img" src="' + esc(post.imageUrl) + '" alt="" loading="lazy">';
  }

  function whenHtml(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  }

  // datetime-local wants "YYYY-MM-DDTHH:MM" in the browser's own time zone.
  function toLocalInput(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function selectHtml(name, options, value, extraClass) {
    return '<select class="select input--sm ' + (extraClass || "") + '" name="' + name + '">' + options.map(function (o) {
      return '<option value="' + o + '"' + (o === value ? ' selected' : '') + '>' + esc(cap(o)) + '</option>';
    }).join("") + '</select>';
  }

  function cardHtml(post) {
    var locked = post.status === "published";
    var ro = locked ? " readonly" : "";
    return '<article class="admin-content__card" data-content-card="' + esc(post.id) + '">' +
      '<div class="admin-content__side">' +
        imageHtml(post) +
        '<div class="admin-content__facts">' +
          '<span class="admin-content__platform">' + esc(cap(post.platform)) + ' · ' + esc(post.kind) + '</span>' +
          statusHtml(post.status) +
          '<span class="admin-card__meta">' + (post.source === "agent" ? "AI draft" : "Written by you") + '</span>' +
          (post.scheduledFor ? '<span class="admin-card__meta">Planned: ' + esc(whenHtml(post.scheduledFor)) + '</span>' : '') +
          (post.publishedAt ? '<span class="admin-card__meta">Posted: ' + esc(whenHtml(post.publishedAt)) + '</span>' : '') +
          (post.productSlug ? '<a class="admin-card__meta admin-content__product" href="product.html?id=' + esc(post.productSlug) + '" target="_blank" rel="noopener">View product ↗</a>' : '') +
        '</div>' +
      '</div>' +
      '<form class="admin-content__form" data-content-form="' + esc(post.id) + '">' +
        '<input class="input input--sm admin-content__title" name="title" value="' + esc(post.title) + '" maxlength="160" required' + ro + '>' +
        (post.agentNote ? '<p class="admin-content__note"><strong>Agent:</strong> ' + esc(post.agentNote) + '</p>' : '') +
        '<textarea class="input admin-content__caption" name="caption" rows="6" maxlength="4000" required' + ro + '>' + esc(post.caption) + '</textarea>' +
        '<input class="input input--sm" name="hashtags" value="' + esc(post.hashtags || "") + '" placeholder="#hashtags" maxlength="1000"' + ro + '>' +
        '<div class="admin-content__row">' +
          '<label class="admin-content__label">Post on <input class="input input--sm" type="datetime-local" name="scheduledFor" value="' + toLocalInput(post.scheduledFor) + '"' + (locked ? ' disabled' : '') + '></label>' +
          '<input class="input input--sm" name="ownerNote" value="' + esc(post.ownerNote || "") + '" placeholder="Your note (e.g. why rejected)" maxlength="2000">' +
        '</div>' +
        '<div class="admin-content__actions">' +
          '<button type="submit" class="btn btn--outline btn--sm">Save</button>' +
          (post.status !== "approved" && !locked ? '<button type="button" class="btn btn--primary btn--sm" data-content-status="approved">Approve</button>' : '') +
          (post.status !== "rejected" && !locked ? '<button type="button" class="btn btn--outline btn--sm" data-content-status="rejected">Reject</button>' : '') +
          (post.status === "approved" || post.status === "rejected" ? '<button type="button" class="btn btn--outline btn--sm" data-content-status="draft">Back to draft</button>' : '') +
          '<button type="button" class="btn btn--outline btn--sm" data-content-copy>Copy caption</button>' +
          (!locked ? '<button type="button" class="admin-link admin-content__delete" data-content-delete>Delete</button>' : '') +
        '</div>' +
      '</form>' +
    '</article>';
  }

  function composeHtml() {
    if (!composing) return "";
    return '<form class="admin-content__card admin-content__card--new" data-content-form="new">' +
      '<h2 class="admin-h2 admin-content__h2">New post</h2>' +
      '<div class="admin-content__row">' +
        selectHtml("platform", PLATFORMS, "instagram") +
        selectHtml("kind", KINDS, "post") +
      '</div>' +
      '<input class="input input--sm" name="title" placeholder="Short label for this list (not posted)" maxlength="160" required>' +
      '<textarea class="input admin-content__caption" name="caption" rows="6" placeholder="Caption" maxlength="4000" required></textarea>' +
      '<input class="input input--sm" name="hashtags" placeholder="#hashtags" maxlength="1000">' +
      '<div class="admin-content__row">' +
        '<input class="input input--sm" name="imageUrl" placeholder="Photo path, e.g. images/oud-kaaba.webp" maxlength="500">' +
        '<input class="input input--sm" name="productSlug" placeholder="Product slug, e.g. oud-kaaba" maxlength="120">' +
        '<label class="admin-content__label">Post on <input class="input input--sm" type="datetime-local" name="scheduledFor"></label>' +
      '</div>' +
      '<div class="admin-content__actions">' +
        '<button type="submit" class="btn btn--primary btn--sm">Save draft</button>' +
        '<button type="button" class="btn btn--outline btn--sm" data-content-cancel>Cancel</button>' +
      '</div>' +
    '</form>';
  }

  function pagerHtml() {
    var pages = Math.max(1, Math.ceil(total / PER_PAGE));
    if (pages <= 1) return "";
    return '<div class="admin-pager">' +
      '<button type="button" class="btn btn--outline btn--sm" data-content-page="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '>Previous</button>' +
      '<span>Page ' + page + ' of ' + pages + '</span>' +
      '<button type="button" class="btn btn--outline btn--sm" data-content-page="' + (page + 1) + '"' + (page >= pages ? ' disabled' : '') + '>Next</button>' +
    '</div>';
  }

  function emptyText() {
    if (filter === "draft") return "No drafts waiting. Run the Content agent and import its file to get new ones.";
    if (filter === "approved") return "Nothing approved yet. Approved posts are the ones that can go out.";
    if (filter === "rejected") return "Nothing rejected.";
    if (filter === "published") return "Nothing has been posted from here yet.";
    return "No posts yet.";
  }

  function render() {
    el().innerHTML =
      '<p class="admin-help">Posts the AI has drafted for Instagram, Facebook, YouTube and WhatsApp. Read, fix the words if you like, then Approve or Reject. Nothing goes out without your Approve — for now, use Copy caption and post it yourself.</p>' +
      noticeHtml() +
      '<div class="admin-toolbar">' + tabsHtml() +
        '<div class="admin-toolbar__end"><span class="admin-count">' + total + ' shown</span>' +
        '<button type="button" class="btn btn--primary btn--sm" data-content-add>' + shafaafIcon("plus") + 'New post</button></div>' +
      '</div>' +
      composeHtml() +
      (posts.length ? '<div class="admin-content__list">' + posts.map(cardHtml).join("") + '</div>' : '<p class="admin-empty">' + esc(emptyText()) + '</p>') +
      pagerHtml();
    notice = null;
  }

  // ---- helpers for the forms ---------------------------------------------

  function readForm(form, isNew) {
    var body = {
      title: form.title.value.trim(),
      caption: form.caption.value.trim(),
      hashtags: form.hashtags.value.trim(),
      scheduledFor: form.scheduledFor && !form.scheduledFor.disabled && form.scheduledFor.value ? new Date(form.scheduledFor.value).toISOString() : null,
    };
    if (isNew) {
      body.platform = form.platform.value;
      body.kind = form.kind.value;
      body.imageUrl = form.imageUrl.value.trim() || null;
      body.productSlug = form.productSlug.value.trim() || null;
    } else {
      body.ownerNote = form.ownerNote.value.trim() || null;
    }
    return body;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error("Copy is not allowed here."));
    });
  }

  function patch(id, body, successText) {
    busy = true;
    return ShafaafApi.patch("/admin/content/" + id, body, { auth: true })
      .then(function () {
        notice = { type: "success", text: successText };
        return reload();
      })
      .catch(function (err) { fail(err, "Could not save that post."); });
  }

  // ---- events (delegated; admin.js owns the page shell) --------------------

  document.addEventListener("submit", function (e) {
    var form = e.target.closest("[data-content-form]");
    if (!form || busy) return;
    e.preventDefault();
    var id = form.getAttribute("data-content-form");
    if (id === "new") {
      busy = true;
      ShafaafApi.post("/admin/content", readForm(form, true), { auth: true })
        .then(function () {
          composing = false;
          filter = "draft";
          page = 1;
          notice = { type: "success", text: "Draft saved." };
          return reload();
        })
        .catch(function (err) { fail(err, "Could not save that post."); });
      return;
    }
    var post = posts.filter(function (p) { return p.id === id; })[0];
    var body = readForm(form, false);
    // A published post only ever accepts the owner's note.
    if (post && post.status === "published") body = { ownerNote: body.ownerNote };
    patch(id, body, "Saved.");
  });

  document.addEventListener("click", function (e) {
    var tab = e.target.closest("[data-content-tab]");
    if (tab) {
      filter = tab.getAttribute("data-content-tab");
      page = 1;
      reload().catch(function (err) { fail(err, "Could not load those posts."); });
      return;
    }
    if (e.target.closest("[data-content-add]")) { composing = true; render(); el().querySelector('[data-content-form="new"] [name="title"]').focus(); return; }
    if (e.target.closest("[data-content-cancel]")) { composing = false; render(); return; }
    var pager = e.target.closest("[data-content-page]");
    if (pager && !pager.disabled) {
      page = Number(pager.getAttribute("data-content-page"));
      reload().catch(function (err) { fail(err, "Could not load that page."); });
      return;
    }

    var card = e.target.closest("[data-content-card]");
    if (!card) return;
    var id = card.getAttribute("data-content-card");
    var form = card.querySelector("form");

    var status = e.target.closest("[data-content-status]");
    if (status && !busy) {
      var next = status.getAttribute("data-content-status");
      var body = readForm(form, false);
      body.status = next;
      if (next === "rejected" && !body.ownerNote) {
        var why = window.prompt("Why reject it? One line helps the AI write better next time (optional).", "");
        if (why === null) return;
        body.ownerNote = why.trim() || null;
      }
      patch(id, body, next === "approved" ? "Approved — it can go out now." : next === "rejected" ? "Rejected." : "Back in drafts.");
      return;
    }
    if (e.target.closest("[data-content-copy]")) {
      var text = form.caption.value.trim() + (form.hashtags.value.trim() ? "\n\n" + form.hashtags.value.trim() : "");
      copyText(text)
        .then(function () { notice = { type: "success", text: "Caption copied — paste it into the app." }; render(); })
        .catch(function (err) { fail(err, "Could not copy."); });
      return;
    }
    if (e.target.closest("[data-content-delete]") && !busy) {
      if (!window.confirm("Delete this post? This cannot be undone.")) return;
      busy = true;
      ShafaafApi.del("/admin/content/" + id, { auth: true })
        .then(function () { notice = { type: "success", text: "Deleted." }; return reload(); })
        .catch(function (err) { fail(err, "Could not delete that post."); });
    }
  });

  return { load: load };
})();
