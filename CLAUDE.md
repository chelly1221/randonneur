# Randonneur - Global Randonneuring Course Platform

## Project Overview

**URL:** https://audax.3chan.kr
**Purpose:** A self-hosted platform for global randonneuring (long-distance cycling) permanent courses and BRM events. Started with 187 Korean courses imported from the legacy site, now expanded to multi-country support with automated scrapers for Australia (Audax Australia) and worldwide BRM events (ACP calendar).
**Legacy reference code:** `~/www/wordpress/wp-content/plugins/permanent-course` (WordPress plugin powering the legacy site)

## Tech Stack

| Component       | Technology                                           |
|-----------------|------------------------------------------------------|
| Frontend        | Next.js 15 (App Router) + TypeScript                 |
| Routing Engine  | Valhalla (self-hosted, Korea OSM data)               |
| Map Rendering   | MapLibre GL JS v4                                    |
| Map Tiles       | Public tile services (OSM, OpenTopoMap, CARTO)       |
| Charts          | Recharts (elevation profiles)                        |
| Auth            | Keycloak 26.0 + Auth.js v5                           |
| Database        | PostgreSQL 16 + PostGIS 3.4                          |
| ORM             | Prisma 6                                             |
| Object Storage  | MinIO (GPX + image storage)                          |
| Orchestration   | Docker Compose                                       |
| Themes          | 7 visual themes with weather effects                 |
| Scrapers        | Automated course/event import (ACP, Audax AU, KORA)  |

**Fully on-premise.** No external SaaS dependencies except public map tile CDNs. All services run in Docker containers.

## Architecture

```
docker-compose.yml
├── app           (Next.js 15 — port 3100:3000)
├── postgres      (PostGIS 16-3.4 — shared by app + keycloak)
├── keycloak      (Keycloak 26.0 — port 8080)
├── valhalla      (Valhalla routing — port 8002)
└── minio         (MinIO S3 — port 9200:9000, 9201:9001)
```

Note: Host ports 3000, 5432, 9000, 9001 are already in use, hence the non-standard mappings. No local Node.js — all npm/node operations must run via Docker.

## Directory Structure

