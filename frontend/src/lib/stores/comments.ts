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
  isPolling: boolean;
}

const initialState: CommentStore = {
  comments: [],
  activeComment: null,
  lastSyncTime: null,
  isPolling: false
};

export const commentsStore = writable<CommentStore>(initialState);

// Polling interval (in milliseconds) - check for new comments every 2 seconds
const POLL_INTERVAL = 2000;
let pollIntervalId: NodeJS.Timeout | null = null;

export const commentsService = {
  // Validate file path to ensure it's safe for backend access
  validateFilePath(filePath: string): boolean {
    // Check if file path is safe (no directory traversal, no absolute paths)
    const isValid = Boolean(filePath && 
           !filePath.includes('..') && 
           !filePath.startsWith('/') && 
           !filePath.startsWith('./') &&
           filePath.trim() !== '');
    
    if (!isValid && filePath) {
      console.warn(`🚫 Invalid file path detected: "${filePath}"`);
    }
    
    return isValid;
  },

  // Add a new comment
  addComment(comment: Omit<Comment, 'id' | 'createdAt' | 'updatedAt'>) {
    // Validate file path before adding comment
    if (!this.validateFilePath(comment.fileName)) {
      console.error('Invalid file path for comment:', comment.fileName);
      throw new Error('Invalid file path. File path must be relative and not contain directory traversal.');
    }

    const newComment: Comment = {
      ...comment,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    commentsStore.update(state => ({
      ...state,
      comments: [...state.comments, newComment].sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    }));

    return newComment;
  },

  // Delete a comment
  deleteComment(commentId: string) {
    commentsStore.update(state => ({
      ...state,
      comments: state.comments.filter(c => c.id !== commentId),
      activeComment: state.activeComment?.id === commentId ? null : state.activeComment
    }));
  },

  // Update a comment
  updateComment(commentId: string, updates: Partial<Omit<Comment, 'id' | 'createdAt'>>) {
    commentsStore.update(state => ({
      ...state,
      comments: state.comments.map(c => 
        c.id === commentId 
          ? { ...c, ...updates, updatedAt: new Date() }
          : c
      )
    }));
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

  // Get all comments with valid file paths only
  getValidComments(): Comment[] {
    let comments: Comment[] = [];
    commentsStore.subscribe(state => {
      comments = state.comments.filter(c => this.validateFilePath(c.fileName));
    })();
    return comments;
  },

  // Get comments with invalid file paths (for debugging)
  getInvalidComments(): Comment[] {
    let comments: Comment[] = [];
    commentsStore.subscribe(state => {
      comments = state.comments.filter(c => !this.validateFilePath(c.fileName));
    })();
    return comments;
  },

  // Clean up invalid comments (remove comments with invalid file paths)
  cleanupInvalidComments() {
    commentsStore.update(state => {
      const validComments = state.comments.filter(c => this.validateFilePath(c.fileName));
      const removedCount = state.comments.length - validComments.length;
      
      if (removedCount > 0) {
        console.warn(`🧹 Cleaned up ${removedCount} comments with invalid file paths`);
      }
      
      return {
        ...state,
        comments: validComments
      };
    });
  },

  // Clean up and save comments (useful for manual cleanup)
  cleanupAndSaveComments(repoName: string) {
    this.cleanupInvalidComments();
    this.saveComments(repoName);
  },

  // Clear all comments
  clearComments() {
    commentsStore.set(initialState);
  },

  // Load comments from localStorage or backend
  loadComments(repoName: string) {
    try {
      const saved = localStorage.getItem(`comments_${repoName}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Filter out comments with invalid file paths
        const validComments = parsed.filter((c: any) => this.validateFilePath(c.fileName));
        
        if (validComments.length !== parsed.length) {
          console.warn(`Filtered out ${parsed.length - validComments.length} comments with invalid file paths`);
        }
        
        const comments = validComments.map((c: any) => ({
          ...c,
          createdAt: new Date(c.createdAt),
          updatedAt: new Date(c.updatedAt)
        }));
        
        commentsStore.update(state => ({
          ...state,
          comments: comments.sort((a: Comment, b: Comment) => 
            new Date(a.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        }));

        // Clean up any remaining invalid comments
        this.cleanupInvalidComments();
      }
    } catch (error) {
      console.error('Failed to load comments:', error);
    }
  },

  // Save comments to localStorage
  saveComments(repoName: string) {
    let currentComments: Comment[] = [];
    commentsStore.subscribe(state => {
      currentComments = state.comments;
    })();
    
    try {
      localStorage.setItem(`comments_${repoName}`, JSON.stringify(currentComments));
      
      // Also sync to backend for AI access
      this.syncCommentsToBackend(repoName, currentComments).catch(error => {
        console.warn('Failed to sync comments to backend:', error);
      });
    } catch (error) {
      console.error('Failed to save comments:', error);
    }
  },

  // Sync comments to backend for AI access
  async syncCommentsToBackend(repoName: string, comments: Comment[]) {
    try {
      // Get current user ID (this should match how it's done elsewhere in the app)
      const userId = 'anonymous'; // TODO: Get actual user ID from auth store
      
      const response = await fetch(`/api/comments/${userId}/${repoName}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ comments }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('📝 Comments synced to backend:', result);
    } catch (error) {
      console.error('Failed to sync comments to backend:', error);
      throw error;
    }
  },

  // Load comments from backend (for AI synchronization)
  async loadCommentsFromBackend(repoName: string, userId: string = 'anonymous') {
    try {
      const response = await fetch(`/api/comments/${userId}/${repoName}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      const comments = result.comments || [];
      
      // Filter out comments with invalid file paths
      const validComments = comments.filter((c: any) => this.validateFilePath(c.fileName));
      
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
        lastSyncTime: new Date()
      }));

      console.log('📥 Loaded comments from backend:', parsedComments.length);
      return parsedComments;
    } catch (error) {
      console.error('Failed to load comments from backend:', error);
      return [];
    }
  },

  // Sync comments from backend and merge with local comments (for real-time updates)
  async syncWithBackend(repoName: string, userId: string = 'anonymous') {
    try {
      const response = await fetch(`/api/comments/${userId}/${repoName}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      const backendComments = result.comments || [];
      
      // Filter out comments with invalid file paths
      const validBackendComments = backendComments.filter((c: any) => this.validateFilePath(c.fileName));
      
      if (validBackendComments.length !== backendComments.length) {
        console.warn(`Filtered out ${backendComments.length - validBackendComments.length} comments with invalid file paths from backend sync`);
      }
      
      const parsedBackendComments = validBackendComments.map((c: any) => ({
        ...c,
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt)
      }));

      // Get current comments from store
      let currentComments: Comment[] = [];
      commentsStore.subscribe(state => {
        currentComments = state.comments;
      })();

      // Find new comments (comments in backend that aren't in frontend)
      const currentIds = new Set(currentComments.map((c: Comment) => c.id));
      const newComments = parsedBackendComments.filter((c: Comment) => !currentIds.has(c.id));

      if (newComments.length > 0) {
        console.log(`🆕 Found ${newComments.length} new comments from AI:`, newComments.map((c: Comment) => c.content.substring(0, 50)));
        
        // Merge new comments with existing ones
        const mergedComments = [...currentComments, ...newComments].sort((a: Comment, b: Comment) =>
          new Date(a.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        commentsStore.update(state => ({
          ...state,
          comments: mergedComments,
          lastSyncTime: new Date()
        }));

        // Save merged comments to localStorage
        localStorage.setItem(`comments_${repoName}`, JSON.stringify(mergedComments));

        return newComments;
      }

      // Just update sync time if no new comments
      commentsStore.update(state => ({
        ...state,
        lastSyncTime: new Date()
      }));

      return [];
    } catch (error) {
      console.error('Failed to sync with backend:', error);
      return [];
    }
  },

  // Start polling for new comments (real-time sync)
  startPolling(repoName: string, userId: string = 'anonymous') {
    // Don't start multiple polling intervals
    if (pollIntervalId) {
      return;
    }

    console.log('🔄 Starting comment polling for real-time AI comment sync');
    
    commentsStore.update(state => ({
      ...state,
      isPolling: true
    }));

    // Start polling interval
    pollIntervalId = setInterval(async () => {
      try {
        await this.syncWithBackend(repoName, userId);
      } catch (error) {
        console.warn('Polling sync error:', error);
      }
    }, POLL_INTERVAL);
  },

  // Stop polling for new comments
  stopPolling() {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
      
      commentsStore.update(state => ({
        ...state,
        isPolling: false
      }));

      console.log('⏹️ Stopped comment polling');
    }
  },

  // Manual refresh to force sync
  async refreshComments(repoName: string, userId: string = 'anonymous') {
    console.log('🔄 Manually refreshing comments from backend');
    return await this.syncWithBackend(repoName, userId);
  }
};

// Auto-save comments when they change
export function setupAutoSave(repoName: string) {
  return commentsStore.subscribe(() => {
    commentsService.saveComments(repoName);
  });
} 