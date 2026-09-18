/**
 * Admin — Products: the catalogue, and one product's editor.
 *
 *   admin.html?view=products         every product (hidden ones too), search,
 *                                    "Add product"
 *   admin.html?view=product&id=new   create a product: details, sizes and
 *                                    photos in one go
 *   admin.html?view=product&id=…     edit one: details, sizes & prices,
 *                                    photos (main + one per form)
 *
 * Photos go to Supabase Storage through the backend (POST
 * /admin/uploads/product-image) exactly as chosen — nothing is resized in
 * the browser. A form's photo (perfume bottle vs attar vial) is stored on
 * every size of that form, which is what the shop reads.
 *
 * Prices are typed in rupees here and sent as paise — the backend stores
 * paise and refuses anything else, so the rounding happens once, in
 * toPaise(), and never in the database.
 */
var ShafaafAdminProducts = (function () {
  var A = null; // ShafaafAdmin helpers, looked up lazily (admin.js defines them)
  var GENDERS = ["Unisex", "Men", "Women"];
  var IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
  var MAX_IMAGE_MB = 12;
  var NEW_CATEGORY = "__new__";

  var list = [];
  var listSearch = "";
  var categories = [];
  var product = null;        // admin detail of the product being edited; null while creating
  var form = null;           // editable copy of the details
  var slugTouched = false;   // stop auto-filling the slug once the owner edits it
  var pendingSizes = [];     // sizes queued for a product that is not saved yet
  var typeImages = {};       // variantType -> url, for a product that is not saved yet
  var busy = false;
  var uploading = null;      // photo slot key while its file is on its way up
  var notice = null;

  function helpers() { return A || (A = window.ShafaafAdmin); }
  function esc(text) { return helpers().escapeHtml(text); }
  function el() { return helpers().el(); }

  function isNew() { return !product; }
  function slugify(value) { return typeof shafaafSlugify === "function" ? shafaafSlugify(value) : String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
  function toPaise(rupees) { return Math.round(Number(rupees) * 100); }
  function toRupees(paise) { return paise == null ? "" : String(paise / 100); }
  function typeLabel(key) { var t = shafaafGetProductType(key); return t ? t.label : key; }
  function buildSku(slug, variantType, ml) { return "SHF-" + slug.toUpperCase() + "-" + variantType.toUpperCase() + "-" + ml; }

  function noticeHtml() {
    return notice ? '<p class="form-notice form-notice--' + notice.type + '" role="alert">' + esc(notice.text) + '</p>' : "";
  }

  function fail(err, fallback) {
    busy = false;
    uploading = null;
    var text = (err && err.message) || fallback;
    if (err && err.details && err.details.fields && err.details.fields.length) {
      text += " (" + err.details.fields.map(function (f) { return f.path + ": " + f.message; }).join("; ") + ")";
    }
    notice = { type: "error", text: text };
    render();
  }

  // ---- list ---------------------------------------------------------------

  function loadList() {
    helpers().setTitle("Products");
    helpers().renderLoading();
    return ShafaafApi.get("/admin/products?perPage=100", { auth: true }).then(function (data) {
      list = data.products || [];
      renderList();
    });
  }

  function thumb(url, name) {
    return url
      ? '<img class="admin-card__img" src="' + esc(url) + '" alt="" loading="lazy">'
      : '<span class="admin-card__img admin-card__img--empty">' + shafaafIcon("bottle") + '</span>';
  }

  function renderList() {
    var term = listSearch.trim().toLowerCase();
    var visible = term ? list.filter(function (p) { return p.name.toLowerCase().indexOf(term) !== -1; }) : list;
    el().innerHTML =
      '<div class="admin-toolbar">' +
        '<input class="input admin-search" type="search" placeholder="Search products…" value="' + esc(listSearch) + '" data-admin-list-search aria-label="Search products">' +
        '<div class="admin-toolbar__end">' +
          '<span class="admin-count">' + visible.length + ' of ' + list.length + ' products</span>' +
          '<a class="btn btn--primary btn--sm" href="' + helpers().href({ view: "product", id: "new" }) + '">' + shafaafIcon("plus") + ' Add product</a>' +
        '</div>' +
      '</div>' +
      (visible.length
        ? '<div class="admin-cards">' +
            visible.map(function (p) {
              return (
                '<a class="admin-card' + (p.isActive ? "" : " is-hidden") + '" href="' + helpers().href({ view: "product", id: p.id }) + '">' +
                  thumb(p.heroImageUrl, p.name) +
                  '<span class="admin-card__body">' +
                    '<span class="admin-card__name">' + esc(p.name) + '</span>' +
                    '<span class="admin-card__meta">' + esc([p.family, p.gender].filter(Boolean).join(" · ")) + '</span>' +
                    '<span class="admin-card__meta">' + p.variantCount + (p.variantCount === 1 ? " size" : " sizes") + ' · ' + p.stockOnHand + ' in stock' + '</span>' +
                    (p.isActive ? "" : '<span class="order-status order-status--cancelled">Hidden from shop</span>') +
                  '</span>' +
                '</a>'
              );
            }).join("") +
          '</div>'
        : '<p class="admin-empty">' + (term ? "No product matches that search." : "No products yet — add the first one.") + '</p>');
    shafaafHydrateIcons(el());
  }

  // ---- editor: load ---------------------------------------------------------

  function emptyForm() {
    return {
      name: "", slug: "", familyId: "", newFamily: "", gender: "Unisex", description: "",
      notes: "", isBestseller: false, isNew: true, isActive: true, heroImageUrl: null, heroImageAlt: null
    };
  }

  function formFrom(detail) {
    return {
      name: detail.name, slug: detail.slug, familyId: detail.familyId || "", newFamily: "",
      gender: detail.gender || "Unisex", description: detail.description || "",
      notes: (detail.notes || []).join(", "), isBestseller: !!detail.isBestseller, isNew: !!detail.isNew,
      isActive: detail.isActive !== false, heroImageUrl: detail.heroImageUrl || null, heroImageAlt: detail.heroImageAlt || null
    };
  }

  function loadEditor() {
    var id = helpers().params.get("id") || "new";
    helpers().setTitle(id === "new" ? "New product" : "Product");
    helpers().renderLoading();
    notice = null;
    busy = false;
    uploading = null;
    pendingSizes = [];
    typeImages = {};
    slugTouched = id !== "new";

    var loads = [ShafaafApi.get("/admin/categories", { auth: true })];
    if (id !== "new") loads.push(ShafaafApi.get("/admin/products/" + encodeURIComponent(id), { auth: true }));
    return Promise.all(loads).then(function (results) {
      categories = results[0].categories || [];
      product = results[1] ? results[1].product : null;
      form = product ? formFrom(product) : emptyForm();
      render();
    }).catch(function (err) {
      if (err && err.status === 404) {
        helpers().renderMessage("Product not found", "No product has that id.", '<div class="checkout-actions"><a href="' + helpers().href({ view: "products" }) + '" class="btn btn--primary">All products</a></div>');
        return;
      }
      throw err;
    });
  }

  /**
   * Re-reads the product after a change. Typing in the details form is kept
   * across the re-render unless `resetForm` says the saved copy should win
   * (right after the details themselves were saved).
   */
  function reloadProduct(resetForm) {
    return ShafaafApi.get("/admin/products/" + encodeURIComponent(product.id), { auth: true }).then(function (data) {
      product = data.product;
      if (resetForm) { form = formFrom(product); el().innerHTML = ""; }
      render();
    });
  }

  // ---- editor: render -------------------------------------------------------

  function variantTypesInUse() {
    var keys = [];
    (product ? product.variants : pendingSizes).forEach(function (v) {
      if (keys.indexOf(v.variantType) === -1) keys.push(v.variantType);
    });
    return keys;
  }

  function imageForType(key) {
    if (!product) return typeImages[key] || null;
    var withImage = product.variants.filter(function (v) { return v.variantType === key && v.imageUrl; })[0];
    return withImage ? withImage.imageUrl : null;
  }

  function photoSlot(key, title, hint, url) {
    var isUploading = uploading === key;
    return (
      '<div class="admin-photo">' +
        '<div class="admin-photo__preview">' +
          (url ? '<img src="' + esc(url) + '" alt="">' : '<span class="admin-photo__empty">' + shafaafIcon("bottle") + '<span>No photo</span></span>') +
          (isUploading ? '<span class="admin-photo__busy">Uploading…</span>' : "") +
        '</div>' +
        '<div class="admin-photo__info">' +
          '<p class="admin-photo__title">' + esc(title) + '</p>' +
          '<p class="admin-photo__hint">' + esc(hint) + '</p>' +
          '<div class="admin-photo__actions">' +
            '<label class="btn btn--outline btn--sm' + (busy || isUploading ? " is-disabled" : "") + '">' +
              (url ? "Replace" : "Upload") +
              '<input type="file" accept="' + IMAGE_TYPES.join(",") + '" data-photo="' + esc(key) + '" hidden' + (busy || isUploading ? " disabled" : "") + '>' +
            '</label>' +
            (url ? '<button type="button" class="btn btn--outline btn--sm btn--danger" data-photo-remove="' + esc(key) + '"' + (busy || isUploading ? " disabled" : "") + '>Remove</button>' : "") +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderPhotos() {
    var slots = [
      photoSlot("hero", "Main photo", "Shown wherever a form has no photo of its own.", form.heroImageUrl),
      photoSlot("hover", "Second photo", "Appears when a customer hovers over the card.", form.heroImageAlt)
    ];
    variantTypesInUse().forEach(function (key) {
      var label = typeLabel(key);
      slots.push(photoSlot("type:" + key, label + " photo", "Shown in the " + label + " section and when a customer picks " + label + ".", imageForType(key)));
    });
    return (
      '<h2 class="checkout-title">Photos</h2>' +
      '<p class="admin-actions__hint">JPEG, PNG, WebP or AVIF up to ' + MAX_IMAGE_MB + ' MB. Photos are stored exactly as uploaded — portrait (4:5) or square looks best.</p>' +
      '<div class="admin-photos">' + slots.join("") + '</div>' +
      (variantTypesInUse().length ? "" : '<p class="admin-actions__hint">Add a size below to get a photo slot for that form (Perfume / Attar / Bakhoor).</p>')
    );
  }

  function categoryOptions() {
    return (
      '<option value="">— none —</option>' +
      categories.map(function (c) {
        return '<option value="' + esc(c.id) + '"' + (c.id === form.familyId ? " selected" : "") + '>' + esc(c.name) + '</option>';
      }).join("") +
      '<option value="' + NEW_CATEGORY + '"' + (form.familyId === NEW_CATEGORY ? " selected" : "") + '>+ New category…</option>'
    );
  }

  function renderDetailsForm() {
    var disabled = busy ? " disabled" : "";
    return (
      '<form class="admin-form" data-product-form novalidate>' +
        '<div class="field"><label class="field__label" for="pf-name">Name</label>' +
          '<input class="input" id="pf-name" name="name" maxlength="160" required value="' + esc(form.name) + '" placeholder="e.g. Royal Amber"' + disabled + '></div>' +
        '<div class="field"><label class="field__label" for="pf-slug">Web address</label>' +
          '<input class="input" id="pf-slug" name="slug" maxlength="120" required value="' + esc(form.slug) + '" placeholder="royal-amber" pattern="[a-z0-9-]+"' + disabled + '>' +
          '<span class="admin-form__hint">product.html?id=<strong>' + esc(form.slug || "…") + '</strong> — lowercase letters, numbers and hyphens only.</span></div>' +
        '<div class="admin-form__row">' +
          '<div class="field"><label class="field__label" for="pf-family">Category</label>' +
            '<select class="select" id="pf-family" name="familyId"' + disabled + '>' + categoryOptions() + '</select></div>' +
          '<div class="field"><label class="field__label" for="pf-gender">For</label>' +
            '<select class="select" id="pf-gender" name="gender"' + disabled + '>' +
              GENDERS.map(function (g) { return '<option' + (g === form.gender ? " selected" : "") + '>' + g + '</option>'; }).join("") +
            '</select></div>' +
        '</div>' +
        (form.familyId === NEW_CATEGORY
          ? '<div class="field"><label class="field__label" for="pf-new-family">New category name</label>' +
            '<input class="input" id="pf-new-family" name="newFamily" maxlength="80" required value="' + esc(form.newFamily) + '" placeholder="e.g. Amber"' + disabled + '></div>'
          : "") +
        '<div class="field"><label class="field__label" for="pf-desc">Description</label>' +
          '<textarea class="input admin-form__textarea" id="pf-desc" name="description" maxlength="5000" rows="5" placeholder="What it smells like, when to wear it…"' + disabled + '>' + esc(form.description) + '</textarea></div>' +
        '<div class="field"><label class="field__label" for="pf-notes">Notes</label>' +
          '<input class="input" id="pf-notes" name="notes" value="' + esc(form.notes) + '" placeholder="Rose, Oud, Vanilla, Amber"' + disabled + '>' +
          '<span class="admin-form__hint">Comma-separated, in order. The shop groups them into top / heart / base by itself.</span></div>' +
        '<div class="admin-form__checks">' +
          '<label class="checkbox-row"><input type="checkbox" name="isBestseller"' + (form.isBestseller ? " checked" : "") + disabled + '> Bestseller badge</label>' +
          '<label class="checkbox-row"><input type="checkbox" name="isNew"' + (form.isNew ? " checked" : "") + disabled + '> New arrival badge</label>' +
          (isNew() ? "" : '<label class="checkbox-row"><input type="checkbox" name="isActive"' + (form.isActive ? " checked" : "") + disabled + '> Shown in the shop</label>') +
        '</div>' +
        noticeHtml() +
        '<div class="checkout-actions checkout-actions--start">' +
          '<button type="submit" class="btn btn--primary"' + disabled + '>' + (busy ? "Saving…" : isNew() ? "Create product" : "Save details") + '</button>' +
          (isNew() ? "" : '<a class="btn btn--outline" href="product.html?id=' + encodeURIComponent(form.slug) + '" target="_blank" rel="noopener">View in shop</a>') +
        '</div>' +
      '</form>'
    );
  }

  function sizeRowExisting(v) {
    var available = v.quantity - v.reserved;
    var disabled = busy ? " disabled" : "";
    return (
      '<tr' + (v.isActive ? "" : ' class="is-hidden"') + '>' +
        '<td>' + esc(typeLabel(v.variantType)) + (v.isActive ? "" : " (hidden)") + '</td>' +
        '<td><form class="admin-size" data-variant="' + esc(v.id) + '">' +
          '<input class="input admin-size__label" name="sizeLabel" maxlength="24" required value="' + esc(v.sizeLabel) + '" aria-label="Size"' + disabled + '>' +
          '<span class="admin-size__cell"><span class="admin-size__prefix">₹</span><input class="input admin-size__price" name="price" type="number" min="1" step="1" required value="' + esc(toRupees(v.pricePaise)) + '" aria-label="Price"' + disabled + '></span>' +
          '<span class="admin-size__cell"><span class="admin-size__prefix">₹</span><input class="input admin-size__price" name="compareAt" type="number" min="1" step="1" value="' + esc(toRupees(v.compareAtPricePaise)) + '" placeholder="—" aria-label="Regular price when on offer"' + disabled + '></span>' +
          '<button type="submit" class="btn btn--outline btn--sm"' + disabled + '>Save</button>' +
          '<button type="button" class="btn btn--outline btn--sm" data-variant-toggle="' + esc(v.id) + '" data-active="' + v.isActive + '"' + disabled + '>' + (v.isActive ? "Hide" : "Show") + '</button>' +
        '</form></td>' +
        '<td class="num' + (available <= v.lowStockThreshold ? " is-low" : "") + '">' + available + '</td>' +
      '</tr>'
    );
  }

  function sizeRowPending(v, index) {
    return (
      '<tr>' +
        '<td>' + esc(typeLabel(v.variantType)) + '</td>' +
        '<td>' + esc(v.sizeLabel) + ' · ' + shafaafFormatPrice(v.priceRupees) + (v.compareRupees ? ' <s class="admin-size__was">' + shafaafFormatPrice(v.compareRupees) + '</s>' : "") + '</td>' +
        '<td class="num">' + v.quantity + '</td>' +
        '<td><button type="button" class="btn btn--outline btn--sm btn--danger" data-pending-remove="' + index + '"' + (busy ? " disabled" : "") + '>Remove</button></td>' +
      '</tr>'
    );
  }

  function renderSizes() {
    var rows = product ? product.variants.map(sizeRowExisting) : pendingSizes.map(sizeRowPending);
    var disabled = busy ? " disabled" : "";
    return (
      '<h2 class="checkout-title order-detail__section">Sizes &amp; prices</h2>' +
      (rows.length
        ? '<div class="admin-table__wrap"><table class="admin-table admin-table--sizes">' +
            '<thead><tr><th>Form</th><th>Size · price · regular price (offer)</th><th class="num">' + (product ? "Available" : "Stock") + '</th>' + (product ? "" : "<th></th>") + '</tr></thead>' +
            '<tbody>' + rows.join("") + '</tbody></table></div>'
        : '<p class="admin-empty">No sizes yet. ' + (isNew() ? "Add at least one before creating the product." : "The shop hides a product until it has a size to sell.") + '</p>') +
      '<form class="admin-add-size" data-add-size>' +
        '<p class="admin-add-size__title">Add a size</p>' +
        '<div class="admin-add-size__grid">' +
          '<div class="field"><label class="field__label" for="ns-type">Form</label><select class="select" id="ns-type" name="variantType"' + disabled + '>' +
            SHAFAAF_PRODUCT_TYPES.map(function (t) { return '<option value="' + t.key + '">' + esc(t.label) + '</option>'; }).join("") +
          '</select></div>' +
          '<div class="field"><label class="field__label" for="ns-label">Size</label><input class="input" id="ns-label" name="sizeLabel" maxlength="24" required placeholder="50ml"' + disabled + '></div>' +
          '<div class="field"><label class="field__label" for="ns-ml">ml / g</label><input class="input" id="ns-ml" name="sizeMl" type="number" min="1" step="1" required placeholder="50"' + disabled + '></div>' +
          '<div class="field"><label class="field__label" for="ns-price">Price ₹</label><input class="input" id="ns-price" name="price" type="number" min="1" step="1" required placeholder="899"' + disabled + '></div>' +
          '<div class="field"><label class="field__label" for="ns-compare">Regular ₹ (offer)</label><input class="input" id="ns-compare" name="compareAt" type="number" min="1" step="1" placeholder="optional"' + disabled + '></div>' +
          '<div class="field"><label class="field__label" for="ns-qty">Starting stock</label><input class="input" id="ns-qty" name="quantity" type="number" min="0" step="1" value="10" required' + disabled + '></div>' +
        '</div>' +
        '<div class="checkout-actions checkout-actions--start">' +
          '<button type="submit" class="btn btn--outline"' + disabled + '>' + shafaafIcon("plus") + ' Add size</button>' +
          '<span class="admin-actions__hint">Fill "Regular ₹" only when the price is an offer — the shop then shows the regular price struck through.' + (product ? ' Stock changes (deliveries, breakages) are on the <a href="' + helpers().href({ view: "stock" }) + '">Stock</a> tab.' : "") + '</span>' +
        '</div>' +
      '</form>'
    );
  }

  function render() {
    if (!form) return;
    // Whatever the owner has typed so far survives every re-render.
    var formEl = el().querySelector("[data-product-form]");
    if (formEl) syncForm(formEl);
    helpers().setTitle(isNew() ? "New product" : product.name);
    el().innerHTML =
      '<a class="admin-back" href="' + helpers().href({ view: "products" }) + '">' + shafaafIcon("chevronLeft") + ' All products</a>' +
      '<div class="checkout-layout admin-editor">' +
        '<section class="checkout-section">' +
          '<h2 class="checkout-title">Details</h2>' +
          renderDetailsForm() +
          renderSizes() +
        '</section>' +
        '<aside class="cart-summary checkout-summary admin-editor__side">' +
          renderPhotos() +
        '</aside>' +
      '</div>';
    shafaafHydrateIcons(el());
  }

  // ---- editor: actions ------------------------------------------------------

  /** Reads the details form into `form` so a re-render never loses typing. */
  function syncForm(formEl) {
    var f = formEl.elements;
    form.name = f.name.value;
    form.slug = f.slug.value.trim().toLowerCase();
    form.familyId = f.familyId.value;
    form.newFamily = f.newFamily ? f.newFamily.value : "";
    form.gender = f.gender.value;
    form.description = f.description.value;
    form.notes = f.notes.value;
    form.isBestseller = f.isBestseller.checked;
    form.isNew = f.isNew.checked;
    if (f.isActive) form.isActive = f.isActive.checked;
  }

  function notesList() {
    return form.notes.split(",").map(function (n) { return n.trim(); }).filter(Boolean);
  }

  function ensureCategory() {
    if (form.familyId !== NEW_CATEGORY) return Promise.resolve(form.familyId || null);
    var name = form.newFamily.trim();
    if (!name) return Promise.reject(new Error("Type a name for the new category."));
    return ShafaafApi.post("/admin/categories", { slug: slugify(name), name: name }, { auth: true }).then(function (data) {
      categories.push(data.category);
      form.familyId = data.category.id;
      form.newFamily = "";
      return data.category.id;
    });
  }

  function detailsBody(familyId) {
    var body = {
      slug: form.slug,
      name: form.name.trim(),
      familyId: familyId,
      gender: form.gender,
      description: form.description.trim(),
      notes: notesList(),
      isBestseller: form.isBestseller,
      isNew: form.isNew,
      heroImageUrl: form.heroImageUrl,
      heroImageAlt: form.heroImageAlt
    };
    if (!isNew()) body.isActive = form.isActive;
    return body;
  }

  function saveDetails(formEl) {
    if (busy) return;
    syncForm(formEl);
    if (!form.name.trim()) { notice = { type: "error", text: "Give the product a name." }; render(); return; }
    if (!/^[a-z0-9-]+$/.test(form.slug)) { notice = { type: "error", text: "The web address may only contain lowercase letters, numbers and hyphens." }; render(); return; }
    if (isNew() && !pendingSizes.length) { notice = { type: "error", text: "Add at least one size before creating the product." }; render(); return; }

    busy = true;
    notice = null;
    render();

    ensureCategory().then(function (familyId) {
      if (!isNew()) {
        return ShafaafApi.patch("/admin/products/" + encodeURIComponent(product.id), detailsBody(familyId), { auth: true }).then(function () {
          busy = false;
          ShafaafToast.show("Saved.");
          return reloadProduct(true);
        });
      }
      return ShafaafApi.post("/admin/products", detailsBody(familyId), { auth: true }).then(function (data) {
        var created = data.product;
        // Sizes one after another: the backend checks each SKU is unique.
        return pendingSizes.reduce(function (chain, size) {
          return chain.then(function () { return ShafaafApi.post("/admin/products/" + encodeURIComponent(created.id) + "/variants", variantBody(size, created.slug), { auth: true }); });
        }, Promise.resolve()).then(function () {
          ShafaafToast.show(created.name + " created.");
          window.location.href = helpers().href({ view: "product", id: created.id });
        });
      });
    }).catch(function (err) { fail(err, "The product could not be saved."); });
  }

  function variantBody(size, slug) {
    var body = {
      sku: buildSku(slug, size.variantType, size.sizeMl),
      variantType: size.variantType,
      sizeLabel: size.sizeLabel,
      sizeMl: size.sizeMl,
      pricePaise: toPaise(size.priceRupees),
      quantity: size.quantity,
      position: size.position
    };
    if (size.compareRupees) body.compareAtPricePaise = toPaise(size.compareRupees);
    var image = product ? imageForType(size.variantType) : typeImages[size.variantType];
    if (image) body.imageUrl = image;
    return body;
  }

  function addSize(formEl) {
    if (busy) return;
    var f = formEl.elements;
    var size = {
      variantType: f.variantType.value,
      sizeLabel: f.sizeLabel.value.trim(),
      sizeMl: parseInt(f.sizeMl.value, 10),
      priceRupees: Number(f.price.value),
      compareRupees: f.compareAt.value ? Number(f.compareAt.value) : null,
      quantity: parseInt(f.quantity.value, 10) || 0
    };
    if (!size.sizeLabel || !(size.sizeMl > 0) || !(size.priceRupees > 0)) { notice = { type: "error", text: "A size needs a label, a volume and a price." }; render(); return; }
    if (size.compareRupees !== null && size.compareRupees <= size.priceRupees) { notice = { type: "error", text: "The regular price should be higher than the offer price." }; render(); return; }
    size.position = (product ? product.variants.length : pendingSizes.length);
    notice = null;

    if (isNew()) {
      var dupe = pendingSizes.some(function (s) { return s.variantType === size.variantType && s.sizeMl === size.sizeMl; });
      if (dupe) { notice = { type: "error", text: "That form and size is already in the list." }; render(); return; }
      pendingSizes.push(size);
      render();
      return;
    }

    busy = true;
    render();
    ShafaafApi.post("/admin/products/" + encodeURIComponent(product.id) + "/variants", variantBody(size, product.slug), { auth: true })
      .then(function () { busy = false; ShafaafToast.show(typeLabel(size.variantType) + " " + size.sizeLabel + " added."); return reloadProduct(); })
      .catch(function (err) { fail(err, "The size could not be added."); });
  }

  function saveVariant(formEl) {
    if (busy) return;
    var id = formEl.getAttribute("data-variant");
    var f = formEl.elements;
    var price = Number(f.price.value);
    var compareAt = f.compareAt.value ? Number(f.compareAt.value) : null;
    if (!(price > 0) || !f.sizeLabel.value.trim()) { notice = { type: "error", text: "A size needs a label and a price." }; render(); return; }
    if (compareAt !== null && compareAt <= price) { notice = { type: "error", text: "The regular price should be higher than the offer price." }; render(); return; }
    busy = true;
    notice = null;
    render();
    ShafaafApi.patch("/admin/variants/" + encodeURIComponent(id), {
      sizeLabel: f.sizeLabel.value.trim(),
      pricePaise: toPaise(price),
      compareAtPricePaise: compareAt === null ? null : toPaise(compareAt)
    }, { auth: true })
      .then(function () { busy = false; ShafaafToast.show("Price saved."); return reloadProduct(); })
      .catch(function (err) { fail(err, "The price could not be saved."); });
  }

  function toggleVariant(id, active) {
    if (busy) return;
    busy = true;
    notice = null;
    render();
    ShafaafApi.patch("/admin/variants/" + encodeURIComponent(id), { isActive: !active }, { auth: true })
      .then(function () { busy = false; ShafaafToast.show(active ? "Size hidden from the shop." : "Size back in the shop."); return reloadProduct(); })
      .catch(function (err) { fail(err, "The change could not be saved."); });
  }

  // ---- photos -------------------------------------------------------------

  function applyPhoto(key, url) {
    if (key === "hero") {
      form.heroImageUrl = url;
      return isNew() ? Promise.resolve() : ShafaafApi.patch("/admin/products/" + encodeURIComponent(product.id), { heroImageUrl: url }, { auth: true });
    }
    if (key === "hover") {
      form.heroImageAlt = url;
      return isNew() ? Promise.resolve() : ShafaafApi.patch("/admin/products/" + encodeURIComponent(product.id), { heroImageAlt: url }, { auth: true });
    }
    var type = key.slice("type:".length);
    if (isNew()) { typeImages[type] = url; return Promise.resolve(); }
    // The shop reads the photo off the sizes of that form, so every size gets it.
    var sizes = product.variants.filter(function (v) { return v.variantType === type; });
    return sizes.reduce(function (chain, v) {
      return chain.then(function () { return ShafaafApi.patch("/admin/variants/" + encodeURIComponent(v.id), { imageUrl: url }, { auth: true }); });
    }, Promise.resolve());
  }

  function uploadPhoto(key, file) {
    if (busy || uploading || !file) return;
    if (IMAGE_TYPES.indexOf(file.type) === -1) { notice = { type: "error", text: "Please choose a JPEG, PNG, WebP or AVIF image." }; render(); return; }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) { notice = { type: "error", text: "That photo is over " + MAX_IMAGE_MB + " MB. Please use a smaller one." }; render(); return; }
    uploading = key;
    notice = null;
    render();
    var folder = form.slug || slugify(form.name) || "misc";
    ShafaafApi.upload("/admin/uploads/product-image?folder=" + encodeURIComponent(folder), file, { auth: true })
      .then(function (data) { return applyPhoto(key, data.image.url); })
      .then(function () {
        uploading = null;
        ShafaafToast.show("Photo uploaded.");
        return isNew() ? render() : reloadProduct();
      })
      .catch(function (err) { fail(err, "The photo could not be uploaded."); });
  }

  function removePhoto(key) {
    if (busy || uploading) return;
    if (!window.confirm("Remove this photo from the product?")) return;
    busy = true;
    notice = null;
    render();
    var done = key.indexOf("type:") === 0 && isNew()
      ? (delete typeImages[key.slice(5)], Promise.resolve())
      : applyPhoto(key, null);
    done.then(function () {
      busy = false;
      ShafaafToast.show("Photo removed.");
      return isNew() ? render() : reloadProduct();
    }).catch(function (err) { fail(err, "The photo could not be removed."); });
  }

  // ---- events -------------------------------------------------------------

  document.addEventListener("submit", function (e) {
    var target = e.target;
    if (target.matches("[data-product-form]")) { e.preventDefault(); saveDetails(target); return; }
    if (target.matches("[data-add-size]")) { e.preventDefault(); addSize(target); return; }
    if (target.matches("[data-variant]")) { e.preventDefault(); saveVariant(target); }
  });

  document.addEventListener("click", function (e) {
    var toggle = e.target.closest("[data-variant-toggle]");
    if (toggle) { toggleVariant(toggle.getAttribute("data-variant-toggle"), toggle.getAttribute("data-active") === "true"); return; }
    var remove = e.target.closest("[data-pending-remove]");
    if (remove) { pendingSizes.splice(parseInt(remove.getAttribute("data-pending-remove"), 10), 1); render(); return; }
    var photoRemove = e.target.closest("[data-photo-remove]");
    if (photoRemove) { removePhoto(photoRemove.getAttribute("data-photo-remove")); }
  });

  document.addEventListener("change", function (e) {
    var target = e.target;
    if (target.matches("[data-photo]")) { uploadPhoto(target.getAttribute("data-photo"), target.files && target.files[0]); return; }
    if (target.id === "pf-family") {
      render();
      if (form.familyId === NEW_CATEGORY) { var input = document.getElementById("pf-new-family"); if (input) input.focus(); }
    }
  });

  document.addEventListener("input", function (e) {
    var target = e.target;
    if (target.matches("[data-admin-list-search]")) {
      listSearch = target.value;
      renderList();
      var input = el().querySelector("[data-admin-list-search]");
      if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
      return;
    }
    if (target.id === "pf-slug") { slugTouched = true; return; }
    if (target.id === "pf-name" && !slugTouched) {
      var slug = document.getElementById("pf-slug");
      if (slug) slug.value = slugify(target.value);
    }
  });

  return { loadList: loadList, loadEditor: loadEditor };
})();