```
audax/
├── CLAUDE.md
├── docker-compose.yml
├── .env                              # Environment variables (DO NOT COMMIT)
├── .env.example                      # Template for .env
├── .gitignore
│
├── app/                              # Next.js application
│   ├── Dockerfile                    # Multi-stage production build
│   ├── .dockerignore                 # Excludes node_modules (critical for build speed)
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── postcss.config.mjs
│   ├── public/
│   ├── prisma/
│   │   ├── schema.prisma             # DB schema with PostGIS types
│   │   └── migrations/
│   └── src/
│       ├── middleware.ts              # Auth middleware
│       ├── app/
│       │   ├── layout.tsx            # Root layout (theme provider, session)
│       │   ├── page.tsx              # Landing page
│       │   ├── globals.css
│       │   ├── manifest.ts           # PWA manifest
│       │   ├── robots.ts             # Robots.txt
│       │   ├── sitemap.ts            # Sitemap generator
│       │   │
│       │   ├── courses/
│       │   │   ├── page.tsx          # Course explorer — Korean courses (map + list + filters)
│       │   │   ├── world/
│       │   │   │   ├── page.tsx              # World courses page (server)
│       │   │   │   └── world-courses-client.tsx # World courses client (map + list + country filter)
│       │   │   └── [id]/
│       │   │       └── page.tsx      # Course detail + map + elevation + reviews
│       │   │
│       │   ├── community/
│       │   │   ├── layout.tsx        # Community layout with tab navigation
│       │   │   ├── page.tsx          # Community home (high-density dashboard)
│       │   │   ├── journals/         # Ride journals (list, create, detail, edit)
│       │   │   ├── gallery/          # Photo gallery
│       │   │   ├── events/           # Official events (calendar, detail, create/edit — admin only)
│       │   │   ├── routes/           # Shared routes (hidden from tabs)
│       │   │   └── polls/            # Community polls
│       │   │
│       │   ├── users/
│       │   │   └── [id]/page.tsx     # Public user profile
│       │   │
│       │   ├── settings/
│       │   │   ├── page.tsx          # User settings
│       │   │   └── bikes/page.tsx    # Bike garage
│       │   │
│       │   ├── auth/
│       │   │   └── login/
│       │   │       └── page.tsx      # Keycloak login redirect
│       │   │
│       │   ├── profile/
│       │   │   └── page.tsx          # User profile + completion log
│       │   │
│       │   ├── admin/
│       │   │   ├── layout.tsx        # Admin sidebar layout
│       │   │   ├── page.tsx          # Dashboard overview
│       │   │   ├── courses/          # Course CRUD + import
│       │   │   ├── users/            # User management (ban/role)
│       │   │   ├── gpx/              # GPX file management (MinIO)
│       │   │   ├── system/           # System health checks + backups + scraper controls
│       │   │   ├── reports/          # Content report review
│       │   │   └── seasonal/         # Seasonal picks management
│       │   │
│       │   └── api/
│       │       ├── auth/[...nextauth]/route.ts
│       │       ├── health/route.ts
│       │       ├── courses/
│       │       │   ├── route.ts              # GET list, POST create
│       │       │   ├── bulk-import/route.ts  # POST bulk import
│       │       │   ├── batch-download/route.ts # POST batch GPX zip
│       │       │   └── [id]/
│       │       │       ├── route.ts          # GET, PUT, DELETE
│       │       │       ├── gpx/route.ts      # GET GPX file
│       │       │       ├── route-info/route.ts # GET Valhalla route
│       │       │       └── checkpoints/route.ts # GET, POST
│       │       ├── completions/
│       │       │   ├── route.ts              # POST log completion
│       │       │   └── me/route.ts           # GET my completions
│       │       ├── favorites/
│       │       │   ├── route.ts              # POST toggle favorite
│       │       │   └── me/route.ts           # GET my favorites
│       │       ├── events/
│       │       │   ├── route.ts              # GET list (country filter), POST create
│       │       │   ├── countries/route.ts    # GET unique event countries
│       │       │   └── [id]/route.ts         # GET, PUT, DELETE
│       │       └── admin/
│       │           ├── stats/route.ts        # GET dashboard stats
│       │           ├── users/route.ts        # GET user list
│       │           ├── upload-gpx/route.ts   # POST GPX to MinIO
│       │           ├── gpx-list/route.ts     # GET MinIO file list
│       │           ├── upload-image/route.ts # POST checkpoint images
│       │           └── scraper/
│       │               ├── kora/route.ts             # POST run ACP BRM scraper
│       │               ├── audax-au/route.ts         # POST run Audax AU scraper
│       │               └── kora-permanents/route.ts  # POST run KORA permanents scraper
│       │
│       ├── components/
│       │   ├── theme-provider.tsx     # Theme context (7 themes)
│       │   ├── weather-effects.tsx    # Ambient weather animations
│       │   ├── map/
│       │   │   └── course-map.tsx     # MapLibre GL JS map display
│       │   ├── course/
│       │   │   ├── course-explorer.tsx     # Map + list + inline filters
│       │   │   ├── course-card.tsx         # Course list item card
│       │   │   ├── course-detail-client.tsx # Course detail client component
│       │   │   ├── course-reviews.tsx      # Reviews on course detail
│       │   │   ├── elevation-profile.tsx   # Recharts elevation chart
│       │   │   ├── completion-form.tsx     # Mark course completed
│       │   │   ├── favorite-button.tsx     # Toggle favorite
│       │   │   ├── like-button.tsx         # Like toggle
│       │   │   ├── comment-section.tsx     # Comments
│       │   │   ├── report-button.tsx       # Report content
│       │   │   ├── popular-courses.tsx     # Popular courses list
│       │   │   └── geolocation-tracker.tsx # GPS tracking on map
│       │   ├── community/
│       │   │   ├── recent-reviews.tsx      # Compact review grid
│       │   │   ├── recent-completions.tsx  # Compact completion list
│       │   │   ├── activity-timeline.tsx   # Activity feed
│       │   │   ├── event-calendar.tsx      # Event calendar/list
│       │   │   ├── event-card.tsx          # Event card
│       │   │   ├── event-form.tsx          # Event create/edit form
│       │   │   ├── event-detail-client.tsx # Event detail with participation
│       │   │   └── notification-bell.tsx   # Notification indicator
│       │   ├── user/
│       │   │   ├── user-avatar.tsx         # User avatar component
│       │   │   └── user-popover.tsx        # User preview popover
│       │   ├── layout/
│       │   │   ├── header.tsx         # Navigation + auth menu
│       │   │   ├── theme-selector.tsx # Theme picker dropdown
│       │   │   └── search-bar.tsx     # Global search
│       │   ├── auth/
│       │   │   ├── session-provider.tsx # NextAuth session wrapper
│       │   │   ├── login-button.tsx    # Keycloak login/logout
│       │   │   └── user-menu.tsx       # User dropdown menu
│       │   ├── admin/
│       │   │   ├── course-form.tsx     # Create/edit course form
│       │   │   ├── checkpoint-form.tsx # Checkpoint management
│       │   │   ├── delete-course-button.tsx
│       │   │   └── archive-toggle-button.tsx
│       │   └── ui/                    # Shared UI primitives
│       │
│       ├── lib/
│       │   ├── auth.ts               # Auth.js v5 config + Keycloak provider
│       │   ├── db.ts                  # Prisma client singleton
│       │   ├── minio.ts              # MinIO S3 client
│       │   ├── valhalla.ts           # Valhalla routing API
│       │   ├── gpx.ts                # Custom regex-based GPX parser
│       │   ├── geo-utils.ts          # PostGIS geometry helpers
│       │   ├── course-colors.ts      # Color mapping by region/distance
│       │   ├── theme.ts              # Theme definitions (7 themes)
│       │   ├── badges.ts             # Badge definitions and logic
│       │   ├── notifications.ts      # Notification helpers
│       │   ├── user-guard.ts         # Active user validation middleware
│       │   ├── kora-scraper.ts       # ACP BRM world calendar scraper
│       │   ├── audax-au-scraper.ts   # Audax Australia permanent course scraper
│       │   ├── kora-permanents-scraper.ts # Korea Randonneurs permanent course scraper
│       │   └── utils.ts              # General utilities (cn, etc.)
│       │
│       └── types/
│           ├── index.ts              # Shared types, regions, categories
│           └── next-auth.d.ts        # Auth.js type extensions
│
├── keycloak/
│   └── realm-export.json             # Pre-configured realm
│
├── postgres/
│   └── init/
│       └── 01-init.sql               # Enable PostGIS + uuid-ossp
│
├── valhalla/
│   └── valhalla.json                 # Korea routing config
│
└── scripts/
    ├── seed.sh                       # Database seeding
    ├── import-courses.ts             # Import from structured data
    ├── import-legacy-courses.ts      # Scrape legacy site
    ├── download-osm.sh              # Download Korea OSM data
    ├── migrate-export.sh            # Export data for migration
    └── migrate-import.sh            # Import data on new machine
```

