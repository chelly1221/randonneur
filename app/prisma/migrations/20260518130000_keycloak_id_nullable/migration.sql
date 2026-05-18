-- Keycloak removed: users now authenticate directly via Google/Naver through
-- Auth.js, keyed on email. keycloak_id becomes optional — existing values are
-- retained for reference, new users have NULL.
ALTER TABLE "users" ALTER COLUMN "keycloak_id" DROP NOT NULL;
