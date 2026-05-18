# Randonneur - Global Randonneuring Course Platform

## Project Overview

**URL:** https://audax.3chan.kr
**Purpose:** Self-hosted platform for global randonneuring permanent courses and BRM events. 16 countries, 4,690+ courses, 19 automated scrapers.
**Legacy reference:** `~/www/wordpress/wp-content/plugins/permanent-course`

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js 15 (App Router) + TypeScript |
| Map | MapLibre GL JS v4 |
| Map Tiles | Public (OSM, OpenTopoMap, CARTO) |
| Charts | Recharts |
| Auth | Auth.js v5 (Google + Naver OAuth, direct) |
| Database | PostgreSQL 16 + PostGIS 3.4 |
| ORM | Prisma 6 |
| Storage | MinIO (GPX + images) |
| Orchestration | Docker Compose |

**Fully on-premise.** No external SaaS except public map tile CDNs.

## Architecture

```
docker-compose.yml
├── app        (Next.js 15 — port 3100:3000)
├── postgres   (PostGIS 16-3.4)
└── minio      (MinIO S3 — port 9200:9000, 9201:9001)
```

Host ports 3000, 5432, 9000, 9001 already in use, hence non-standard mappings. **No local Node.js** — all npm/node via Docker.

## Key Directories

```
app/src/
├── app/
│   ├── courses/           # Korean courses (/courses) + world courses (/courses/world)
│   ├── community/         # 홈, journals, gallery, events, polls
│   ├── admin/             # Dashboard, courses, users, system, reports, seasonal, gpx
│   └── api/               # Route handlers (see API section)
├── components/
│   ├── course/            # course-explorer, course-detail-client, elevation-profile, etc.
│   ├── community/         # event-calendar, event-card, activity-timeline, etc.
│   ├── map/               # course-map.tsx (MapLibre GL JS)
│   ├── layout/            # header, theme-selector, search-bar
│   └── ui/                # Shared primitives
├── lib/
│   ├── auth.ts, db.ts, minio.ts, gpx.ts  # Core services
│   ├── *-scraper.ts       # 19 scraper files (see Scrapers section)
│   └── theme.ts, badges.ts, notifications.ts, utils.ts
└── types/
```

Other: `prisma/schema.prisma`, `scripts/migrate-*.sh`

## Automated Scrapers

19 scrapers run via `instrumentation.ts` (setInterval, no cron). ACP hourly (daily), all others every 6h (monthly). No startup runs — only on interval + admin manual trigger.

Admin UI uses data-driven `ScraperSection` with `SCRAPER_CONFIGS` array.

| Scraper | Source | Country | Type | Scale | GPX Source |
|---------|--------|---------|------|-------|------------|
| `kora-scraper` | ACP API | Worldwide | Events | ~4000/yr | N/A |
| `audax-au-scraper` | audax.org.au | AU | Courses | 857 | RWGPS |
| `kora-permanents-scraper` | korearandonneurs.kr | KR | Courses | ~23 | RWGPS |
| `randonneurs-be-scraper` | randonneurs.be | BE | Courses | 14 | RWGPS (embed + link) |
| `bcr-scraper` | database.randonneurs.bc.ca | CA | Courses | 543 | Backblaze B2 GPX |
| `ontario-randonneurs-scraper` | randonneursontario.ca | CA | Courses | 280 | RWGPS + direct GPX |
| `alberta-randonneurs-scraper` | albertarandonneurs.com | CA | Courses | 101 | RWGPS |
| `audax-de-scraper` | audax-randonneure.de | DE | Courses | 7 | aramuc.de GPX |
| `audax-ireland-scraper` | audaxireland.org | IE | Courses | 93 | RWGPS |
| `audax-italy-scraper` | audaxitalia.it | IT | Courses | 44 | Mixed (RWGPS/OpenRunner) |
| `audax-japan-scraper` | audax-japan.org | JP | Courses | 44 | RWGPS + club pages |
| `randonneurs-no-scraper` | randonneurs.no | NO | Courses | 11 | RWGPS |
| `kiwi-randonneurs-scraper` | kiwirandonneurs.org.nz | NZ | Courses | 17 | RWGPS |
| `audax-uk-scraper` | audax.uk API | GB | Courses | 544 | CloudFront GPX/ZIP + RWGPS |
| `rusa-scraper` | rusa.org | US | Courses | 1832 | RWGPS |
| `rancat-scraper` | rancat.cat | ES | Courses | 10 | OpenRunner |
| `audax-dk-scraper` | audax-club.dk | DK | Courses | 68 | RWGPS |
| `sr-france-scraper` | superrandonnees.org | FR | Courses | 14 | OpenRunner |
| `audax-sa-scraper` | audaxsa.co.za | ZA | Courses | 1 | RWGPS |

Settings per scraper (in `settings` table): `{PREFIX}_SCRAPER_ENABLED`, `{PREFIX}_LAST_SCRAPE_DATE`, `{PREFIX}_LAST_SCRAPE_RESULT`

## Database Schema (PostGIS)

UUID primary keys. Extensions: `postgis`, `uuid-ossp`.