## Docker Compose Conventions

- **Always build production builds** for the Next.js app (`next build` in Dockerfile, `NODE_ENV=production`).
- Use named volumes only for persistent data (postgres, minio, valhalla tiles).
- Use `.env` file for all secrets and configuration variables.
- Keycloak shares the same PostgreSQL instance (separate database `keycloak`).

### Volume Mount Summary

| Service    | Host Path            | Container Path                     | Purpose              |
|------------|----------------------|------------------------------------|----------------------|
| app        | `./app`              | `/app` (build context)             | Next.js source       |
| postgres   | `./postgres/init`    | `/docker-entrypoint-initdb.d`      | Init scripts         |
| postgres   | `pg_data` (volume)   | `/var/lib/postgresql/data`         | Persistent DB data   |
| keycloak   | `./keycloak`         | `/opt/keycloak/data/import`        | Realm config         |
| valhalla   | `./valhalla`         | `/custom_files`                    | Routing config       |
| valhalla   | `valhalla_tiles` (vol)| `/custom_files/valhalla_tiles`    | Routing graph cache  |
| minio      | `minio_data` (vol)   | `/data`                            | Object storage data  |

## Core Features

### Course Explorer — Korea (`/courses`)
Unified map + list view for Korean courses (country='KR' or null):
- Interactive MapLibre GL JS map with all course routes overlaid (color-coded by region)
- Tile source switching: OSM, OpenTopoMap, CARTO Light, CARTO Dark
- Filterable course list: region, distance range (slider), category, search
- GPX download per course (individual + batch ZIP download)
- Course cards with distance, elevation, start/end locations, category emoji
- Click route on map or card to navigate to detail

