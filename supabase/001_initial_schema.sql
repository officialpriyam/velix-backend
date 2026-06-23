-- Velix Platform - Supabase PostgreSQL Database Schema
-- Migration: 001_initial
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- or via the Supabase CLI: supabase db push
--
-- This schema is shared by:
--   - Backend: via Supabase PostgREST API (DatabaseService.ts)
--   - Sandbox Service: via direct PostgreSQL connection (storage/postgres.go)
--
-- Auth is handled by Supabase Auth — no password_hash column is needed.

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    display_name TEXT,
    discord_id TEXT,
    credits INTEGER DEFAULT 100,
    affiliate_code TEXT,
    profile_id INTEGER,
    history_quick_access INTEGER DEFAULT 0,
    email_notifications INTEGER DEFAULT 1,
    paste_as_file INTEGER DEFAULT 1,
    texture_generation INTEGER DEFAULT 0,
    knowledge_refractor INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    -- New column for user role; default is 'member'
    role TEXT NOT NULL DEFAULT 'member',
    is_banned INTEGER DEFAULT 0,
    ban_reason TEXT
);

-- 2. Credits transaction ledger
CREATE TABLE IF NOT EXISTS credits_transactions (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 3. Projects (generation sessions)
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    language TEXT,
    model TEXT,
    is_public INTEGER DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 4. Chat messages per project
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 5. Compile/build history
CREATE TABLE IF NOT EXISTS compile_history (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    success INTEGER NOT NULL,
    log TEXT,
    artifact_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 6. Plugin documentation references
CREATE TABLE IF NOT EXISTS plugin_docs (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    plugin_id TEXT UNIQUE NOT NULL,
    description TEXT,
    docs_url TEXT,
    status TEXT DEFAULT 'approved',
    submitted_by TEXT,
    content TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    approved_at TIMESTAMP WITH TIME ZONE
);

-- 7. Documentation submissions queue
CREATE TABLE IF NOT EXISTS doc_submissions (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    docs_url TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    submitted_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 8. Admin settings (key-value style, single row)
CREATE TABLE IF NOT EXISTS admin_settings (
    id INTEGER PRIMARY KEY,
    oauth_config TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_credits_transactions_user_id ON credits_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_is_public ON projects(is_public);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_compile_history_session_id ON compile_history(session_id);
CREATE INDEX IF NOT EXISTS idx_doc_submissions_status ON doc_submissions(status);
CREATE INDEX IF NOT EXISTS idx_plugin_docs_status ON plugin_docs(status);
