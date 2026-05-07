#!/bin/bash

echo "🚀 Starting batched deployment..."

# Función para ejecutar docker compose con tus parámetros
deploy_batch() {
    local services="$1"
    echo "📦 Deploying: $services"
    docker compose up -d --build --force-recreate --no-deps $services
}

# Función para limpiar imágenes
cleanup_images() {
    echo "🧹 Cleaning up Docker images..."
    docker image prune -af --filter "until=24h"
    dangling_images=$(docker image ls -q -f "dangling=true")
    if [ ! -z "$dangling_images" ]; then
        echo "$dangling_images" | xargs docker rmi
    else
        echo "No dangling images to remove"
    fi
}

# Batch 1: Infrastructure
echo "📦 Deploying Batch 1: Infrastructure"
deploy_batch "prisma-migrate init"
echo "⏳ Waiting for infrastructure to be ready..."
sleep 10

# Batch 2: First services
echo "📦 Deploying Batch 2: First Services"
deploy_batch "api mqtt-core"
echo "⏳ Waiting for first services to be ready..."
sleep 10

# Batch 3: Last services
echo "📦 Deploying Batch 3: Last Services"
deploy_batch "rules-engine ai-service integrations"

# Limpiar imágenes al final
cleanup_images

echo "✅ All services deployed successfully!"
docker compose ps