# Supabase Database Migrations

This folder contains the SQL migration files for the Velix platform's Supabase PostgreSQL database.

## How to Run

### Option A: Supabase Dashboard (recommended)
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** → **New query**
3. Paste the contents of `001_initial_schema.sql`
4. Click **Run**

### Option B: Supabase CLI
```bash
# If you have the Supabase CLI installed and linked
supabase db push
```

## Schema Overview

| Table | Purpose | Used By |
|-------|---------|---------|
| `users` | User profiles, credits, preferences, affiliate codes | Backend (PostgREST) |
| `credits_transactions` | Credit balance ledger | Backend (PostgREST) |
| `projects` | Generation sessions (IDE workspaces) | Backend (PostgREST) |
| `messages` | Chat history per project | Backend (PostgREST) |
| `compile_history` | Build/compile results and artifacts | Backend + Sandbox (direct Postgres) |
| `plugin_docs` | Curated plugin documentation references | Backend (PostgREST) |
| `doc_submissions` | Pending documentation review queue | Backend (PostgREST) |
| `admin_settings` | OAuth config and admin preferences | Backend (PostgREST) |

## Important Notes

- **Authentication** is handled by Supabase Auth — there is no `password_hash` column. The `users` table stores profile data only; auth is managed separately via Supabase's built-in auth system.
- **compile_history** is the only table accessed by both the backend (via PostgREST REST API) and the sandbox service (via direct PostgreSQL connection). Both services connect to the same Supabase database.
- The sandbox service connects using the **Supabase direct connection URL** (found in Dashboard → Settings → Database → Connection string → URI). This is configured via the `SANDBOX_DB_URL` or `SUPABASE_DB_URL` environment variable in the sandbox service.

## Adding New Migrations

Name new files with a sequential prefix:
- `002_add_new_table.sql`
- `003_add_column_to_users.sql`

Always run migrations in order.
