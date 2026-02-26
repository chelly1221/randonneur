# Randonneur - Korea Randonneuring Course Platform

## Project Overview

**URL:** https://randonneur.3chan.kr
**Purpose:** A self-hosted platform for Korean randonneuring (long-distance cycling) permanent courses. 187 real courses imported from the legacy site at https://archive1.3chan.kr/randonneur-course/.
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
│       │   │
│       │   ├── courses/
│       │   │   ├── page.tsx          # Course explorer (map + list + filters)
│       │   │   └── [id]/
│       │   │       └── page.tsx      # Course detail + map + elevation
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
│       │   │   ├── courses/
│       │   │   │   ├── page.tsx      # Course management (list)
│       │   │   │   ├── new/
│       │   │   │   │   └── page.tsx  # Create new course
│       │   │   │   ├── [id]/
│       │   │   │   │   └── edit/
│       │   │   │   │       └── page.tsx  # Edit course + checkpoints
│       │   │   │   └── import/
│       │   │   │       └── page.tsx  # Bulk import from legacy
│       │   │   ├── users/
│       │   │   │   └── page.tsx      # User management
│       │   │   ├── gpx/
│       │   │   │   └── page.tsx      # GPX file management (MinIO)
│       │   │   └── system/
│       │   │       └── page.tsx      # System health checks
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
│       │       └── admin/
│       │           ├── stats/route.ts        # GET dashboard stats
│       │           ├── users/route.ts        # GET user list
│       │           ├── upload-gpx/route.ts   # POST GPX to MinIO
│       │           ├── gpx-list/route.ts     # GET MinIO file list
│       │           └── upload-image/route.ts # POST checkpoint images
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
│       │   │   ├── elevation-profile.tsx   # Recharts elevation chart
│       │   │   ├── completion-form.tsx     # Mark course completed
│       │   │   ├── favorite-button.tsx     # Toggle favorite
│       │   │   └── geolocation-tracker.tsx # GPS tracking on map
│       │   ├── layout/
│       │   │   ├── header.tsx         # Navigation + auth menu
│       │   │   └── theme-selector.tsx # Theme picker dropdown
│       │   ├── auth/
│       │   │   ├── session-provider.tsx # NextAuth session wrapper
│       │   │   ├── login-button.tsx    # Keycloak login/logout
│       │   │   └── user-menu.tsx       # User dropdown menu
│       │   ├── admin/
│       │   │   ├── course-form.tsx     # Create/edit course form
│       │   │   ├── checkpoint-form.tsx # Checkpoint management
│       │   │   ├── delete-course-button.tsx
│       │   │   └── archive-toggle-button.tsx
│       │   └── ui/
│       │       ├── button.tsx
│       │       ├── card.tsx
│       │       ├── input.tsx
│       │       ├── select.tsx
│       │       ├── badge.tsx
│       │       └── range-slider.tsx
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

### Course Explorer (`/courses`)
Unified map + list view with inline filters:
- Interactive MapLibre GL JS map with all course routes overlaid (color-coded by region)
- Tile source switching: OSM, OpenTopoMap, CARTO Light, CARTO Dark
- Filterable course list: region, distance range (slider), category, search
- GPX download per course (individual + batch ZIP download)
- Course cards with distance, elevation, start/end locations, category emoji
- Click route on map or card to navigate to detail

### Course Detail (`/courses/[id]`)
- Interactive map with route + checkpoints displayed
- Elevation profile chart (Recharts)
- Course statistics (distance, elevation, estimated time, designer)
- Checkpoint list with images
- GPS geolocation tracking on map
- Favorite toggle (logged-in users)
- Completion logging with date and notes
- GPX file download

### Authentication
- Login via Keycloak OIDC (Auth.js v5 provider)
- Registration handled by Keycloak directly
- Roles: `admin`, `user` (synced from Keycloak)
- Session-based with JWT

### User Features (logged in)
- Mark courses as completed (personal log with date and notes)
- Favorite courses
- Profile page with completion statistics
- GPS location tracking during rides

### Admin Dashboard (`/admin`)
- **Dashboard Overview** — Course count, user count, download stats
- **Course Management** — Full CRUD with GPX upload to MinIO
  - Create/edit course with metadata and GPX file
  - Checkpoint management with image upload
  - Archive/unarchive courses (soft delete)
  - Bulk import from legacy site or CSV
- **User Management** — View users synced from Keycloak
- **GPX Management** — Browse/manage GPX files in MinIO
- **System Status** — Health checks for all services (postgres, keycloak, minio, valhalla)

### Theme System
7 visual themes with weather effects:
- Each theme defines color tokens for surfaces, text, borders, and accents
- Weather effects overlay (rain, snow, fog, etc.)
- Theme selector in header
- CSS custom properties via semantic tokens (`t-surface`, `t-text`, `t-primary`, etc.)

## Database Schema (PostGIS)

6 tables, all with UUID primary keys:

- **`courses`** — id, course_number, name, distance_km, elevation_m, estimated_time, start_location, end_location, region, category, tags[], description, designer, gpx_file_key, archived, geom (PostGIS LineString 4326), created_at, updated_at
- **`users`** — id, keycloak_id, display_name, email, role, created_at
- **`completions`** — id, user_id, course_id, completed_at, gpx_file_key, notes, created_at
- **`downloads`** — id, course_id, downloaded_at, ip_hash
- **`checkpoints`** — id, course_id, name, description, distance_km, image_key, sort_order
- **`favorites`** — id, user_id, course_id (unique constraint on user+course)

PostgreSQL extensions: `postgis`, `uuid-ossp`

## API Routes (Next.js Route Handlers)

```
# Auth
GET/POST  /api/auth/[...nextauth]       — Auth.js endpoints

# Courses
GET       /api/courses                   — List courses (filters: region, distance, category, q, archived)
POST      /api/courses                   — Create course (admin)
GET       /api/courses/:id               — Course detail with checkpoints
PUT       /api/courses/:id               — Update course (admin)
DELETE    /api/courses/:id               — Delete course (admin)
GET       /api/courses/:id/gpx           — Download GPX file from MinIO
GET       /api/courses/:id/route-info    — Valhalla route data
GET/POST  /api/courses/:id/checkpoints   — List/create checkpoints (admin)
POST      /api/courses/bulk-import       — Bulk import courses (admin)
POST      /api/courses/batch-download    — Batch GPX download as ZIP

# Completions
POST      /api/completions               — Log completion (user)
GET       /api/completions/me            — My completions (user)

# Favorites
POST      /api/favorites                 — Toggle favorite (user)
GET       /api/favorites/me              — My favorites (user)

# Admin
GET       /api/admin/stats               — Dashboard statistics (admin)
GET       /api/admin/users               — User list (admin)
POST      /api/admin/upload-gpx          — Upload GPX to MinIO (admin)
GET       /api/admin/gpx-list            — List GPX files in MinIO (admin)
POST      /api/admin/upload-image        — Upload checkpoint image (admin)

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

These are designed or partially implemented but not yet fully wired:

- **Download analytics** — `downloads` table exists in schema but API doesn't log downloads yet
- **Valhalla turn-by-turn** — `/api/courses/:id/route-info` endpoint exists but Valhalla routing not fully integrated with the UI
- **User GPX upload verification** — completion form accepts notes but GPX proof upload not implemented
- **Nginx reverse proxy** — for SSL termination and caching, not yet configured