- **`courses`** — name, course_number, distance_km, elevation_m, start/end_location, region, category[], tags[], description, designer, gpx_file_key, archived, geom (LineString 4326), country, source_type, external_id, official_page_url
- **`users`** — display_name, email, role (admin/user), status (active/banned)
- **`completions`** — user_id, course_id, completed_at, completion_status (success/dnf/dnq/dns/partial)
- **`reviews`** — user_id, course_id, difficulty (1-5), content (HTML), completion_status
- **`events`** — title, event_type, location, start/end_date, source_type, external_id, source_url, country
- **`favorites`**, **`likes`**, **`follows`**, **`comments`**, **`reports`**, **`journals`**
- **`badges`**, **`notifications`**, **`polls`**, **`shared_routes`**, **`bikes`**
- **`checkpoints`**, **`downloads`**, **`seasonal_picks`**, **`event_participants`**, **`review_photos`**

## API Route Patterns

All under `app/src/app/api/`. Standard REST patterns:

- **Courses**: `/api/courses` (list/create), `/api/courses/[id]` (CRUD), `/api/courses/[id]/gpx`, `/api/courses/[id]/reviews`, `/api/courses/popular`, `/api/courses/batch-download`
- **Auth**: `/api/auth/[...nextauth]`
- **Social**: `/api/completions`, `/api/favorites`, `/api/likes`, `/api/follows`, `/api/reports`
- **Community**: `/api/events` (+ countries, participate), `/api/journals`, `/api/polls`, `/api/gallery`, `/api/shared-routes`, `/api/activity`
- **Users**: `/api/users/[id]`, `/api/users/me`, `/api/search`, `/api/notifications`
- **Admin**: `/api/admin/stats`, `/api/admin/users`, `/api/admin/backups`, `/api/admin/settings`, `/api/admin/scraper/{name}` (19 scrapers)

## Build & Run

```bash
docker compose up -d --build          # Start all (production)
docker compose up -d --build app      # Rebuild app only
docker compose logs -f app            # View logs
docker compose down                   # Stop all
# Migrations (use prisma@6 to avoid v7)
docker compose exec app npx --package=prisma@6 prisma migrate deploy
# Backup/restore
./scripts/migrate-export.sh           # Creates backup-*.tar.gz
./scripts/migrate-import.sh backup-*.tar.gz
```

Environment variables: see `.env.example`. Note: URL-encode special chars in DATABASE_URL (e.g., `&&` → `%26%26`).

## Development Notes

- **No local Node.js** — all via Docker (`docker compose exec app ...`)
- **MapLibre GL JS v4** — pinned `^4.7.1`, incompatible with react-map-gl v7 at v5
- **Custom GPX parser** — regex-based server-side in `lib/gpx.ts` (DOMParser unavailable)
- **Scrapers** — Node built-in http/https, forced IPv4, regex HTML parsing, no external parser dependency
- **RWGPS integration** — public API `/routes/{id}.json`, convert track_points to GPX
- **Scraper scheduling** — `instrumentation.ts` setInterval. Staggered startup delays.
- **Multi-country** — `/courses` shows KR only, `/courses/world` shows non-KR
- **Admin scraper UI** — data-driven `ScraperSection` + `SCRAPER_CONFIGS` array
- **GPX storage** — MinIO `gpx-files` bucket, keys: `courses/{course_id}.gpx`, images: `images/`

## Color Theme — Randonneuring Sky

| Name | Hex | Token | Usage |
|------|-----|-------|-------|
| Black | `#0a0a0a` | `sky-black` | Text, dark backgrounds |
| Dark Blue | `#1a237e` | `sky-darkblue` | Primary brand, nav |
| Sky Blue | `#4fc3f7` | `sky-blue` | Links, accents |
| Yellow | `#fdd835` | `sky-yellow` | Badges, ratings |
| Orange | `#ff9800` | `sky-orange` | CTAs, hover |
| Red | `#e53935` | `sky-red` | Alerts, errors |

Use semantic tokens (`t-surface`, `t-text`, `t-primary`, `t-border`, `t-hover`, `t-muted`, `t-faint`, `t-header`, `t-subtle`) instead of direct colors.

## Coding Conventions

- TypeScript strict mode, Tailwind CSS with semantic theme tokens
- Server components by default; client only when needed (maps, interactive UI)
- `export const dynamic = "force-dynamic"` on DB-querying pages
- Prisma 6 ORM, Auth.js v5, MapLibre GL JS (not Leaflet)
- Validate input and check auth/roles in API handlers

## CRITICAL: Data Safety Rules

- **NEVER** run destructive DB ops (`DROP`, `DELETE`, `TRUNCATE`, `docker compose down -v`) without explicit confirmation
- **NEVER** rebuild/reset volumes that could wipe user data
- **Always** use `INSERT`/`UPDATE` — never delete unless specifically asked
- **Migrations must be additive** (add columns/tables, not drop)
- **Back up before risky operations** (`./scripts/migrate-export.sh`)
- **User data is precious** — completions, favorites, reviews represent real riding history
