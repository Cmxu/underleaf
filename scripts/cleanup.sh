#!/bin/bash

# Underleaf Cleanup Script
# This script stops and removes all Underleaf containers and volumes

set -e

echo "🧹 Underleaf Cleanup Script"
echo "========================="
echo ""

# Function to print colored output
print_step() {
    echo -e "\033[1;34m=== $1 ===\033[0m"
}

print_success() {
    echo -e "\033[1;32m✅ $1\033[0m"
}

print_warning() {
    echo -e "\033[1;33m⚠️  $1\033[0m"
}

print_error() {
    echo -e "\033[1;31m❌ $1\033[0m"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

print_step "Stopping all Underleaf containers"
RUNNING_CONTAINERS=$(docker ps -q --filter "label=underleaf.type" 2>/dev/null)
if [ -n "$RUNNING_CONTAINERS" ]; then
    echo "Stopping containers: $RUNNING_CONTAINERS"
    docker stop $RUNNING_CONTAINERS
    print_success "Stopped $(echo $RUNNING_CONTAINERS | wc -w | tr -d ' ') containers"
else
    print_warning "No running Underleaf containers found"
fi

print_step "Removing all Underleaf containers"
ALL_CONTAINERS=$(docker ps -aq --filter "label=underleaf.type" 2>/dev/null)
if [ -n "$ALL_CONTAINERS" ]; then
    echo "Removing containers: $ALL_CONTAINERS"
    docker rm $ALL_CONTAINERS
    print_success "Removed $(echo $ALL_CONTAINERS | wc -w | tr -d ' ') containers"
else
    print_warning "No Underleaf containers found"
fi

print_step "Removing all Underleaf volumes"
VOLUMES=$(docker volume ls -q --filter "name=underleaf" 2>/dev/null)
if [ -n "$VOLUMES" ]; then
    echo "Removing volumes: $VOLUMES"
    docker volume rm $VOLUMES
    print_success "Removed $(echo $VOLUMES | wc -w | tr -d ' ') volumes"
else
    print_warning "No Underleaf volumes found"
fi

print_step "Cleaning up old repository directories"
REPO_DIR="/Users/cmxu/Projects/underleaf/repos"
if [ -d "$REPO_DIR" ]; then
    rm -rf "$REPO_DIR"
    print_success "Removed old repository directory"
else
    print_warning "No old repository directory found"
fi

print_step "Verification"
REMAINING_CONTAINERS=$(docker ps -aq --filter "label=underleaf.type" 2>/dev/null | wc -l | tr -d ' ')
REMAINING_VOLUMES=$(docker volume ls -q --filter "name=underleaf" 2>/dev/null | wc -l | tr -d ' ')

if [ "$REMAINING_CONTAINERS" -eq 0 ] && [ "$REMAINING_VOLUMES" -eq 0 ]; then
    print_success "Cleanup completed successfully!"
    echo ""
    echo "🎉 System is now in a fresh state"
    echo "💡 You may also want to clear browser localStorage for a complete fresh start"
else
    print_error "Cleanup incomplete. Remaining: $REMAINING_CONTAINERS containers, $REMAINING_VOLUMES volumes"
    exit 1
fi

echo ""
echo "🚀 Ready for testing with a fresh environment!"