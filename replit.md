# RBXL Decompiler

A Roblox place file (`.rbxl`) decompiler and game-mechanics analysis tool. Upload any binary RBXL file to extract all Lua scripts, browse them with syntax highlighting, download them, and analyze game mechanics like hatch chances, egg rates, pet data, currencies, shops, and events.

## Run & Operate

- `pnpm --filter @workspace/rbxl-decompiler run dev` — run the frontend (port assigned by artifact)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `python3 scripts/parse_rbxl.py <file.rbxl>` — parse an RBXL file from CLI (JSON output)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, TanStack Query, Wouter, Tailwind CSS
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- RBXL Parser: Pure Python 3 with hand-written LZ4 block decompressor
- Analysis: Regex pattern engine across Lua source
- Codegen: Orval (from OpenAPI spec)

## Where things live

- `scripts/parse_rbxl.py` — RBXL binary format parser (pure Python, no deps)
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/db/src/schema/index.ts` — DB schema (sessions, scripts, topics, findings)
- `artifacts/api-server/src/routes/` — Express routes (sessions, scripts, analysis)
- `artifacts/api-server/src/lib/analyzer.ts` — Game mechanics pattern matcher
- `artifacts/api-server/src/lib/rbxl-parser.ts` — Node wrapper calling Python parser
- `artifacts/rbxl-decompiler/src/` — React frontend

## Architecture decisions

- **Python parser called from Node** — Pure Python LZ4 + RBXL parsing is more reliable than a JS implementation; called via `child_process.exec`. 512 MB buffer for large place files.
- **Batch inserts (500 per batch)** — With 9,500+ scripts per file, one-by-one inserts time out; bulk inserts complete in ~10s.
- **File upload outside OpenAPI** — Binary multipart/form-data causes codegen issues (File/Blob types); the upload route is a raw Express/multer endpoint not in the OpenAPI spec.
- **Analysis runs in-memory** — Pattern matching over all scripts runs in JS after the Python parser returns, avoiding round-trips.
- **Background processing** — Upload responds immediately (201) and processes async. Sessions have status: pending → processing → complete/error.

## User preferences

_Populate as you build._

## Gotchas

- Sessions stuck in "processing" after server restart must be deleted and re-uploaded — background async tasks are lost on restart.
- The RBXL binary format header is: magic (14 bytes) + version (2 bytes uint16) + num_types (4 bytes uint32) + num_instances (4 bytes uint32) + reserved (8 bytes). Total 32 bytes before first chunk.
- LZ4 chunks: if `compressed_len == 0`, data is stored uncompressed.
- Script `Source` properties are type `0x01` (String) or `0x13` (ProtectedString) in PROP chunks.
- Extra decompilers (lunaux, datamodelpatch) are available as extras — lunaux v1.3 has a Linux `.so` (Python extension, incompatible with system Python) and a Windows CLI only.
