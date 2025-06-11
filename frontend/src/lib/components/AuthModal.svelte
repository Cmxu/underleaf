<script lang="ts">
  import { authService } from '$lib/stores/auth';
  import { createEventDispatcher } from 'svelte';

  export let isOpen = false;

  const dispatch = createEventDispatcher();

  let isSignUp = false;
  let email = '';
  let password = '';
  let confirmPassword = '';
  let loading = false;
  let error: string | null = null;

  function closeModal() {
    isOpen = false;
    dispatch('close');
    // Reset form
    email = '';
    password = '';
    confirmPassword = '';
    error = null;
    loading = false;
  }

  function toggleMode() {
    isSignUp = !isSignUp;
    error = null;
    confirmPassword = '';
  }

  async function handleSubmit() {
    if (!email || !password) {
      error = 'Please fill in all fields';
      return;
    }

    if (isSignUp && password !== confirmPassword) {
      error = 'Passwords do not match';
      return;
    }

    loading = true;
    error = null;

    try {
      const { error: authError } = isSignUp 
        ? await authService.signUp(email, password)
        : await authService.signIn(email, password);

      if (authError) {
        error = authError.message;
      } else {
        if (isSignUp) {
          error = null;
          // Show success message for sign up
          alert('Please check your email to confirm your account');
        }
        closeModal();
      }
    } catch (err) {
      error = 'An unexpected error occurred';
    } finally {
      loading = false;
    }
  }

  async function handleOAuthSignIn(provider: 'github' | 'google') {
    loading = true;
    error = null;

    try {
      const { error: authError } = await authService.signInWithProvider(provider);
      if (authError) {
        error = authError.message;
      }
    } catch (err) {
      error = 'An unexpected error occurred';
    } finally {
      loading = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeModal();
    }
    if (event.key === 'Enter' && !loading) {
      handleSubmit();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <!-- Modal overlay -->
  <div 
    class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    on:click={closeModal}
    on:keydown={(e) => e.key === 'Escape' && closeModal()}
    role="presentation"
  >
    <!-- Modal content -->
    <div 
      class="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 relative"
      on:click|stopPropagation
      role="dialog"
      aria-labelledby="auth-modal-title"
      tabindex="0"
    >
      <!-- Close button -->
      <button
        on:click={closeModal}
        class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="Close modal"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <!-- Modal header -->
      <div class="text-center mb-8">
        <h2 id="auth-modal-title" class="text-3xl font-bold text-gray-900 mb-2">
          {isSignUp ? 'Create Account' : 'Welcome Back'}
        </h2>
        <p class="text-gray-600">
          {isSignUp ? 'Join Underleaf to start collaborating' : 'Sign in to continue to Underleaf'}
        </p>
      </div>

      <!-- OAuth buttons -->
      <div class="space-y-3 mb-6">
        <button
          on:click={() => handleOAuthSignIn('github')}
          disabled={loading}
          class="w-full flex items-center justify-center px-4 py-3 border border-gray-300 rounded-xl shadow-sm text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg class="w-5 h-5 mr-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
          Continue with GitHub
        </button>

        <button
          on:click={() => handleOAuthSignIn('google')}
          disabled={loading}
          class="w-full flex items-center justify-center px-4 py-3 border border-gray-300 rounded-xl shadow-sm text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg class="w-5 h-5 mr-3" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>
      </div>

      <!-- Divider -->
      <div class="relative mb-6">
        <div class="absolute inset-0 flex items-center">
          <div class="w-full border-t border-gray-300"></div>
        </div>
        <div class="relative flex justify-center text-sm">
          <span class="px-2 bg-white text-gray-500">Or continue with email</span>
        </div>
      </div>

      <!-- Email form -->
      <form on:submit|preventDefault={handleSubmit} class="space-y-4">
        <div>
          <label for="email" class="block text-sm font-medium text-gray-700 mb-1">
            Email address
          </label>
          <input
            id="email"
            type="email"
            bind:value={email}
            disabled={loading}
            required
            class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Enter your email"
          />
        </div>

        <div>
          <label for="password" class="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            bind:value={password}
            disabled={loading}
            required
            class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Enter your password"
          />
        </div>

        {#if isSignUp}
          <div>
            <label for="confirmPassword" class="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              bind:value={confirmPassword}
              disabled={loading}
              required
              class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Confirm your password"
            />
          </div>
        {/if}

        {#if error}
          <div class="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">
            {error}
          </div>
        {/if}

        <button
          type="submit"
          disabled={loading}
          class="w-full btn-primary py-3 px-4 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {#if loading}
            <div class="flex items-center justify-center">
              <div class="loading-spinner mr-2"></div>
              {isSignUp ? 'Creating Account...' : 'Signing In...'}
            </div>
          {:else}
            {isSignUp ? 'Create Account' : 'Sign In'}
          {/if}
        </button>
      </form>

      <!-- Toggle between sign in/sign up -->
      <div class="text-center mt-6">
        <button
          on:click={toggleMode}
          disabled={loading}
          class="text-blue-600 hover:text-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </button>
      </div>
    </div>
  </div>
{/if} 