-- Change category from text to text[]
UPDATE courses SET category = '' WHERE category IS NULL;
ALTER TABLE courses ALTER COLUMN category DROP DEFAULT;
ALTER TABLE courses ALTER COLUMN category TYPE text[] USING CASE WHEN category = '' THEN '{}' ELSE ARRAY[category] END;
ALTER TABLE courses ALTER COLUMN category SET DEFAULT '{}';
ALTER TABLE courses ALTER COLUMN category SET NOT NULL;
