-- GitBook Connections
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS gitbook_connections (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    encrypted_token TEXT NOT NULL,
    gitbook_user_id TEXT,
    gitbook_user_name TEXT,
    gitbook_user_email TEXT,
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_gitbook_connections_user_id ON gitbook_connections(user_id);

-- Create storage bucket for schematics (if not exists)
-- Run this separately in Supabase Dashboard > Storage > New Bucket:
-- Bucket name: schematics
-- Public: false
-- File size limit: 5MB
-- Allowed MIME types: application/octet-stream
