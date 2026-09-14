/**
 * Safe localStorage wrapper — never throws (private browsing,
 * disabled storage, quota errors all degrade to a no-op).
 */

var shafaafStorage = {
  get: function (key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },
  set: function (key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  },
  remove: function (key) {
    try { window.localStorage.removeItem(key); } catch (e) {}
  }
};
