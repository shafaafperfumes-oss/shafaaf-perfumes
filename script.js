let cart = [];

const cartButtons = document.querySelectorAll(".add-to-cart");
const cartLink = document.getElementById("cart-link");
const cartPanel = document.getElementById("cart-panel");
const cartClose = document.getElementById("cart-close");
const cartItemsDiv = document.getElementById("cart-items");
const cartTotalDiv = document.getElementById("cart-total");
const cartCount = document.getElementById("cart-count");

cartButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    const card = button.parentElement;
    const name = card.querySelector("h3").textContent;
    const version = card.querySelector(".version-tag").textContent;
    const priceText = card.querySelector(".price").textContent;
    const price = parseInt(priceText.split("/")[0].trim());

    cart.push({ name: name, version: version, price: price });
    updateCart();
  });
});

cartLink.addEventListener("click", function (e) {
  e.preventDefault();
  cartPanel.style.right = "0";
});

cartClose.addEventListener("click", function () {
  cartPanel.style.right = "-350px";
});

function updateCart() {
  cartCount.textContent = cart.length;
  cartItemsDiv.innerHTML = "";
  let total = 0;

  cart.forEach(function (item, index) {
    total += item.price;
    const itemDiv = document.createElement("div");
    itemDiv.className = "cart-item";
    itemDiv.innerHTML =
      "<span>" + item.name + " (" + item.version + ") - " + item.price + " Rs</span>" +
      "<span class='remove-item' data-index='" + index + "'>&times;</span>";
    cartItemsDiv.appendChild(itemDiv);
  });

  cartTotalDiv.textContent = "Total: " + total + " Rupees";

  document.querySelectorAll(".remove-item").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const idx = parseInt(btn.getAttribute("data-index"));
      cart.splice(idx, 1);
      updateCart();
    });
  });
}