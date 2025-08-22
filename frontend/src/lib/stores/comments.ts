import { writable } from 'svelte/store';

export interface Comment {
  id: string;
  fileName: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  selectedText: string;
  content: string;
  author: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommentStore {
  comments: Comment[];
  activeComment: Comment | null;
  lastSyncTime: Date | null;
  isLoading: boolean;
}

const initialState: CommentStore = {
  comments: [],
  activeComment: null,
  lastSyncTime: null,
  isLoading: false
};

export const commentsStore = writable<CommentStore>(initialState);

export const commentsService = {
  // Validate and normalize file path to ensure it's safe for backend access
  validateFilePath(filePath: string): boolean {
    if (!filePath || filePath.trim() === '') {
      return false;
    }
    
    // Normalize the path by removing /workdir/ prefix if present (from AI comments)
    let normalizedPath = filePath.trim();
    if (normalizedPath.startsWith('/workdir/')) {
      normalizedPath = normalizedPath.substring('/workdir/'.length);
    }
    
    // Check if normalized path is safe (no directory traversal, no absolute paths)
    const isValid = Boolean(normalizedPath && 
           !normalizedPath.includes('..') && 
           !normalizedPath.startsWith('/') && 
           !normalizedPath.startsWith('./'));
    
    if (!isValid) {
      console.warn(`🚫 Invalid file path detected: "${filePath}" (normalized: "${normalizedPath}")`);
    }
    
    return isValid;
  },

  // Normalize file path by removing /workdir/ prefix if present
  normalizeFilePath(filePath: string): string {
    if (!filePath) return filePath;
    
    if (filePath.startsWith('/workdir/')) {
      return filePath.substring('/workdir/'.length);
    }
    
    return filePath;
  },

  // Add a new comment (saves to backend immediately)
  async addComment(repoName: string, comment: Omit<Comment, 'id' | 'createdAt' | 'updatedAt'>, userId: string = 'anonymous') {
    // Validate file path before adding comment
    if (!this.validateFilePath(comment.fileName)) {
      console.error('Invalid file path for comment:', comment.fileName);
      throw new Error('Invalid file path. File path must be relative and not contain directory traversal.');
    }

    const newComment: Comment = {
      ...comment,
      fileName: this.normalizeFilePath(comment.fileName),
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Add to local store optimistically
    commentsStore.update(state => ({
      ...state,
      comments: [...state.comments, newComment].sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    }));

    // Save to backend immediately
    try {
      await this.saveCommentsToBackend(repoName, userId);
      console.log('💾 Comment added and saved to backend:', newComment.id);
    } catch (error) {
      // Rollback on error
      commentsStore.update(state => ({
        ...state,
        comments: state.comments.filter(c => c.id !== newComment.id)
      }));
      console.error('Failed to save comment to backend:', error);
      throw error;
    }

    return newComment;
  },

  // Delete a comment (saves to backend immediately)
  async deleteComment(repoName: string, commentId: string, userId: string = 'anonymous') {
    // Store the comment for potential rollback
    let deletedComment: Comment | null = null;
    
    commentsStore.update(state => {
      deletedComment = state.comments.find(c => c.id === commentId) || null;
      return {
        ...state,
        comments: state.comments.filter(c => c.id !== commentId),
        activeComment: state.activeComment?.id === commentId ? null : state.activeComment
      };
    });

    // Save to backend immediately
    try {
      await this.saveCommentsToBackend(repoName, userId);
      console.log('🗑️ Comment deleted and saved to backend:', commentId);
    } catch (error) {
      // Rollback on error
      if (deletedComment) {
        commentsStore.update(state => ({
          ...state,
          comments: [...state.comments, deletedComment].sort((a, b) => 
            new Date(a.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        }));
      }
      console.error('Failed to delete comment from backend:', error);
      throw error;
    }
  },

  // Update a comment (saves to backend immediately)
  async updateComment(repoName: string, commentId: string, updates: Partial<Omit<Comment, 'id' | 'createdAt'>>, userId: string = 'anonymous') {
    // Store original comment for potential rollback
    let originalComment: Comment | null = null;
    
    commentsStore.update(state => {
      originalComment = state.comments.find(c => c.id === commentId) || null;
      return {
        ...state,
        comments: state.comments.map(c => 
          c.id === commentId 
            ? { ...c, ...updates, updatedAt: new Date() }
            : c
        )
      };
    });

    // Save to backend immediately
    try {
      await this.saveCommentsToBackend(repoName, userId);
      console.log('✏️ Comment updated and saved to backend:', commentId);
    } catch (error) {
      // Rollback on error
      if (originalComment) {
        commentsStore.update(state => ({
          ...state,
          comments: state.comments.map(c => 
            c.id === commentId ? originalComment : c
          )
        }));
      }
      console.error('Failed to update comment in backend:', error);
      throw error;
    }
  },

  // Set active comment (for navigation)
  setActiveComment(comment: Comment | null) {
    commentsStore.update(state => ({
      ...state,
      activeComment: comment
    }));
  },

  // Get comments for a specific file
  getCommentsForFile(fileName: string): Comment[] {
    let comments: Comment[] = [];
    commentsStore.subscribe(state => {
      comments = state.comments.filter(c => c.fileName === fileName);
    })();
    return comments;
  },

  // Clear all comments
  clearComments() {
    commentsStore.set(initialState);
  },

  // Load comments from backend when repository loads
  async loadComments(repoName: string, userId: string = 'anonymous') {
    commentsStore.update(state => ({ ...state, isLoading: true }));
    
    try {
      const response = await fetch(`/api/comments/${userId}/${repoName}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      const comments = result.comments || [];
      
      // Filter out comments with invalid file paths and normalize paths
      const validComments = comments
        .filter((c: any) => this.validateFilePath(c.fileName))
        .map((c: any) => ({
          ...c,
          fileName: this.normalizeFilePath(c.fileName)
        }));
      
      if (validComments.length !== comments.length) {
        console.warn(`Filtered out ${comments.length - validComments.length} comments with invalid file paths from backend`);
      }
      
      const parsedComments = validComments.map((c: any) => ({
        ...c,
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt)
      }));

      commentsStore.update(state => ({
        ...state,
        comments: parsedComments.sort((a: Comment, b: Comment) =>
          new Date(a.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
        lastSyncTime: new Date(),
        isLoading: false
      }));

      console.log('📥 Loaded comments from backend:', parsedComments.length);
      return parsedComments;
    } catch (error) {
      console.error('Failed to load comments from backend:', error);
      commentsStore.update(state => ({ ...state, isLoading: false }));
      return [];
    }
  },

  // Save all current comments to backend
  async saveCommentsToBackend(repoName: string, userId: string = 'anonymous') {
    let currentComments: Comment[] = [];
    commentsStore.subscribe(state => {
      currentComments = state.comments;
    })();
    
    try {
      const response = await fetch(`/api/comments/${userId}/${repoName}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ comments: currentComments }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('📝 Comments synced to backend:', result);
      
      // Update sync time
      commentsStore.update(state => ({
        ...state,
        lastSyncTime: new Date()
      }));
      
      return result;
    } catch (error) {
      console.error('Failed to sync comments to backend:', error);
      throw error;
    }
  },

  // Refresh comments from backend (for AI comment detection)
  async refreshComments(repoName: string, userId: string = 'anonymous') {
    console.log('🔄 Refreshing comments from backend');
    
    commentsStore.update(state => ({ ...state, isLoading: true }));
    
    try {
      const comments = await this.loadComments(repoName, userId);
      console.log(`📥 Refreshed ${comments.length} comments from backend`);
      return comments;
    } catch (error) {
      console.error('Failed to refresh comments:', error);
      commentsStore.update(state => ({ ...state, isLoading: false }));
      return [];
    }
  },

  // Initialize comments when repository loads
  async initializeSync(repoName: string, userId: string = 'anonymous') {
    console.log('🔄 Initializing comments for repository:', repoName);
    
    try {
      await this.loadComments(repoName, userId);
    } catch (error) {
      console.warn('Initial comments load error:', error);
    }
  },

  // Cleanup sync resources
  cleanupSync() {
    commentsStore.update(state => ({
      ...state,
      isLoading: false
    }));
    
    console.log('⏹️ Cleaned up comment sync');
  },

  // Trigger refresh from external components (e.g., AI chat)
  async triggerRefresh(repoName: string, userId: string = 'anonymous') {
    console.log('🔄 External refresh triggered for comments');
    
    try {
      const comments = await this.refreshComments(repoName, userId);
      return comments;
    } catch (error) {
      console.error('Failed to trigger refresh:', error);
      throw error;
    }
  },

  // Update comment positions when text changes occur
  async updateCommentPositions(repoName: string, filePath: string, changes: Array<{
    start_line: number;
    start_column: number;
    end_line: number;
    end_column: number;
    lines_added: number;
    lines_content?: string[];
  }>, userId: string = 'anonymous') {
    console.log('📍 Updating comment positions for file:', filePath, 'with', changes.length, 'changes');
    
    try {
      const response = await fetch(`/api/comments/${userId}/${repoName}/update-positions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          file_path: filePath, 
          changes 
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('📍 Comment positions updated:', result);
      
      // Refresh comments from backend to get updated positions
      await this.loadComments(repoName, userId);
      
      return result;
    } catch (error) {
      console.error('Failed to update comment positions:', error);
      throw error;
    }
  }
}; 