/**
 * The database schema, one file per area. Later phases add their own files
 * here (auth, cart, orders, payments) and re-export them from this barrel,
 * so `db.query` and the migration generator always see the whole schema.
 */
export * from "./catalog.js";
export * from "./auth.js";
export * from "./shopping.js";
