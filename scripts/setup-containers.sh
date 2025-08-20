#!/bin/bash

# Underleaf Multi-Container Setup Script

set -e

echo "🚀 Setting up Underleaf multi-container infrastructure..."

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p repos
mkdir -p docker/traefik/data

# Create network if it doesn't exist
echo "🌐 Creating Docker network..."
docker network create underleaf_web 2>/dev/null || echo "Network already exists"

# Build the LaTeX base image
echo "🏗️  Building LaTeX base image..."
docker-compose build latex-base

# Start the infrastructure
echo "🔄 Starting services..."
docker-compose up -d traefik backend frontend

echo "✅ Infrastructure setup complete!"
echo ""
echo "📋 Service URLs:"
echo "   Frontend: http://localhost"
echo "   Backend API: http://localhost/api"
echo "   Traefik Dashboard: http://localhost:8080"
echo ""
echo "🐳 Container Management:"
echo "   View containers: docker-compose ps"
echo "   View logs: docker-compose logs -f [service]"
echo "   Stop services: docker-compose down"
echo ""
echo "🔧 User containers and repository volumes will be created automatically."
echo ""
echo "💡 Architecture Features:"
echo "   • Each repository gets its own persistent shared volume"
echo "   • Multiple users can collaborate on the same repository"
echo "   • Containers are created per user-repository combination"
echo "   • Automatic cleanup of idle containers (volumes persist)"
echo "   • Uncommitted changes are preserved across sessions"
echo ""
echo "🔄 After updating the LaTeX image, you may need to recreate containers:"
echo "   ./scripts/force-recreate-containers.sh" 