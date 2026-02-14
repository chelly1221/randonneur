-- Enable extensions for the randonneur database
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create keycloak database (shared PostgreSQL instance)
CREATE DATABASE keycloak;