### World Course Explorer (`/courses/world`)
Global courses from non-Korean countries (Audax Australia, etc.):
- Interactive map view showing worldwide course locations
- List view with country, region, distance filters
- Country flag indicators (AU, etc.)
- Category badges (BP, BPD, BPG, BPR, SR, RAID)
- External links to official course pages
- Navigation: "세계" tab in header alongside "한국" (Korea)

### Course Detail (`/courses/[id]`)
- Interactive map with route + checkpoints displayed
- Elevation profile chart (Recharts)
- Course statistics (distance, elevation, estimated time, designer)
- Checkpoint list with images
- GPS geolocation tracking on map
- Favorite toggle (logged-in users)
- Completion logging with date and notes
- Reviews with difficulty rating, completion status, photos, comments, likes
- GPX file download
- Report and improvement request features

### Community (`/community`)
Tabs: 홈, 후기, 갤러리, 이벤트, 투표

#### Community Home (`/community`)
High-density 2-column layout:
- **Left column (3/5):** 최근 후기 — 2-column grid, compact review cards with user, status badge, stars, course link, content preview, engagement counts
- **Right column (2/5):**
  - 월간 인기 코스 — Ranked 1-5 compact list (by engagement score: completions×3 + favorites×2 + reviews×1)
  - 활동 피드 — Compact timeline of completions and reviews, filterable (전체/팔로잉/내 활동)
  - 최근 완주 — Compact one-line list of recent completions

#### Journals / Reviews (`/community/journals`)
- User-created ride journals with rich text editor
- Photo upload support
- Comments and likes

#### Gallery (`/community/gallery`)
- Photo gallery from reviews and journals

#### Events (`/community/events`)
- **Official events only** — admin-only creation/edit/delete, plus automated ACP BRM imports
- Calendar view (month grid desktop, week strip mobile) + list view
- Country filter dropdown (defaults to Korea, supports worldwide view)
- Event types: 브레베, 그룹라이드, 자전거 축제, 기타
- Source badges (ACP for scraped events) with link to official source
- Country flag and name badges on event cards
- Participation system: 참가/관심있음 with capacity limits
- Linked to courses (optional)

#### Polls (`/community/polls`)
- Community polls with multiple options
- Vote tracking

### Social Features
- **User Profiles** (`/users/[id]`) — Public profile with completions, reviews, badges, follow stats
- **Follow System** — Follow other riders, see their activity in feed
- **Comments** — On reviews and journals
- **Likes** — On reviews and comments
- **Reports** — Report inappropriate content (admin review)
- **Badges** — Achievement badges based on completions, distance, etc.
- **Notifications** — In-app notification system
- **Search** — Full-text search across courses, users, reviews

### Authentication
- Login via Keycloak OIDC (Auth.js v5 provider)
- Google IdP integration (optional)
- Registration handled by Keycloak directly
- Roles: `admin`, `user` (synced from Keycloak)
- User status: `active`, `banned` (banned users redirected to `/banned`)
- Session-based with JWT

### User Features (logged in)
- Mark courses as completed (with completion status: success/DNF/DNQ/DNS/partial)
- Write reviews with difficulty rating and photos
- Favorite courses
- Profile page with completion statistics, badges, bike garage
- GPS location tracking during rides
- Settings page for profile customization
- Follow other users

### Admin Dashboard (`/admin`)
- **Dashboard Overview** — Course count, user count, download stats
- **Course Management** — Full CRUD with GPX upload to MinIO
  - Create/edit course with metadata and GPX file
  - Checkpoint management with image upload
  - Archive/unarchive courses (soft delete)
  - Bulk import from legacy site or CSV
