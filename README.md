# actual

Containerized Actual Budget application with local persistent storage and
optional GCS backups of the runtime data directory.

## Documentation

- `docs/ACTUAL_OPERATING_MODEL.md`: runtime architecture, persistence model,
  backup contract, environment variables, and deployment model.
- `SYNDICATE_WORKFLOW.md`: example workflow for using Actual to operate a
  betting syndicate.

## Repository Layout

- `Dockerfile`: production image for the Actual web client and sync server.
- `Dockerfile.prebuilt`: release-image path used after CI builds the browser and
  sync-server artifacts.
- `docker-compose.yml`: local production-style runtime with a mounted `./data`
  volume.
- `Dockerfile.dev`: development container image.
- `docker-compose.dev.yml`: development-only container workflow.
- `version`: release version source for staging/prod image publishing.
- `packages/sync-server/`: Actual sync server plus backup-aware runtime wrapper.
- `scripts/seed-syndicate-demo.mjs`: seed script for the betting syndicate demo
  budget.

## Quick Start

Copy the environment template:

```bash
cp .env.example .env
```

Build and run:

```bash
docker compose up --build
```

Open:

```text
http://localhost:5006
```

On first boot with an empty `./data` volume, the container also seeds the
`Betting Syndicate Demo` budget automatically.

## Local Configuration

Common:

- `ACTUAL_PORT`

Backup:

- `ACTUAL_BACKUP_BUCKET`
- `ACTUAL_BACKUP_PREFIX`
- `ACTUAL_BACKUP_INTERVAL_SECONDS`

If `ACTUAL_BACKUP_BUCKET` is unset, the app runs normally without object-storage
backups.

GitHub Actions deploy configuration:

- optional repository variable `GCP_WORKLOAD_IDENTITY_PROVIDER`
- optional repository variable `GCP_WORKLOAD_IDENTITY_POOL`

If `GCP_WORKLOAD_IDENTITY_PROVIDER` is unset, the deploy workflow defaults to a
provider id matching the repo name. For forked or newly provisioned repos, set
`GCP_WORKLOAD_IDENTITY_PROVIDER` explicitly if your GCP provider id differs.

## Release Workflow

- Work on `dev`.
- Promote by PR `dev -> staging`, then `staging -> master`.
- `version` is the release source of truth and follows
  `<upstream-version>-pb.<fork-revision>`, for example `26.5.2-pb.1`.
- Fork-only releases increment the `pb` revision; upstream rebases/reset bumps
  restart that suffix from `.1` on the new upstream version.
- Bump `version` before the release you want to publish.
- Merges into `staging` publish `<version>.dev0`; merges into `master` publish
  `<version>`.
- `.github/workflows/deploy-artifact-registry.yml` builds the repo artifacts,
  then publishes the Docker image from `Dockerfile.prebuilt`.
- This repo defines and publishes the image contract.
- Runtime deployment should be handled by infra outside the repo.
