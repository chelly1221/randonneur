#!/bin/bash
# Download South Korea OSM data for Valhalla
# This is handled automatically by the Valhalla Docker image via tile_urls env var.
# Run this only if you want to pre-download the data.

set -e

DOWNLOAD_DIR="${1:-./valhalla}"
URL="https://download.geofabrik.de/asia/south-korea-latest.osm.pbf"
OUTPUT="$DOWNLOAD_DIR/south-korea-latest.osm.pbf"

echo "Downloading South Korea OSM data..."
curl -L -o "$OUTPUT" "$URL"
echo "Downloaded to $OUTPUT"
echo "Size: $(du -h "$OUTPUT" | cut -f1)"