- **User Management** — View/manage users, ban/unban, role changes
- **GPX Management** — Browse/manage GPX files in MinIO
- **System Status** — Health checks for all services (postgres, keycloak, minio, valhalla)
- **Reports** — Review user-submitted reports
- **Seasonal Picks** — Manage seasonal course recommendations
- **Improvement Requests** — Review course improvement suggestions
- **Checkpoint Photos** — Review user-submitted checkpoint photos
- **Backups** — Create, download, upload, restore database backups
- **Scraper Controls** — Enable/disable, manual run, status/stats for each scraper (in System page)

### Automated Scrapers
Three scrapers run on schedule via `instrumentation.ts` (Node.js setInterval, no external scheduler):

#### ACP BRM World Calendar (`kora-scraper.ts`)
- **Source:** ACP API (`brevets.audax-club-parisien.com`)
- **Data:** Worldwide BRM brevet events (all countries, all distances)
- **Schedule:** Daily (checked hourly, 30s startup delay)
- **Output:** Event records with sourceType='acp', country mapping
- **Dedup:** externalId e.g. "acp-2026-0307-korea-seoul-200"

#### Audax Australia Courses (`audax-au-scraper.ts`)
- **Source:** `audax.org.au/ride/permanents-register/`
- **Data:** Australian permanent randonneuring courses with GPX from RideWithGPS
- **Schedule:** Monthly (checked every 6h, 2min startup delay)
- **Output:** Course records with sourceType='audax-au', country='AU', GPX uploaded to MinIO
- **Dedup:** externalId e.g. "audax-au-{rideId}"

#### Korea Randonneurs Permanents (`kora-permanents-scraper.ts`)
- **Source:** `korearandonneurs.kr` permanents page
- **Data:** Official Korean permanent courses with GPX from RideWithGPS
- **Schedule:** Monthly (checked every 6h, 4min startup delay)
- **Output:** Course records with sourceType='kora-permanent', country='KR'
- **Dedup:** externalId e.g. "kora-PT01", matches existing courses by courseNumber

#### Scraper Admin Settings (stored in `settings` table)
- `{SCRAPER}_ENABLED` — boolean toggle
- `{SCRAPER}_LAST_SCRAPE_DATE` — ISO timestamp of last run
- `{SCRAPER}_LAST_SCRAPE_RESULT` — JSON with created/updated/skipped/errors counts

### Theme System
7 visual themes with weather effects:
- Each theme defines color tokens for surfaces, text, borders, and accents
- Weather effects overlay (rain, snow, fog, etc.)
- Theme selector in header
- CSS custom properties via semantic tokens (`t-surface`, `t-text`, `t-primary`, etc.)

## Database Schema (PostGIS)

All tables use UUID primary keys. PostgreSQL extensions: `postgis`, `uuid-ossp`.

### Core Tables
- **`courses`** — id, course_number, name, distance_km, elevation_m, estimated_time, start_location, end_location, region, category, tags[], description, designer, gpx_file_key, archived, geom (PostGIS LineString 4326), country, source_type, external_id, created_at, updated_at
- **`users`** — id, keycloak_id, display_name, email, role, status (active/banned), avatar_key, bio, created_at
- **`completions`** — id, user_id, course_id, completed_at, completion_status (success/dnf/dnq/dns/partial), gpx_file_key, notes, created_at
- **`downloads`** — id, course_id, downloaded_at, ip_hash
- **`checkpoints`** — id, course_id, name, description, distance_km, image_key, sort_order
- **`favorites`** — id, user_id, course_id (unique on user+course)

### Community Tables
- **`reviews`** — id, user_id, course_id, completion_status, difficulty (1-5), content (HTML), created_at
- **`comments`** — id, user_id, review_id, content, created_at
- **`likes`** — id, user_id, review_id (unique on user+review)
- **`follows`** — id, follower_id, following_id (unique on follower+following)
- **`reports`** — id, reporter_id, target_type, target_id, reason, status, created_at
- **`journals`** — id, user_id, title, content, created_at
- **`review_photos`** — id, review_id, image_key, sort_order

