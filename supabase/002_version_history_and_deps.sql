-- Velix Platform - Migration 002
-- Adds: project_versions, project_dependencies, settings column on projects
--
-- Run in Supabase SQL Editor after 001_initial_schema.sql

-- 1. Add settings JSON column to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS settings TEXT DEFAULT '{}';

-- 2. Version history snapshots
CREATE TABLE IF NOT EXISTS project_versions (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    commit_type TEXT NOT NULL DEFAULT 'user',
    message TEXT,
    files_snapshot JSONB NOT NULL,
    files_changed TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 3. Project dependencies (uploaded JARs)
CREATE TABLE IF NOT EXISTS project_dependencies (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    storage_path TEXT NOT NULL,
    is_shaded INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_project_versions_session ON project_versions(session_id);
CREATE INDEX IF NOT EXISTS idx_project_versions_created ON project_versions(created_at);
CREATE INDEX IF NOT EXISTS idx_project_dependencies_session ON project_dependencies(session_id);
