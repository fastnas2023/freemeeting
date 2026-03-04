#!/bin/bash
set -e

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '#' | awk '/=/ {print $1}')
fi

echo "Deploying FreeMeeting..."

# 1. Pull latest image (if using registry)
# docker-compose pull

# 2. Check current container health (optional pre-check)
if [ "$(docker ps -q -f name=freemeeting-app)" ]; then
    echo "Current container is running. Proceeding with update."
else
    echo "No running container found. Starting fresh."
fi

# 3. Deploy new version (Recreate container)
docker-compose up -d --force-recreate --build

# 4. Wait for healthcheck
echo "Waiting for healthcheck..."
timeout=60
elapsed=0
while [ $elapsed -lt $timeout ]; do
    status=$(docker inspect --format='{{.State.Health.Status}}' freemeeting-app 2>/dev/null || echo "starting")
    if [ "$status" == "healthy" ]; then
        echo "Deployment successful! Service is healthy."
        exit 0
    fi
    sleep 2
    elapsed=$((elapsed+2))
    echo -n "."
done

echo ""
echo "Deployment failed: Healthcheck timed out."
# Optional: Rollback logic here
# ./scripts/rollback.sh
exit 1