### Events & Features
- **`events`** — id, user_id, title, description, event_type, course_id, location, start_date, end_date, max_participants, source_type, external_id, source_url, country, created_at (admin-only creation + ACP scraper)
- **`event_participants`** — id, event_id, user_id, status (going/interested/cancelled)
- **`seasonal_picks`** — id, course_id, season, year, description, sort_order
- **`badges`** — id, user_id, badge_type, earned_at
- **`notifications`** — id, user_id, type, title, body, read, data, created_at
- **`polls`** — id, user_id, title, options, created_at
- **`shared_routes`** — id, user_id, title, description, distance, elevation, region, gpx_file_key, download_count
- **`push_subscriptions`** — id, user_id, endpoint, keys, created_at
- **`bikes`** — id, user_id, name, brand, model, year, is_primary

## API Routes (Next.js Route Handlers)

```
# Auth
GET/POST  /api/auth/[...nextauth]       — Auth.js endpoints
POST      /api/auth/keycloak-logout      — Keycloak backchannel logout

# Courses
GET       /api/courses                   — List courses (filters: region, distance, category, q, archived, country)
POST      /api/courses                   — Create course (admin)
GET       /api/courses/:id               — Course detail with checkpoints
PUT       /api/courses/:id               — Update course (admin)
DELETE    /api/courses/:id               — Delete course (admin)
GET       /api/courses/:id/gpx           — Download GPX file from MinIO
GET       /api/courses/:id/route-info    — Valhalla route data
GET       /api/courses/:id/geometry      — Course GeoJSON geometry
GET/POST  /api/courses/:id/checkpoints   — List/create checkpoints (admin)
GET/POST  /api/courses/:id/reviews       — Course reviews
POST      /api/courses/:id/improvement-request — Submit improvement request
POST      /api/courses/bulk-import       — Bulk import courses (admin)
POST      /api/courses/batch-download    — Batch GPX download as ZIP
GET       /api/courses/popular           — Popular courses by engagement score
GET       /api/courses/recommendations   — Personalized recommendations (user) / popular (anonymous)

# Completions & Reviews
POST      /api/completions               — Log completion (user)
GET       /api/completions/me            — My completions (user)
GET/PUT/DEL /api/reviews/:id             — Review CRUD
GET/POST  /api/reviews/:id/comments      — Review comments
POST      /api/reviews/:id/photos        — Upload review photos

# Social
POST      /api/favorites                 — Toggle favorite (user)
GET       /api/favorites/me              — My favorites (user)
POST      /api/likes                     — Toggle like (user)
GET       /api/likes/me                  — My likes (user)
POST      /api/follows                   — Follow/unfollow (user)
GET       /api/follows/me                — My follows (user)
POST      /api/reports                   — Submit report (user)
DELETE    /api/comments/:id              — Delete comment (owner/admin)

# Community
GET       /api/community/recent-reviews      — Recent reviews
GET       /api/community/recent-completions  — Recent completions
GET       /api/activity                      — Activity feed (all/following/mine)
GET/POST  /api/journals                      — Ride journals
GET/PUT/DEL /api/journals/:id                — Journal CRUD
GET/POST  /api/events                        — Events (GET public w/ country filter, POST admin-only)
GET/PUT/DEL /api/events/:id                  — Event CRUD (PUT/DEL admin-only)
GET       /api/events/countries              — Unique event country list
POST      /api/events/:id/participate        — Event participation (user)
GET/POST  /api/polls                         — Polls
POST      /api/polls/:id/vote               — Vote on poll
GET       /api/gallery                       — Photo gallery
GET/POST  /api/shared-routes                 — Shared routes
GET       /api/seasonal                      — Seasonal picks
GET       /api/badges                        — User badges

# Users
GET       /api/users/:id                 — Public user profile
GET       /api/users/:id/followers       — User follower list
GET       /api/users/:id/preview         — User popover preview
GET       /api/users/me                  — Current user
PUT       /api/users/me/avatar           — Upload avatar

# Search
GET       /api/search                    — Full-text search (courses, users, reviews)

# Notifications
GET       /api/notifications             — User notifications
POST      /api/notifications/read        — Mark notifications read

# Admin
GET       /api/admin/stats               — Dashboard statistics
GET       /api/admin/users               — User list
PUT       /api/admin/users/:id           — Update user (ban/role)
POST      /api/admin/upload-gpx          — Upload GPX to MinIO
GET       /api/admin/gpx-list            — List GPX files in MinIO
POST      /api/admin/upload-image        — Upload checkpoint image
GET/POST  /api/admin/reports             — Manage reports
PUT       /api/admin/reports/:id         — Update report status
GET/POST  /api/admin/seasonal            — Manage seasonal picks
GET/POST  /api/admin/improvement-requests — Manage improvement requests
GET/POST  /api/admin/backups             — Backup management
POST      /api/admin/backups/restore     — Restore from backup
POST      /api/admin/settings            — Admin settings
POST      /api/admin/scraper/kora        — Run ACP BRM scraper manually (admin)
POST      /api/admin/scraper/audax-au    — Run Audax AU scraper manually (admin)
POST      /api/admin/scraper/kora-permanents — Run KORA permanents scraper manually (admin)

# System
GET       /api/health                    — Service health checks
```

