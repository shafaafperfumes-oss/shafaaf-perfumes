-- Backs the human-readable "SHF-100001" order numbers. A database
-- sequence guarantees every order number is unique even if two customers
-- check out in the same instant — Postgres serialises nextval() calls
-- internally, so there is nothing for the application code to lock.
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 100001;
