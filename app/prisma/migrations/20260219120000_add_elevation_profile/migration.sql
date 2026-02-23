-- Add elevation_profile JSONB column to courses table
ALTER TABLE courses ADD COLUMN IF NOT EXISTS elevation_profile JSONB;
