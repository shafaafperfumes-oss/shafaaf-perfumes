/**
 * Formatting helpers shared across pages.
 */

/**
 * The shop sells in Indian Rupees. Every price on every page goes through
 * this one function, so the currency is set in a single place.
 * `en-IN` also gives the Indian grouping style: 1,00,000 rather than 100,000.
 */
function shafaafFormatPrice(amount) {
  return "₹" + Number(amount).toLocaleString("en-IN");
}

function shafaafSlugify(str) {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function shafaafLineId(productId, variantType, sizeLabel) {
  return [productId, variantType, sizeLabel].map(shafaafSlugify).join("__");
}

function shafaafTruncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 1).trim() + "…";
}
