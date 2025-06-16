<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  export let isOpen = false;
  export let authUrl = '';
  export let sessionId = '';
  export let isLoading = false; // Now comes from parent
  
  const dispatch = createEventDispatcher();
  
  let verificationCode = '';
  let error = '';
  
  function closeModal() {
    if (!isLoading) {
      isOpen = false;
      verificationCode = '';
      error = '';
      dispatch('cancel');
    }
  }
  
  async function handleSubmit() {
    if (!verificationCode.trim()) {
      error = 'Please enter the verification code';
      return;
    }
    
    error = '';
    
    try {
      dispatch('submit', { verificationCode: verificationCode.trim(), sessionId });
      // isLoading state is now managed by parent component
    } catch (err) {
      error = 'Failed to submit code. Please try again.';
    }
  }
  
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !isLoading) {
      closeModal();
    }
    if (event.key === 'Enter' && !isLoading) {
      handleSubmit();
    }
  }
  
  function openAuthUrl() {
    if (authUrl) {
      window.open(authUrl, '_blank');
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <!-- Full screen modal overlay -->
  <div 
    class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
    on:click={closeModal}
    on:keydown={(e) => e.key === 'Escape' && closeModal()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="claude-code-modal-title"
    tabindex="0"
  >
    <!-- Modal content -->
    <div 
      class="bg-white/95 backdrop-blur-glass rounded-3xl p-8 w-full max-w-lg shadow-3xl border border-white/20 relative"
      on:click|stopPropagation
      role="none"
    >
      <!-- Close button -->
      <button
        on:click={closeModal}
        disabled={isLoading}
        class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
        aria-label="Close modal"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div class="text-center mb-6">
        <div class="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 id="claude-code-modal-title" class="text-2xl font-bold text-gray-800 mb-2">
          Claude Authentication
        </h2>
        <p class="text-gray-600 text-sm leading-relaxed">
          Complete the authentication process by entering your verification code
        </p>
      </div>

      <!-- Authentication URL -->
      <div class="mb-6">
        <h3 class="text-sm font-medium text-gray-700 mb-3">Step 1: Complete Authentication</h3>
        <div class="bg-blue-50 rounded-2xl p-4 mb-4">
          <p class="text-sm text-blue-800 mb-3">
            Click the button below to open Claude authentication in a new tab:
          </p>
          <button
            on:click={openAuthUrl}
            disabled={isLoading}
            class="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🔗 Open Claude Authentication
          </button>
        </div>
      </div>

      <!-- Verification Code Input -->
      <div class="mb-6">
        <h3 class="text-sm font-medium text-gray-700 mb-3">Step 2: Enter Verification Code</h3>
        <div>
          <label for="verification-code" class="block text-sm font-medium text-gray-700 mb-2">
            Verification Code
          </label>
          <input
            id="verification-code"
            type="text"
            bind:value={verificationCode}
            placeholder="Enter the code from Claude authentication"
            disabled={isLoading}
            class="w-full px-4 py-3 bg-white/70 border border-gray-200 rounded-2xl text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50"
            autocomplete="off"
          />
        </div>
        
        {#if error}
          <div class="mt-2 text-sm text-red-600">
            {error}
          </div>
        {/if}
      </div>

      <!-- Instructions -->
      <div class="mb-6 text-xs text-gray-500 leading-relaxed">
        <p class="mb-1">💡 <strong>Instructions:</strong></p>
        <p class="mb-1">1. Click "Open Claude Authentication" above</p>
        <p class="mb-1">2. Sign in with your Claude Pro account</p>
        <p class="mb-1">3. Copy the verification code you receive</p>
        <p class="mb-1">4. Paste it in the field above and click "Complete Setup"</p>
        <p>🔒 This process securely connects Claude AI to your account</p>
      </div>

      <!-- Action buttons -->
      <div class="flex space-x-3">
        <button
          on:click={closeModal}
          disabled={isLoading}
          class="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-2xl hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          Cancel
        </button>
        <button
          on:click={handleSubmit}
          disabled={isLoading || !verificationCode.trim()}
          class="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-4 py-3 rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center space-x-2"
        >
          {#if isLoading}
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Submitting...
          {:else}
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            Complete Setup
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if} 