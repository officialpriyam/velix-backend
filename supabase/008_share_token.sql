-- 008: Add share_token column for private link sharing
-- Generates a unique token that allows read-only access to private projects

ALTER TABLE projects ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_projects_share_token ON projects(share_token) WHERE share_token IS NOT NULL;
