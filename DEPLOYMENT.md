# Deployment — Single-VM Production (Hetzner)

Runbook for hosting Randonneur on one Hetzner Cloud VM with Docker Compose.
The dev workflow (`docker-compose.yml`) is unchanged; production uses
`docker-compose.prod.yml` + `Caddyfile`.

## Architecture

```
Hetzner Cloud VM (CPX31 — 4 vCPU / 8 GB / 160 GB, Hillsboro US-West)
└── docker compose -f docker-compose.prod.yml
    ├── caddy      :80/:443  — only externally exposed service, auto-HTTPS
    ├── app        Next.js (standalone build) — internal :3000
    ├── postgres   internal :5432  (PostGIS — `randonneur` DB)
    └── minio      internal :9000  (GPX + images)
Backups → local NAS over Tailscale (scripts/backup-to-nas.sh)
```

Auth is handled in-app by Auth.js with Google + Naver OAuth directly — there
is no Keycloak. Caddy proxies all of `audax.3chan.kr` to the Next.js app.

## Phase 1 — Provision & harden the VM  ✅ done

VM `5.78.221.121` is provisioned: system updated, `fail2ban`, 4 GB swap,
non-root `3chan` user (sudo + docker), Docker + Compose, SSH hardened
(root login & password auth disabled). Access: `ssh 3chan@5.78.221.121`.

## Phase 2 — Get the code onto the VM

The repo (with production config + the Keycloak-removed code) must reach the
VM. Either push to a git remote and clone, or rsync directly:

```bash
rsync -az --delete --exclude node_modules --exclude .next --exclude backups \
  ./ 3chan@5.78.221.121:/srv/audax/
```

Then on the VM, create `.env` from `.env.example` and fill in real values:
- `DATABASE_URL` host = `postgres`; URL-encode special chars in the password.
- `AUTH_SECRET` — generate with `openssl rand -base64 32`.
- `NEXTAUTH_URL=https://audax.3chan.kr`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET`

Edit `Caddyfile` — set the ACME `email` in the global block.

### OAuth provider setup (one-time, external)

Auth.js calls Google and Naver directly, so register the callback URLs:
- **Google Cloud Console** → Authorized redirect URIs:
  `https://audax.3chan.kr/api/auth/callback/google`
- **Naver Developers** → Callback URL:
  `https://audax.3chan.kr/api/auth/callback/naver`

## Phase 3 — Migrate data from the old server

On the **old** server:
```bash
./scripts/migrate-export.sh        # → backups/backup-YYYYMMDD-HHMMSS.tar.gz
```
Copy the archive to the VM (`scp backups/backup-*.tar.gz 3chan@5.78.221.121:/srv/audax/`).

On the **VM**, start the data services and import:
```bash
cd /srv/audax
docker compose -f docker-compose.prod.yml up -d postgres minio
COMPOSE_FILE=docker-compose.prod.yml ./scripts/migrate-import.sh backup-YYYYMMDD-HHMMSS.tar.gz
```
This restores the `randonneur` database (schema + data) and the MinIO bucket.
The dump carries the schema as it was on the old server, so the new
`keycloak_id_nullable` migration must still be applied — see Phase 4.

## Phase 4 — Build, apply migration, start, cut over DNS

1. Build & start the full stack:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```
2. Apply pending Prisma migrations (makes `keycloak_id` nullable so new
   Google/Naver signups can be created):
   ```bash
   docker compose -f docker-compose.prod.yml run --rm app \
     sh -c "npx --package=prisma@6 prisma migrate deploy"
   ```
3. Verify **before** touching DNS — point your laptop's `/etc/hosts` at the
   VM IP for `audax.3chan.kr`, then check:
   - `https://audax.3chan.kr` loads (Caddy issues a cert)
   - login via Google **and** Naver each round-trip correctly
   - existing users keep their history (email match) — spot-check an account
   - a course map + GPX download work
   - `https://audax.3chan.kr/api/health` → `postgres` / `minio` ok
4. Lower the DNS TTL ahead of time, then point the `audax.3chan.kr` A record
   at the VM's public IP. Keep the old server as a fallback for a few days.

## Phase 5 — Off-site backups to the NAS

1. Install Tailscale on **both** the VM and the NAS; join the same tailnet.
2. Allow the VM's SSH key to reach the NAS backup user (key-based).
3. Test once, then schedule via the `3chan` user's crontab:
   ```
   10 4 * * * NAS_DEST=audax@<nas-tailscale-name>:/volume1/backup/audax \
     /srv/audax/scripts/backup-to-nas.sh >> /var/log/audax-backup.log 2>&1
   ```
4. **Do a restore rehearsal** at least once — the VM is a single point of failure.

## Phase 6 — Cleanup

- Decommission the old self-hosted environment once the VM is proven stable.
- Update `CLAUDE.md` if any architecture details drift.

---

## Appendix A — Adding another service later

1. Resize the VM if RAM is tight (Hetzner console → Rescale; reboot).
2. Create the service's database + a dedicated least-privilege role in the
   shared Postgres.
3. Add the service block to `docker-compose.prod.yml` (no host ports).
4. Add a site block to `Caddyfile` for its domain; point DNS at the VM.

## Appendix B — Future Prisma migrations

The production runner image has no Prisma CLI bundled, so run migrations with
a one-off container (downloads the CLI on the fly):
```bash
docker compose -f docker-compose.prod.yml run --rm app \
  sh -c "npx --package=prisma@6 prisma migrate deploy"
```

## Appendix C — Security notes

- Secrets (`AUTH_SECRET`, OAuth client secrets, DB password) live only in
  `.env` on the VM — never commit it (`.gitignore` covers it).
- postgres / minio publish no host ports — reach their consoles via an SSH
  tunnel, e.g. `ssh -L 9001:localhost:9001 3chan@5.78.221.121`.
- The old reused password that appeared in git history must be rotated; it is
  no longer used by any service after the Keycloak removal.
