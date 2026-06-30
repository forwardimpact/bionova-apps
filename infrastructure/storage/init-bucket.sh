#!/bin/sh
# One-shot sidecar: create the trial-documents bucket in MinIO. Runs after
# minio is healthy (see docker-compose.yml storage-init service).
set -eu
mc alias set local http://minio:9000 "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}"
mc mb --ignore-existing local/trial-documents
mc anonymous set download local/trial-documents
echo "bucket trial-documents ready"
