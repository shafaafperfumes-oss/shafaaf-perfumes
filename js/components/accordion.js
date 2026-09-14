/**
 * Generic accordion — works on any container with the markup:
 * <div class="accordion-item">
 *   <button class="accordion-trigger" aria-expanded="false">Q<span class="accordion-trigger__icon"></span></button>
 *   <div class="accordion-panel"><div class="accordion-panel__inner">A</div></div>
 * </div>
 * Delegated, so it works for accordions injected after load.
 */
document.addEventListener("click", function (e) {
  var trigger = e.target.closest(".accordion-trigger");
  if (!trigger) return;
  var item = trigger.closest(".accordion-item");
  var panel = item.querySelector(".accordion-panel");
  var expanded = trigger.getAttribute("aria-expanded") === "true";
  var single = item.closest("[data-accordion-single]");

  if (single) {
    single.querySelectorAll(".accordion-trigger[aria-expanded='true']").forEach(function (t) {
      if (t !== trigger) {
        t.setAttribute("aria-expanded", "false");
        t.closest(".accordion-item").querySelector(".accordion-panel").style.maxHeight = "";
      }
    });
  }

  trigger.setAttribute("aria-expanded", String(!expanded));
  panel.style.maxHeight = expanded ? "" : panel.scrollHeight + "px";
});

function shafaafAccordionItem(question, answerHTML, opts) {
  opts = opts || {};
  return (
    '<div class="accordion-item">' +
      '<button type="button" class="accordion-trigger" aria-expanded="' + (opts.open ? "true" : "false") + '">' +
        '<span>' + question + '</span>' +
        shafaafIcon("plus", "accordion-trigger__icon") +
      '</button>' +
      '<div class="accordion-panel" style="' + (opts.open ? "max-height:400px" : "") + '"><div class="accordion-panel__inner">' + answerHTML + '</div></div>' +
    '</div>'
  );
}
