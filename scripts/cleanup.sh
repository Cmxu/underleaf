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

print_info() {
    echo -e "\033[1;36mℹ️  $1\033[0m"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

print_step "Pre-cleanup status check"
echo "Checking for existing Underleaf containers and volumes..."
ALL_CONTAINERS=$(docker ps -aq --filter "label=underleaf.type" 2>/dev/null)
RUNNING_CONTAINERS=$(docker ps -q --filter "label=underleaf.type" 2>/dev/null)
ALL_VOLUMES=$(docker volume ls -q --filter "name=underleaf" 2>/dev/null)

if [ -n "$ALL_CONTAINERS" ]; then
    print_info "Found $(echo $ALL_CONTAINERS | wc -w | tr -d ' ') total containers"
    if [ -n "$RUNNING_CONTAINERS" ]; then
        print_info "Found $(echo $RUNNING_CONTAINERS | wc -w | tr -d ' ') running containers"
    fi
else
    print_warning "No Underleaf containers found"
fi

if [ -n "$ALL_VOLUMES" ]; then
    print_info "Found $(echo $ALL_VOLUMES | wc -w | tr -d ' ') volumes"
else
    print_warning "No Underleaf volumes found"
fi

echo ""

print_step "Stopping all Underleaf containers"
if [ -n "$RUNNING_CONTAINERS" ]; then
    echo "Stopping containers: $RUNNING_CONTAINERS"
    docker stop $RUNNING_CONTAINERS
    print_success "Stopped $(echo $RUNNING_CONTAINERS | wc -w | tr -d ' ') containers"
else
    print_warning "No running Underleaf containers found"
fi

print_step "Removing all Underleaf containers"
if [ -n "$ALL_CONTAINERS" ]; then
    echo "Removing containers: $ALL_CONTAINERS"
    docker rm $ALL_CONTAINERS
    print_success "Removed $(echo $ALL_CONTAINERS | wc -w | tr -d ' ') containers"
else
    print_warning "No Underleaf containers found"
fi

print_step "Removing all Underleaf volumes"
if [ -n "$ALL_VOLUMES" ]; then
    echo "Removing volumes: $ALL_VOLUMES"
    docker volume rm $ALL_VOLUMES
    print_success "Removed $(echo $ALL_VOLUMES | wc -w | tr -d ' ') volumes"
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

print_step "Additional cleanup - checking for any remaining Underleaf resources"
# Check for any containers that might have been missed
REMAINING_CONTAINERS=$(docker ps -aq --filter "label=underleaf.type" 2>/dev/null)
REMAINING_VOLUMES=$(docker volume ls -q --filter "name=underleaf" 2>/dev/null)

# Also check for containers with underleaf in the name as a fallback
FALLBACK_CONTAINERS=$(docker ps -aq --filter "name=underleaf" 2>/dev/null)

if [ -n "$REMAINING_CONTAINERS" ]; then
    print_warning "Found remaining containers with underleaf.type label: $REMAINING_CONTAINERS"
    echo "Force removing remaining containers..."
    docker rm -f $REMAINING_CONTAINERS
    print_success "Force removed remaining containers"
fi

if [ -n "$FALLBACK_CONTAINERS" ]; then
    print_warning "Found containers with 'underleaf' in name: $FALLBACK_CONTAINERS"
    echo "Force removing fallback containers..."
    docker rm -f $FALLBACK_CONTAINERS
    print_success "Force removed fallback containers"
fi

if [ -n "$REMAINING_VOLUMES" ]; then
    print_warning "Found remaining volumes: $REMAINING_VOLUMES"
    echo "Force removing remaining volumes..."
    docker volume rm -f $REMAINING_VOLUMES
    print_success "Force removed remaining volumes"
fi



print_step "Final verification"
FINAL_CONTAINERS=$(docker ps -aq --filter "label=underleaf.type" 2>/dev/null | wc -l | tr -d ' ')
FINAL_VOLUMES=$(docker volume ls -q --filter "name=underleaf" 2>/dev/null | wc -l | tr -d ' ')
FINAL_NAMED_CONTAINERS=$(docker ps -aq --filter "name=underleaf" 2>/dev/null | wc -l | tr -d ' ')

if [ "$FINAL_CONTAINERS" -eq 0 ] && [ "$FINAL_VOLUMES" -eq 0 ] && [ "$FINAL_NAMED_CONTAINERS" -eq 0 ]; then
    print_success "Cleanup completed successfully!"
    echo ""
    echo "🎉 System is now in a fresh state"
    echo "💡 You may also want to clear browser localStorage for a complete fresh start"
    echo "🌐 Note: Essential networks (underleaf_web, web) will be recreated automatically"
else
    print_error "Cleanup incomplete. Remaining: $FINAL_CONTAINERS labeled containers, $FINAL_VOLUMES volumes, $FINAL_NAMED_CONTAINERS named containers"
    exit 1
fi

echo ""
echo "🚀 Ready for testing with a fresh environment!"