## Build & Run Commands

```bash
# Start all services (production)
docker compose up -d --build

# Rebuild only the Next.js app
docker compose up -d --build app

# View logs
docker compose logs -f app

# Stop all services
docker compose down

# Reset everything (WARNING: destroys data)
docker compose down -v

# Run database migrations (use prisma@6 to avoid auto-pulling v7)
docker compose exec app npx --package=prisma@6 prisma migrate deploy

# Generate Prisma client
docker compose exec app npx --package=prisma@6 prisma generate

# Export data for migration to another machine
./scripts/migrate-export.sh
# -> Creates backup-YYYYMMDD-HHMMSS.tar.gz

# Import data on new machine (services must be running)
./scripts/migrate-import.sh backup-YYYYMMDD-HHMMSS.tar.gz
```

## Environment Variables (.env)

```
# PostgreSQL
POSTGRES_USER=your_user
POSTGRES_PASSWORD=your_password
POSTGRES_DB=randonneur
DATABASE_URL=postgresql://your_user:your_password@postgres:5432/randonneur

# Keycloak (shares PostgreSQL)
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=your_password
KC_DB=postgres
KC_DB_URL=jdbc:postgresql://postgres:5432/keycloak
KC_DB_USERNAME=your_user
KC_DB_PASSWORD=your_password
AUTH_KEYCLOAK_ID=randonneur-app
AUTH_KEYCLOAK_SECRET=your_secret
AUTH_KEYCLOAK_ISSUER=http://keycloak:8080/realms/randonneur

# MinIO
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=your_password
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_BUCKET=gpx-files

# Valhalla
VALHALLA_URL=http://valhalla:8002

# Next.js
NEXTAUTH_SECRET=generate_a_secret_here
NEXTAUTH_URL=https://your-domain.com
NODE_ENV=production
```

Note: If the DB password contains special characters like `&&`, URL-encode them in DATABASE_URL (e.g., `%26%26`).

## Development Notes

- **No local Node.js** — all npm/node operations must run via Docker (`docker compose exec app ...`).
- **MapLibre GL JS v4 only** — pinned to `^4.7.1` due to incompatibility with `react-map-gl` v7 at v5.
- **Custom GPX parser** — `@we-gold/gpxjs` requires DOMParser (browser-only), so a custom regex-based parser is used server-side in `lib/gpx.ts`.
- **Public tile services** — no self-hosted tile server. Uses OSM, OpenTopoMap, and CARTO CDN tiles.
- **Keycloak shares PostgreSQL** — Keycloak uses its own `keycloak` database in the same PostgreSQL instance.
- **MapLibre attribution workaround** — `compact: true` auto-expands on desktop. Fixed with `requestAnimationFrame` + `map.once("load")` to remove `compact-show` class.
- **Valhalla initial build** — first start downloads Korea OSM PBF from Geofabrik and builds routing graph (takes 10-30 min).
- **`.dockerignore` is critical** — without it, `node_modules` (800MB+) gets sent as Docker build context.
- GPX files stored in MinIO under `gpx-files` bucket with keys: `courses/{course_id}.gpx`, checkpoint images under `images/`.
- **Scrapers use Node built-in http/https** — forced IPv4 for Docker DNS compatibility, regex-based HTML parsing (no external HTML parser dependency).
- **RideWithGPS integration** — scrapers fetch route geometry from RideWithGPS public API (`/routes/{id}.json`), convert track_points to GPX.
- **Scraper scheduling** — uses `instrumentation.ts` with `setInterval` (no cron dependency). ACP daily, Audax AU and KORA monthly. Staggered startup delays.
- **Multi-country courses** — existing Korean courses have `country='KR'` (backfilled via migration). `/courses` shows KR only, `/courses/world` shows non-KR.

