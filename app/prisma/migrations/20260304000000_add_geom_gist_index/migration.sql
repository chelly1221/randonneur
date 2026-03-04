-- CreateIndex
CREATE INDEX IF NOT EXISTS courses_geom_gist_idx ON courses USING GIST (geom);
