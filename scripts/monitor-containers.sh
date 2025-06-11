#!/bin/bash

# Underleaf Container Monitoring Script

echo "🐳 Underleaf Container Status"
echo "=============================="

# Show main infrastructure containers
echo ""
echo "📋 Infrastructure Services:"
docker-compose ps

# Show user containers
echo ""
echo "👥 User Containers:"
docker ps --filter "label=underleaf.type=latex" --format "table {{.Names}}\t{{.Status}}\t{{.CreatedAt}}\t{{.Labels}}"

# Show repository volumes
echo ""
echo "💾 Repository Volumes:"
docker volume ls --filter "label=underleaf.type=repository" --format "table {{.Name}}\t{{.Driver}}\t{{.Labels}}"

# Show container stats
echo ""
echo "📊 Container Resource Usage:"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" $(docker ps -q --filter "label=underleaf.type=latex")

# Show network information
echo ""
echo "🌐 Network Information:"
docker network ls | grep underleaf

echo ""
echo "🔧 Management Commands:"
echo "   View logs: docker-compose logs -f [service]"
echo "   Restart service: docker-compose restart [service]"
echo "   Container stats: curl http://localhost/api/containers/stats"
echo "   Repository info: curl http://localhost/api/repositories/[repo]/containers"
echo "   View Traefik dashboard: http://localhost:8080" 