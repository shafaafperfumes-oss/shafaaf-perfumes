/**
 * Formatting helpers shared across pages.
 */

function shafaafFormatPrice(amount) {
  return "Rs " + Number(amount).toLocaleString("en-PK");
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
