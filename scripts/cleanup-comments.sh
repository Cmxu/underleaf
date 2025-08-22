#!/bin/bash

# Underleaf Comments Cleanup Script
# This script specifically targets comment data and related persistence

set -e

echo "🧹 Underleaf Comments Cleanup Script"
echo "===================================="
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

print_step "Comments Cleanup - Phase 1: Container and Volume Cleanup"
echo "Running standard cleanup first..."
./scripts/cleanup.sh

print_step "Comments Cleanup - Phase 2: Comment Data Cleanup"
echo "Looking for any remaining comment data..."

# Check for any .underleaf directories in the repos folder
REPO_DIR="/Users/cmxu/Projects/underleaf/repos"
if [ -d "$REPO_DIR" ]; then
    print_info "Found repos directory, checking for .underleaf folders..."
    
    # Find all .underleaf directories
    UNDERLEAF_DIRS=$(find "$REPO_DIR" -name ".underleaf" -type d 2>/dev/null || true)
    
    if [ -n "$UNDERLEAF_DIRS" ]; then
        print_warning "Found .underleaf directories:"
        echo "$UNDERLEAF_DIRS"
        echo ""
        echo "Removing .underleaf directories and their contents..."
        find "$REPO_DIR" -name ".underleaf" -type d -exec rm -rf {} + 2>/dev/null || true
        print_success "Removed .underleaf directories"
    else
        print_info "No .underleaf directories found in repos"
    fi
else
    print_info "No repos directory found"
fi

print_step "Comments Cleanup - Phase 3: Docker System Cleanup"
echo "Performing additional Docker cleanup..."

# Remove any dangling images related to underleaf
DANGLING_IMAGES=$(docker images -f "dangling=true" -q 2>/dev/null || true)
if [ -n "$DANGLING_IMAGES" ]; then
    print_info "Found $(echo $DANGLING_IMAGES | wc -w | tr -d ' ') dangling images"
    echo "Removing dangling images..."
    docker rmi $DANGLING_IMAGES 2>/dev/null || true
    print_success "Removed dangling images"
else
    print_info "No dangling images found"
fi

# Be more careful about network cleanup - only remove truly unused networks
print_info "Checking for unused networks..."
UNUSED_NETWORKS=$(docker network ls --filter "type=custom" --format "{{.Name}}" | grep -E "(underleaf|web)" 2>/dev/null || true)

if [ -n "$UNUSED_NETWORKS" ]; then
    print_info "Found networks: $UNUSED_NETWORKS"
    echo "Checking which networks are actually unused..."
    
    for network in $UNUSED_NETWORKS; do
        # Check if network has any containers
        CONTAINERS_IN_NETWORK=$(docker network inspect "$network" --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null || echo "")
        
        if [ -z "$CONTAINERS_IN_NETWORK" ] || [ "$CONTAINERS_IN_NETWORK" = " " ]; then
            print_info "Network $network is unused, removing..."
            docker network rm "$network" 2>/dev/null || true
            print_success "Removed unused network: $network"
        else
            print_warning "Network $network is still in use by containers: $CONTAINERS_IN_NETWORK"
            print_info "Keeping network $network (it will be recreated by docker-compose if needed)"
        fi
    done
else
    print_info "No custom networks found to clean up"
fi

print_step "Comments Cleanup - Phase 4: Frontend Data Cleanup Instructions"
echo ""
echo "🚨 IMPORTANT: Browser localStorage cleanup required!"
echo "================================================"
echo ""
echo "The cleanup script has removed all backend comment data, but comments may still"
echo "persist in your browser's localStorage. To completely clear all comments, you need to:"
echo ""
echo "1. Open your browser's Developer Tools (F12 or Cmd+Option+I)"
echo "2. Go to the Application/Storage tab"
echo "3. Find 'Local Storage' in the left sidebar"
echo "4. Look for entries starting with 'comments_' (e.g., 'comments_68449b4ab591271912f2d224')"
echo "5. Delete these entries or clear all localStorage for the domain"
echo ""
echo "Alternatively, you can run this JavaScript in the browser console:"
echo ""
echo "  // Clear all comment-related localStorage entries"
echo "  Object.keys(localStorage).forEach(key => {"
echo "    if (key.startsWith('comments_')) {"
echo "      localStorage.removeItem(key);"
echo "      console.log('Removed:', key);"
echo "    }"
echo "  });"
echo ""
echo "  // Clear all localStorage for complete reset"
echo "  localStorage.clear();"
echo "  console.log('All localStorage cleared');"
echo ""

print_step "Comments Cleanup - Phase 5: Final Verification"
echo "Verifying cleanup completion..."

# Check for any remaining underleaf resources
REMAINING_CONTAINERS=$(docker ps -aq --filter "label=underleaf.type" 2>/dev/null | wc -l | tr -d ' ')
REMAINING_VOLUMES=$(docker volume ls -q --filter "name=underleaf" 2>/dev/null | wc -l | tr -d ' ')
REMAINING_NAMED_CONTAINERS=$(docker ps -aq --filter "name=underleaf" 2>/dev/null | wc -l | tr -d ' ')

# Check for any remaining .underleaf directories
REMAINING_UNDERLEAF=$(find "$REPO_DIR" -name ".underleaf" -type d 2>/dev/null | wc -l | tr -d ' ' 2>/dev/null || echo "0")

if [ "$REMAINING_CONTAINERS" -eq 0 ] && [ "$REMAINING_VOLUMES" -eq 0 ] && [ "$REMAINING_NAMED_CONTAINERS" -eq 0 ] && [ "$REMAINING_UNDERLEAF" -eq 0 ]; then
    print_success "Backend cleanup completed successfully!"
    echo ""
    echo "🎉 All backend comment data has been removed"
    echo "💡 Backend is now in a completely fresh state"
    echo "🚨 WARNING: All backend comments, settings, and user data have been permanently deleted"
    echo ""
    echo "⚠️  REMEMBER: You must also clear browser localStorage to remove frontend comment data!"
    echo "🌐 Note: Essential networks (underleaf_web, web) will be recreated automatically"
else
    print_error "Backend cleanup incomplete. Remaining:"
    echo "  - $REMAINING_CONTAINERS labeled containers"
    echo "  - $REMAINING_VOLUMES volumes"
    echo "  - $REMAINING_NAMED_CONTAINERS named containers"
    echo "  - $REMAINING_UNDERLEAF .underleaf directories"
    exit 1
fi

echo ""
echo "🚀 Backend ready for testing with a completely fresh environment!"
echo "📝 All previous backend comments and user data have been cleared"
echo "🌐 Don't forget to clear browser localStorage for complete cleanup!"
