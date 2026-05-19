# Actual Operating Model

## Purpose

This repository packages `Actual` as a single containerized web application.
The service serves the Actual browser client and the sync server from one
process, with all persistent state stored under a mounted data directory.

This operating model is intentionally simple:
- one container
- one persistent data volume
- no external database
- optional object-storage backups of the full data directory

## Runtime Flow

1. Build the production image from the repository root `Dockerfile`.
2. Start the container with a persistent volume mounted at `/data`.
3. The server reads and writes all runtime state under that data directory:
   - account and auth state
   - uploaded budget blobs
   - sync-group SQLite state
   - demo or imported budget files
4. On a fresh deployment, the runtime seeds the bundled
   `Betting Syndicate Demo` budget into the sync-server file store.
5. The browser connects to the same container on port `5006`.
6. When `ACTUAL_BACKUP_BUCKET` is configured, the runtime wrapper:
   - archives the full Actual data directory on a fixed interval
   - uploads the archive to GCS
   - performs one final backup during shutdown after the server stops

## Persistence Contract

The mounted `/data` volume is the source of truth for the running service.
Backups archive the entire directory rather than selecting specific SQLite or
blob files. That keeps restore semantics simple and ensures all Actual state
travels together.

A restore is therefore a filesystem-level restore:
- stop the container
- replace the mounted data directory with a previously captured archive
- start the container again

## Routes

### `GET /`

Main Actual web UI.

### `GET /health`

Liveness endpoint exposed by the sync server health-check script.

## Environment

Common:
- `ACTUAL_PORT`
- `ACTUAL_DATA_DIR`

Backup:
- `ACTUAL_BACKUP_BUCKET`
- `ACTUAL_BACKUP_PREFIX`
- `ACTUAL_BACKUP_INTERVAL_SECONDS`

`ACTUAL_BACKUP_BUCKET` accepts either:
- a bare bucket name such as `props-betting-actual-backups`
- a `gs://` URI such as `gs://props-betting-actual-backups/actual-prod`

Authentication for backup uploads is handled by standard Google Cloud client
credential discovery, for example:
- workload identity on the runtime host
- `GOOGLE_APPLICATION_CREDENTIALS`

GitHub Actions image publishing can also be pointed at a non-default Workload
Identity provider with repository variables:
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_WORKLOAD_IDENTITY_POOL`

If no override is supplied, the workflow assumes pool `github` and a provider
id equal to the repository name.

## Backup Model

Backups are best-effort runtime exports of `/data` to GCS as timestamped
`.tar.gz` archives.

Current behavior:
- periodic uploads default to once per hour
- setting `ACTUAL_BACKUP_INTERVAL_SECONDS=0` disables periodic uploads
- a final upload still runs on clean shutdown when backups are enabled
- retention is owned by bucket lifecycle policy, not by the app

## Deployment Model

- Source control follows `dev`, `staging`, `master`
- Root `version` is the image version source of truth
- Merges into `staging` publish `<version>.dev0`
- Merges into `master` publish `<version>`
- `.github/workflows/deploy-artifact-registry.yml` builds release artifacts and
  publishes the Docker image from `Dockerfile.prebuilt`
- This repository publishes and defines the runtime image contract
- Runtime deployment is expected to be owned by infra outside the repo
- The only hard runtime requirement is a persistent `/data` mount
