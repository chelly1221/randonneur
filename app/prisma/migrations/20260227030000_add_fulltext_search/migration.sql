-- Add full-text search vectors to courses
ALTER TABLE courses ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(start_location, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(end_location, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(region, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(designer, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS courses_search_idx ON courses USING gin(search_vector);

-- Add full-text search vectors to reviews
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(content, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS reviews_search_idx ON reviews USING gin(search_vector);
