# FreeMeeting Docker Deployment Guide

## 1. Prerequisites

- Docker Engine (20.10+)
- Docker Compose (2.0+)
- Git

## 2. Configuration

Create a `.env` file in the root directory based on the example:

```env
PORT=5002
AGORA_APP_ID=your_agora_app_id
AGORA_APP_CERTIFICATE=your_agora_certificate
MEETING_PASSWORD=optional_meeting_password
NODE_ENV=production
```

## 3. Build and Run

### Manual Build
```bash
./scripts/build.sh
```

### Run with Docker Compose
```bash
docker-compose up -d
```

## 4. Automation Scripts

### `scripts/build.sh`
- Builds the Docker image.
- Tags it with the current timestamp and `latest`.
- (Optional) Pushes to a container registry.

### `scripts/deploy.sh`
- Checks if a container is running.
- Pulls/Rebuilds the image.
- Deploys the new container.
- Performs a health check (waiting for HTTP 200 on `/api/rooms`).
- Exits with 0 on success, 1 on failure.

## 5. Rollback Strategy

If a deployment fails or a bug is discovered, rollback to the previous image tag.

**Step 1: Identify previous tag**
```bash
docker images freemeeting
# Example output:
# freemeeting  20231027_100000  ...
# freemeeting  20231026_090000  ...
```

**Step 2: Update `docker-compose.yml` or run manually**
Edit `docker-compose.yml` to use the specific tag instead of `latest`, or:

```bash
# Stop current
docker-compose down

# Run previous version
IMAGE_TAG=20231026_090000 docker-compose up -d
```

## 6. Logging and Monitoring

### Logs
Docker Compose is configured to use the `json-file` driver with rotation (10MB max size, 3 files).

View logs:
```bash
docker-compose logs -f --tail=100
```

### Persistence
Data is stored in the `./data` directory on the host machine, mounted to `/app/data` in the container.
- `audit_logs.json`: Role change logs.
- `roles.json`: Role configuration.

Backup this directory regularly.
