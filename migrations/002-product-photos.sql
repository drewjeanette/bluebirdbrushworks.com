-- Adds two extra photo slots per product (up to 3 total) for the product detail view.
-- Run once against the live database:
--   npx wrangler d1 execute bluebirdbrushworks-db --file=migrations/002-product-photos.sql --remote

ALTER TABLE products ADD COLUMN image_key_2 TEXT;
ALTER TABLE products ADD COLUMN image_key_3 TEXT;
