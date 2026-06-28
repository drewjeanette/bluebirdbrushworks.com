-- Seed default content blocks so the admin editor opens with the current site text
-- Safe to re-run; INSERT OR IGNORE preserves any edits the artist has made

INSERT OR IGNORE INTO content_blocks (key, value) VALUES
  -- Hero section
  ('hero_brand_main', 'Blue Bird Brushworks'),
  ('hero_brand_sub',  'Watercolor Card Company'),
  ('hero_tagline',    'Hand-painted with love, printed with care'),
  ('hero_bg_image',   '/flowerBackground.webp'),
  ('logo_image',      '/logo.PNG'),

  -- Story / About section
  ('story_title_html', 'Watercolors that<br><em>feel like home</em>'),
  ('story_body_1',     'Blue Bird Brushworks started at a kitchen table with a small set of paints and a deep love for birds. Every card in our collection begins as an original watercolor — slow mornings, soft light, the particular quiet of painting something delicate.'),
  ('story_body_2',     'Every card is an original watercolor painting — real paint on real paper, one of a kind. Each purchase comes with an envelope so your card is ready to gift the moment it arrives.'),
  ('about_photo_image', '/aboutMe.JPG'),

  -- Shop page header
  ('shop_eyebrow',  'The Collection'),
  ('shop_title',    'Shop All Art'),
  ('shop_subtitle', 'Each card begins as an original watercolor painting on thick textured paper.'),

  -- Custom request page header
  ('custom_eyebrow',  'Commission'),
  ('custom_title',    'Request Custom Art'),
  ('custom_subtitle', 'Tell me what you''re dreaming of — I''ll paint it just for you.'),

  -- Footer (admin link is appended automatically and not editable)
  ('footer_text', '© 2026 Blue Bird Brushworks · Cookeville, TN · Made with watercolors & warmth');
