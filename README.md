# Velix AI Backend

Express.js API server for the Velix AI code generation platform.

## Tech Stack
- **Runtime**: Node.js with ts-node
- **Framework**: Express.js
- **Database**: SQLite (better-sqlite3)
- **Auth**: Supabase OAuth + httpOnly cookies
- **Language**: TypeScript

## Getting Started

```bash
npm install
npm run dev
```

Backend runs on `http://localhost:3006`.

## Environment Variables

| Variable | Description |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter API key for AI code/model generation |
| `NVIDIA_API_KEY` | NVIDIA NIM API key for image generation + models |
| `GEMINI_API_KEY` | Google Gemini API key for image generation (optional) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `JWT_SECRET` | Secret for JWT session tokens |
| `ADMIN_API_KEY` | Shared secret for admin panel access |

## API Routes

### Auth (`/api/auth/*`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/me` | Get current user from session cookie |
| POST | `/login` | Email/password login |
| POST | `/register` | Create account |
| POST | `/oauth` | OAuth login (Google, GitHub, Discord, etc.) |
| POST | `/logout` | Clear session |
| PATCH | `/profile` | Update display name, email, discord |
| PATCH | `/preferences` | Update user preferences |

### AI (`/api/ai/*`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/generate` | Generate code with AI (chat + history) |
| GET | `/models` | List available models (NVIDIA + OpenRouter) |
| POST | `/projects` | Create project |
| GET | `/projects` | List user projects |
| GET | `/projects/:id` | Get project |
| PATCH | `/projects/:id/settings` | Update session settings |
| POST | `/projects/:id/fork` | Clone/fork project |

### Model Generation (`/api/modelgen/*`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/generate` | Generate Minecraft schematic (50 credits) |
| GET | `/examples` | Get example prompts |
| GET | `/status` | Check service status |

### Image Generation (`/api/images/*`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/generate` | Generate image (3 credits) |
| GET | `/ratios` | Get available aspect ratios |

### Compiler (`/api/compiler/*`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/compile` | Compile Java (javac/gradle/maven) |

### Files (`/api/files/*`)
| Method | Endpoint | Description |
|---|---|---|
| Various | `/files/*` | CRUD for project files |

### Wiki (`/api/wiki/*`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/projects/:id/pages` | List wiki pages |
| POST | `/projects/:id/pages` | Create wiki page |
| PUT | `/pages/:id` | Update wiki page |
| DELETE | `/pages/:id` | Delete wiki page |
| POST | `/projects/:id/generate` | AI-generate wiki content |

### Versions (`/api/versions/*`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/projects/:id/versions` | List version history |
| POST | `/projects/:id/versions` | Save version snapshot |
| POST | `/versions/:id/restore` | Restore to version |

### Dependencies (`/api/dependencies/*`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/projects/:id/dependencies` | List dependencies |
| POST | `/projects/:id/dependencies/upload` | Upload JAR file |
| DELETE | `/dependencies/:id` | Remove dependency |

### Admin (`/api/admin/*`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/users` | List all users (admin) |
| DELETE | `/users/:id` | Delete user |

## Model Generation Flow

1. User sends text prompt (e.g., "A cozy wooden cottage")
2. Backend tries up to 7 free OpenRouter models in sequence
3. AI returns a 16x16x16 voxel grid as JSON
4. Grid is normalized (padded/truncated to exactly 16x16x16)
5. Post-processing fixes stair/slab facing based on neighbors
6. Grid is converted to gzipped `.schem` format
7. `.schem` file is returned as base64 for download
8. If ALL AI models fail, falls back to procedural shape generation

## Post-Processing

Ported from `example-minecraft-ai-model`:
- **adjustBlockStateHalf**: Fixes stair half (top/bottom) based on neighbors
- **adjustBlockStateType**: Fixes slab type (top/bottom) based on neighbors  
- **adjustBlockStateFacing**: Fixes stair facing direction based on neighbors

## Dependencies

Express, SQLite, Supabase, JWT, Axios, bcryptjs, cookie-parser, multer, ws, zlib
