/**
 * Payment — opens Razorpay's secure checkout window for an order.
 *
 * The backend creates a "payment intent" for an order (POST
 * /checkout/place or POST /orders/:id/pay) and hands back:
 *   { razorpayOrderId, amountPaise, currency, keyId }
 * `keyId` is Razorpay's public key — the one meant for browsers. The
 * secret key never leaves the backend, and the browser never decides
 * whether an order is paid: Razorpay tells the backend directly (a
 * webhook), and the backend marks the order paid. All this module
 * can report is "the shopper finished the popup" or "closed it".
 *
 * Razorpay's script is loaded from their servers only when a shopper
 * actually reaches payment, so ordinary browsing never fetches it.
 *
 *   ShafaafPayment.open(payment, { orderNumber, name, email, contact })
 *     .then(function (result) { result.status === "completed" | "dismissed" });
 */

var ShafaafPayment = (function () {
  var SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";
  var loading = null;

  function load() {
    if (window.Razorpay) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = function () { resolve(); };
      script.onerror = function () {
        loading = null;
        reject(new Error("The payment window could not be loaded. Please check your connection and try again."));
      };
      document.head.appendChild(script);
    });
    return loading;
  }

  /**
   * Razorpay only pre-fills a phone number it recognises as complete, so a
   * bare 10-digit Indian mobile is given its +91; anything else is passed
   * through as typed.
   */
  function contactFor(phone) {
    var digits = String(phone || "").replace(/\D/g, "");
    if (digits.length === 10) return "+91" + digits;
    if (digits.length === 12 && digits.indexOf("91") === 0) return "+" + digits;
    return phone || "";
  }

  function open(payment, opts) {
    opts = opts || {};
    if (!payment || !payment.razorpayOrderId || !payment.keyId) {
      return Promise.reject(new Error("Payments are not available right now."));
    }
    return load().then(function () {
      return new Promise(function (resolve) {
        var settled = false;
        function finish(status, response) {
          if (settled) return;
          settled = true;
          resolve({ status: status, response: response || null });
        }
        var widget = new window.Razorpay({
          key: payment.keyId,
          amount: payment.amountPaise,
          currency: payment.currency || "INR",
          order_id: payment.razorpayOrderId,
          name: "Shafaaf Perfumes",
          description: opts.orderNumber ? "Order " + opts.orderNumber : "Your order",
          image: "images/favicon.png",
          prefill: {
            name: opts.name || "",
            email: opts.email || "",
            contact: contactFor(opts.contact)
          },
          notes: opts.orderNumber ? { orderNumber: opts.orderNumber } : undefined,
          theme: { color: "#3d2a1f" },
          handler: function (response) { finish("completed", response); },
          modal: {
            ondismiss: function () { finish("dismissed"); }
          }
        });
        // A declined card keeps the popup open so the shopper can try
        // another method; nothing to do here but let them.
        widget.on("payment.failed", function () {});
        widget.open();
      });
    });
  }

  return { open: open };
})();
