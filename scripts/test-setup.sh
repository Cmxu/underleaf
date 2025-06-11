#!/bin/bash

# Underleaf Setup Test Script

set -e

echo "🧪 Testing Underleaf Container Setup"
echo "===================================="

# Check if Docker is running
echo "🐳 Checking Docker..."
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi
echo "✅ Docker is running"

# Check if docker-compose is available
echo "🔧 Checking docker-compose..."
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed. Please install it and try again."
    exit 1
fi
echo "✅ docker-compose is available"

# Check if network exists
echo "🌐 Checking Docker network..."
if docker network ls | grep -q "underleaf_web"; then
    echo "✅ underleaf_web network exists"
else
    echo "⚠️  underleaf_web network not found, will be created during setup"
fi

# Check if base image exists
echo "🏗️  Checking LaTeX base image..."
if docker images | grep -q "underleaf-latex"; then
    echo "✅ underleaf-latex image exists"
else
    echo "⚠️  underleaf-latex image not found, will be built during setup"
fi

# Test infrastructure services
echo "📋 Checking infrastructure services..."
if docker-compose ps | grep -q "Up"; then
    echo "✅ Some services are running"
    docker-compose ps
else
    echo "⚠️  No services currently running"
fi

# Check if ports are available
echo "🔌 Checking port availability..."
if lsof -i :80 > /dev/null 2>&1; then
    echo "⚠️  Port 80 is in use"
    lsof -i :80
else
    echo "✅ Port 80 is available"
fi

if lsof -i :8080 > /dev/null 2>&1; then
    echo "⚠️  Port 8080 is in use"
    lsof -i :8080
else
    echo "✅ Port 8080 is available"
fi

# Check file permissions
echo "📁 Checking file permissions..."
if [ -x "./scripts/setup-containers.sh" ]; then
    echo "✅ setup-containers.sh is executable"
else
    echo "⚠️  setup-containers.sh is not executable, fixing..."
    chmod +x ./scripts/setup-containers.sh
fi

if [ -x "./scripts/monitor-containers.sh" ]; then
    echo "✅ monitor-containers.sh is executable"
else
    echo "⚠️  monitor-containers.sh is not executable, fixing..."
    chmod +x ./scripts/monitor-containers.sh
fi

echo ""
echo "🎯 Test Summary:"
echo "================"
echo "✅ Docker is ready"
echo "✅ Scripts are executable"
echo "✅ Setup can proceed"
echo ""
echo "🚀 Next steps:"
echo "   1. Run: ./scripts/setup-containers.sh"
echo "   2. Wait for services to start"
echo "   3. Visit: http://localhost"
echo "   4. Monitor: ./scripts/monitor-containers.sh" 