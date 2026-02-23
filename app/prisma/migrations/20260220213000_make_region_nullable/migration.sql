-- Make courses.region nullable.
ALTER TABLE courses ALTER COLUMN region DROP NOT NULL;

-- Normalize empty-string placeholders to NULL.
UPDATE courses SET region = NULL WHERE region = '';
