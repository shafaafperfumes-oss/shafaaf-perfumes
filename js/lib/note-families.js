/**
 * Purely presentational grouping of each fragrance's existing
 * notes into Top / Heart / Base bands for the PDP notes
 * visualization. This does not add, remove, or rename any note —
 * it only decides which of three columns an existing note is
 * displayed under, using standard perfumery convention.
 */
var SHAFAAF_NOTE_POSITION = {
  Citrus: "top", Fresh: "top", "Fresh Spicy": "top", Fruity: "top", Tropical: "top", Metallic: "top",
  Rose: "heart", Floral: "heart", Tuberose: "heart", Lavender: "heart", "Warm Spicy": "heart",
  Cinnamon: "heart", Coffee: "heart", Animalic: "heart",
  Woody: "base", Musky: "base", Amber: "base", Vanilla: "base", Sweet: "base", Powdery: "base",
  Oud: "base", Patchouli: "base", Leather: "base", Leathy: "base", Earthy: "base"
};

function shafaafGroupNotes(notes) {
  var groups = { top: [], heart: [], base: [] };
  notes.forEach(function (n) {
    var band = SHAFAAF_NOTE_POSITION[n] || "heart";
    groups[band].push(n);
  });
  return groups;
}
