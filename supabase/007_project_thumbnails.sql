-- 007: Add thumbnail column to projects table
-- Stores base64-encoded thumbnail image for project cards

ALTER TABLE projects ADD COLUMN IF NOT EXISTS thumbnail TEXT;
