#!/bin/bash

# Force Recreate All Containers Script
# Use this after updating the LaTeX image to ensure all containers use the new image

set -e

echo "🔄 Force recreating all Underleaf user containers..."

# Check if backend is running
if ! docker ps --format "{{.Names}}" | grep -q "underleaf-backend"; then
    echo "❌ Backend container is not running. Please start the backend first:"
    echo "   docker-compose up -d backend"
    exit 1
fi

echo "📋 Current containers that will be recreated:"
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" | grep underleaf-user || echo "No user containers found"

echo ""
echo "⚠️  This will stop and remove all user containers."
echo "   Repository data will be preserved in volumes."
echo "   New containers will be created with the updated image on next use."
echo ""

read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Operation cancelled"
    exit 1
fi

echo "🔄 Stopping and removing all user containers..."

# Stop and remove all user containers
docker ps --format "{{.Names}}" | grep underleaf-user | xargs -r docker stop
docker ps -a --format "{{.Names}}" | grep underleaf-user | xargs -r docker rm

echo "✅ All user containers have been removed."
echo ""
echo "💡 New containers will be created automatically when users access repositories."
echo "   They will use the updated LaTeX image with MCP server support."
echo ""
echo "🔍 You can monitor container creation with:"
echo "   docker-compose logs -f backend" 