-- Model Generation History
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS modelgen_history (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'ai',
    schematic_data TEXT NOT NULL,
    credits_used INTEGER NOT NULL DEFAULT 50,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_modelgen_history_user_id ON modelgen_history(user_id);
CREATE INDEX IF NOT EXISTS idx_modelgen_history_created_at ON modelgen_history(created_at DESC);