## Color Theme — Randonneuring Sky

The color palette represents the sky during a long ride — from pre-dawn black through dawn blue, morning sky blue, golden sunrise, orange dusk, and red sunset.

| Name       | Hex       | Tailwind Token   | Usage                                      |
|------------|-----------|------------------|---------------------------------------------|
| Black      | `#0a0a0a` | `sky-black`      | Text, dark backgrounds, headers             |
| Dark Blue  | `#1a237e` | `sky-darkblue`   | Primary brand, nav bar, dark sections       |
| Sky Blue   | `#4fc3f7` | `sky-blue`       | Links, accents, interactive elements        |
| Yellow     | `#fdd835` | `sky-yellow`     | Highlights, badges, warnings, stars         |
| Orange     | `#ff9800` | `sky-orange`     | CTAs, hover states, active indicators       |
| Red        | `#e53935` | `sky-red`        | Alerts, errors, important actions, markers  |

### Theme Token System
Components use semantic theme tokens (`t-surface`, `t-text`, `t-primary`, `t-border`, `t-hover`, `t-muted`, `t-faint`, `t-header`, `t-subtle`) instead of direct color values. These are defined as CSS custom properties by the theme provider and change with the active theme.

### General Rules
- Dark blue (`sky-darkblue`) is the primary brand color — nav, footer, primary buttons
- Sky blue (`sky-blue`) for links, secondary buttons, info highlights
- Orange (`sky-orange`) for primary CTAs and hover states
- Yellow (`sky-yellow`) sparingly for badges, ratings, featured items
- Red (`sky-red`) for destructive actions, errors, route start markers
- Use semantic `t-*` tokens in components rather than direct `sky-*` colors

## Coding Conventions

- Use TypeScript strict mode everywhere.
- Use Tailwind CSS for styling with semantic theme tokens.
- Use server components by default; client components only when needed (maps, interactive UI).
- Use `export const dynamic = "force-dynamic"` on pages that query the database (avoids build-time DB connection errors with standalone output).
- Use Prisma 6 as the ORM with PostGIS extension support.
- Use Auth.js v5 with Keycloak provider for authentication.
- Use MapLibre GL JS (not Leaflet) for all map rendering.
- API route handlers should validate input and check auth/roles.
- Keep components small and composable.
- Use semantic theme tokens (`t-surface`, `t-text`, `t-primary`, etc.) instead of direct color values.

## Planned / Future Features

- **Download analytics** — `downloads` table exists in schema but API doesn't log downloads yet
- **Valhalla turn-by-turn** — `/api/courses/:id/route-info` endpoint exists but Valhalla routing not fully integrated with the UI
- **User GPX upload verification** — completion form accepts notes but GPX proof upload not implemented
- **Nginx reverse proxy** — for SSL termination and caching, not yet configured
- **PWA** — manifest.ts and service worker exist but push notifications not fully wired

## CRITICAL: Data Safety Rules

- **NEVER run destructive database operations** (`DROP`, `DELETE`, `TRUNCATE`, volume removal, `docker compose down -v`, `prisma migrate reset`) without explicit user confirmation.
- **NEVER rebuild containers or reset volumes** in a way that could wipe user data (completions, users, favorites, courses).
- **Always use `INSERT` or `UPDATE`** for data changes — never delete existing rows unless specifically asked.
- **Before running migrations**, ensure they are additive (adding columns/tables) rather than destructive (dropping columns/tables).
- **Back up before risky operations** — if a task could potentially affect data, suggest or perform a backup first (`./scripts/migrate-export.sh`).
- **User data is precious** — completions, favorites, and user records represent real riding history that cannot be recreated.
