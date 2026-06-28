-- Seed initial products from the hardcoded list
-- Safe to re-run; uses INSERT OR IGNORE keyed on id

INSERT OR IGNORE INTO products (id, name, description, price_cents, tag, sort_order) VALUES
  (1, 'Eastern Bluebird',     'On a winter branch, soft blues',     650,  'Bestseller', 1),
  (2, 'Wren in Morning Fog',  'Warm grey tones, quiet mood',         650,  'New',        2),
  (3, 'Chickadee on Holly',   'Winter berries, holiday warmth',      650,  'Holiday',    3),
  (4, 'Blue & Sage Wreath',   'Full botanical wreath',               750,  'Popular',    4),
  (5, 'Finch & Wildflowers',  'Gold and sage, joyful',               650,  NULL,         5),
  (6, 'Songbird Gift Set',    'One of each bird — 6 cards',          3400, 'Gift Set',   6);
