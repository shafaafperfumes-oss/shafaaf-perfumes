/**
 * WhatsApp checkout — the current checkout mechanism while there
 * is no payment backend. Kept behind a single function so a real
 * checkout (payment gateway + order API) can replace the body of
 * `shafaafCheckout()` later without touching cart/cart-drawer UI.
 */

var SHAFAAF_WHATSAPP_NUMBER = "919796906804"; // business WhatsApp number, carried over from the previous checkout flow

function shafaafBuildOrderMessage(items) {
  var lines = ["Hello Shafaaf Perfumes, I would like to order:", ""];
  var total = 0;
  items.forEach(function (item) {
    var lineTotal = item.qty * item.price;
    total += lineTotal;
    lines.push(
      "• " + item.name + " (" + item.variantType + ", " + item.sizeLabel + ") x" + item.qty +
      " — " + shafaafFormatPrice(lineTotal)
    );
  });
  lines.push("");
  lines.push("Total: " + shafaafFormatPrice(total));
  return lines.join("\n");
}

function shafaafCheckout(items) {
  if (!items.length) {
    ShafaafToast.show("Your cart is empty", { type: "error" });
    return;
  }
  var message = shafaafBuildOrderMessage(items);
  var url = "https://wa.me/" + SHAFAAF_WHATSAPP_NUMBER + "?text=" + encodeURIComponent(message);
  window.open(url, "_blank", "noopener");
}
