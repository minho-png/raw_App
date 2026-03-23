# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev        # Start Next.js dev server (port 3000)
npm run build      # Production build
npm run start      # Start production server
npm run lint       # ESLint check

# Docker (full stack with MongoDB)
docker-compose up --build    # Start app + MongoDB
docker-compose down          # Stop services

# MongoDB connects automatically via MONGODB_URI env var
# Copy .env.example → .env.local and fill in values before running locally
```

There are no test commands — `scripts/test_dmp_wifi.ts` and `scripts/test_groupby.ts` are manual utility scripts, not a test suite.

## Architecture

### Data Flow
CSV Upload → `CalculationService.processWithDanfo()` → Server Action `savePerformanceData()` → `RepositoryService.upsertCampaignData()` → MongoDB

The upsert strategy is **delete-then-insert** keyed on `{ campaign_id, media, date }`: existing records for the same campaign/media/dates are deleted, then new records are inserted. This intentionally overwrites re-uploaded date ranges while appending new ones.

### Layer Responsibilities

**`src/services/calculationService.ts`** — Pure data transformation, no DB access
- Column fuzzy-matching: normalizes Korean/English headers to internal field names via `STANDARD_ALIASES`
- DMP type detection from `ad_group_name` patterns (SKP, KB, LOTTE, TG360, BC, SH, WIFI, DIRECT)
- Danfo.js DataFrame processing — always call `ensureRecords()` after `dfd.toJSON()` because Danfo can return either row-oriented or column-oriented JSON depending on environment
- Naver GFA costs are VAT-inclusive: divide `supply_value` by 1.1 before fee calculation
- `budget_type: 'integrated'` uses a single fee rate across all sub-campaigns; `'individual'` uses per-sub-campaign rates

**`src/services/repositoryService.ts`** — All MongoDB queries
- DB name: `gfa_master_pro`
- Collections: `campaign_configs`, `raw_metrics`, `processed_reports`, `dmp_settlements`
- `raw_metrics`: one record per CSV row (`is_raw: true`)
- `processed_reports`: Danfo-aggregated records (`is_raw: false`); this is what the UI reads for reports

**`src/server/actions/`** — Next.js Server Actions (UI-facing only)
- `campaign.ts`: CRUD for `CampaignConfig` — always runs `normalizeCampaignInput()` before saving to coerce string numbers and sanitize dates
- `settlement.ts`: performance data save/fetch and DMP settlement calculation

**`src/services/reportService.ts`** — Stateless HTML report generator
- Takes `PerformanceRecord[]` + `BudgetStatus` + optional `layout` (ordered section IDs)
- Section IDs: `trend`, `share`, `budget`, `audience`, `creative`, `matrix`, `insights`
- Output is a self-contained HTML string (inline CSS, no external deps) — intended for download

**`src/store/useCampaignStore.ts`** — Zustand store (client state only)
- Holds `campaigns[]`, `selectedCampaignId`, `activeTab`
- `isSyncing` flag prevents background 30-second polls from overwriting state during manual operations
- `setCampaigns()` preserves the current selection if the selected campaign still exists in the new list

**`src/services/workspaceRepository.ts`** — v2.0 multi-tenancy layer
- Handles workspace CRUD, member roles, shared report links, alert rules, AI insights
- New collections: `workspaces`, `workspace_members`, `users`, `shared_reports`, `alert_rules`, `alert_events`, `ai_insights`
- Call `ensureIndexes()` once on app startup

### v2.0 API Architecture
REST endpoints live under `/api/v1/` (Route Handlers) and are intended for external integrations. Internal UI still uses Server Actions. All `/api/v1/` routes require an `x-workspace-id` request header alongside NextAuth session auth.

Public share route `/share/[shareId]` is excluded from auth middleware — data is served via `/api/v1/share/[shareId]` which strips budget fields when `config.show_budget: false`.

### Key Types (`src/types/index.ts`)
- `CampaignConfig` — campaign settings with `sub_campaigns[]` (one per media/mapping_value)
- `SubCampaignConfig.mapping_value` — the exact string from the uploaded CSV that identifies this sub-campaign (replaces the deprecated `excel_name`)
- `PerformanceRecord` — one row of ad performance data; `[key: string]: any` catch-all preserves unmapped CSV columns
- `BudgetStatus` — computed pacing metrics (not stored in DB, always calculated at render time)

### Environment Variables
See `.env.example`. Required for v2.0:
- `MONGODB_URI` — MongoDB connection string
- `NEXTAUTH_SECRET` — NextAuth JWT signing key
- `ANTHROPIC_API_KEY` — Claude API for AI insights
- `WORKER_SECRET` — Shared secret between Docker worker and `/api/v1/alerts/check`
- `NEXT_PUBLIC_APP_URL` — Used in share link generation
