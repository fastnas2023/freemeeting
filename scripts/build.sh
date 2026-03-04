#!/bin/bash
set -e

# Configuration
IMAGE_NAME="freemeeting"
TAG=$(date +%Y%m%d_%H%M%S)
REGISTRY="your-registry.example.com" # Replace with your registry

echo "Building Docker image..."
docker build -t $IMAGE_NAME:$TAG -t $IMAGE_NAME:latest .

# Optional: Push to registry
# echo "Pushing to registry..."
# docker tag $IMAGE_NAME:$TAG $REGISTRY/$IMAGE_NAME:$TAG
# docker tag $IMAGE_NAME:latest $REGISTRY/$IMAGE_NAME:latest
# docker push $REGISTRY/$IMAGE_NAME:$TAG
# docker push $REGISTRY/$IMAGE_NAME:latest

echo "Build complete. Image: $IMAGE_NAME:$TAG"
