/**
 * Fragrance Finder — interactive questionnaire.
 * ------------------------------------------------------------
 * `shafaafScoreProduct()` is a small local heuristic standing in
 * for a real recommendation engine. The UI collects a clean,
 * serializable `answers` object and calls one scoring function —
 * swapping that function's body for an API call to a future AI
 * fragrance advisor is the entire integration surface.
 */
(function () {
  var QUESTIONS = [
    {
      id: "mood",
      type: "single",
      question: "What mood are you looking for?",
      hint: "Choose the feeling you want your fragrance to carry.",
      options: [
        { value: "romantic", title: "Romantic", desc: "Soft, floral, inviting" },
        { value: "confident", title: "Confident", desc: "Bold, grounded, magnetic" },
        { value: "calm", title: "Calm & Grounded", desc: "Warm, comforting, familiar" },
        { value: "playful", title: "Playful & Fresh", desc: "Light, energetic, bright" }
      ]
    },
    {
      id: "occasion",
      type: "multi",
      question: "What occasions will you wear it for?",
      hint: "Select all that apply.",
      options: [
        { value: "everyday", title: "Everyday", desc: "A reliable daily signature" },
        { value: "office", title: "Work & Office", desc: "Present but not overpowering" },
        { value: "evening", title: "Evening & Events", desc: "Statement-making for nights out" },
        { value: "special", title: "Special Occasions", desc: "Weddings, celebrations" }
      ]
    },
    {
      id: "families",
      type: "chips",
      question: "Which fragrance families do you prefer?",
      hint: "Pick as many as you like — this matters most for your match.",
      options: shafaafGetFamilies().map(function (f) { return { value: f, title: f }; })
    },
    {
      id: "intensity",
      type: "single",
      question: "Do you prefer subtle or intense fragrances?",
      hint: "This shapes whether we lean toward Attar or Perfume, and which size.",
      options: [
        { value: "subtle", title: "Subtle", desc: "Close to skin, discreet — Attar" },
        { value: "balanced", title: "Balanced", desc: "Noticeable without being loud" },
        { value: "intense", title: "Bold", desc: "Long-lasting, strong projection — Perfume" }
      ]
    },
    {
      id: "notes",
      type: "chips",
      question: "Which notes attract you?",
      hint: "Select a few notes that catch your interest.",
      options: ["Vanilla", "Rose", "Oud", "Musky", "Amber", "Citrus", "Woody", "Warm Spicy", "Coffee", "Floral", "Fruity", "Powdery", "Leather"].map(function (n) { return { value: n, title: n }; })
    }
  ];

  var MOOD_FAMILY_HINTS = {
    romantic: ["Floral", "Gourmand"],
    confident: ["Oud", "Woody"],
    calm: ["Musk", "Gourmand"],
    playful: ["Fresh", "Floral"]
  };

  var answers = {};
  var step = 0;

  function isSelected(qid, value) {
    var a = answers[qid];
    if (Array.isArray(a)) return a.indexOf(value) !== -1;
    return a === value;
  }

  function selectOption(q, value) {
    if (q.type === "single") {
      answers[q.id] = value;
      goNext();
    } else {
      var arr = answers[q.id] || [];
      var i = arr.indexOf(value);
      if (i === -1) arr.push(value); else arr.splice(i, 1);
      answers[q.id] = arr;
      render();
    }
  }

  function canProceed(q) {
    var a = answers[q.id];
    if (q.type === "single") return !!a;
    return Array.isArray(a) && a.length > 0;
  }

  function renderProgress() {
    var el = document.getElementById("finder-progress");
    var total = QUESTIONS.length;
    el.innerHTML = QUESTIONS.map(function (q, i) {
      var cls = i < step ? "is-done" : (i === step ? "is-current" : "");
      return '<div class="finder-progress__seg ' + cls + '"><span></span></div>';
    }).join("");
  }

  function renderQuestion() {
    var q = QUESTIONS[step];
    var optionsClass = q.type === "chips" ? "finder-options finder-options--chips" : "finder-options";
    var html =
      '<div class="finder-step">' +
        '<span class="finder-step__eyebrow">Question ' + (step + 1) + ' of ' + QUESTIONS.length + '</span>' +
        '<h1 class="finder-step__question">' + q.question + '</h1>' +
        '<p class="finder-step__hint">' + q.hint + '</p>' +
        '<div class="' + optionsClass + '">' +
          q.options.map(function (opt) {
            var selected = isSelected(q.id, opt.value);
            if (q.type === "chips") {
              return '<button type="button" class="finder-option finder-option--chip' + (selected ? " is-selected" : "") + '" data-opt="' + opt.value + '">' + opt.title + '</button>';
            }
            return (
              '<button type="button" class="finder-option' + (selected ? " is-selected" : "") + '" data-opt="' + opt.value + '">' +
                '<div class="finder-option__title">' + opt.title + '</div>' +
                (opt.desc ? '<div class="finder-option__desc">' + opt.desc + '</div>' : "") +
              '</button>'
            );
          }).join("") +
        '</div>' +
        '<div class="finder-nav">' +
          (step > 0 ? '<button type="button" class="btn btn--ghost" id="finder-back">' + ShafaafIcons.chevronLeft + ' Back</button>' : '<span></span>') +
          (q.type !== "single" ? '<button type="button" class="btn btn--primary" id="finder-next"' + (canProceed(q) ? "" : " disabled") + '>' + (step === QUESTIONS.length - 1 ? "See My Matches" : "Next") + '</button>' : '<span></span>') +
        '</div>' +
      '</div>';
    document.getElementById("finder-content").innerHTML = html;
    document.getElementById("finder-progress").style.display = "";

    document.querySelectorAll("[data-opt]").forEach(function (btn) {
      btn.addEventListener("click", function () { selectOption(q, btn.getAttribute("data-opt")); });
    });
    var backBtn = document.getElementById("finder-back");
    if (backBtn) backBtn.addEventListener("click", goBack);
    var nextBtn = document.getElementById("finder-next");
    if (nextBtn) nextBtn.addEventListener("click", goNext);
  }

  function goNext() {
    if (step < QUESTIONS.length - 1) { step++; render(); }
    else renderResults();
  }
  function goBack() { if (step > 0) { step--; render(); } }

  function scoreProduct(product) {
    var score = 0;
    var families = answers.families || [];
    var notes = answers.notes || [];
    if (families.indexOf(product.family) !== -1) score += 3;
    notes.forEach(function (n) { if (product.notes.indexOf(n) !== -1) score += 1; });
    var moodFamilies = MOOD_FAMILY_HINTS[answers.mood] || [];
    if (moodFamilies.indexOf(product.family) !== -1) score += 1.5;
    if (product.bestseller) score += 0.25;
    return score;
  }

  function recommendedVariant(product) {
    if (answers.intensity === "subtle") return { variant: product.variants.find(function (v) { return v.type === "Attar"; }), reason: "Subtle & long-wearing" };
    if (answers.intensity === "intense") return { variant: product.variants.find(function (v) { return v.type === "Perfume"; }), reason: "Bold projection" };
    return { variant: product.variants[0], reason: "Balanced everyday wear" };
  }

  function renderResults() {
    document.getElementById("finder-progress").style.display = "none";
    var ranked = shafaafGetAllProducts()
      .map(function (p) { return { product: p, score: scoreProduct(p) }; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 3);

    if (typeof shafaafTrackEvent === "function") shafaafTrackEvent("fragrance_finder_completed", answers);

    var html =
      '<div class="finder-results">' +
        '<div class="finder-results__intro">' +
          '<span class="finder-step__eyebrow">Your Matches</span>' +
          '<h1 class="finder-step__question">Fragrances picked for you</h1>' +
          '<p class="finder-step__hint">Based on your mood, preferred families, and favourite notes.</p>' +
        '</div>' +
        '<div class="finder-results__grid">' +
          ranked.map(function (r) {
            var rec = recommendedVariant(r.product);
            var size = rec.variant.sizes[0];
            return (
              '<div class="product-card">' +
                '<div class="product-card__media">' +
                  '<a href="product.html?id=' + r.product.id + '">' + shafaafProductMedia(r.product) + '</a>' +
                '</div>' +
                '<div class="product-card__body">' +
                  '<span class="finder-results__match">' + rec.reason + '</span>' +
                  '<h3 class="product-card__name"><a href="product.html?id=' + r.product.id + '">' + r.product.name + '</a></h3>' +
                  '<p class="product-card__notes">' + shafaafTruncate(r.product.notes.join(", "), 58) + '</p>' +
                  '<div class="product-card__footer">' +
                    '<span class="price"><span class="price__current">' + shafaafFormatPrice(size.price) + '</span></span>' +
                    '<a href="product.html?id=' + r.product.id + '" class="btn btn--sm btn--outline">View</a>' +
                  '</div>' +
                '</div>' +
              '</div>'
            );
          }).join("") +
        '</div>' +
        '<div class="finder-nav" style="justify-content:center;gap:16px">' +
          '<button type="button" class="btn btn--ghost" id="finder-retake">Retake Quiz</button>' +
          '<a href="shop.html" class="btn btn--primary">Browse Full Collection</a>' +
        '</div>' +
      '</div>';
    document.getElementById("finder-content").innerHTML = html;
    document.getElementById("finder-retake").addEventListener("click", function () {
      answers = {}; step = 0; render();
    });
  }

  function render() {
    renderProgress();
    renderQuestion();
  }

  shafaafOnCatalogReady(render);
})();
