const cartButtons = document.querySelectorAll(".add-to-cart");

cartButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    const productName = button.parentElement.querySelector("h3").textContent;
    alert(productName + " cart mein add ho gaya!");
  });
});