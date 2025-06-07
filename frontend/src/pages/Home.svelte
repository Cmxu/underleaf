<script lang="ts">
  import { cloneRepo } from '../utils/api';
  export let navigate: (path: string) => void;

  let url = '';
  let isLoading = false;

  async function handleSubmit() {
    if (!url.trim()) return;
    isLoading = true;
    try {
      await cloneRepo(url.trim());
      sessionStorage.setItem('repoUrl', url.trim());
      navigate('/editor');
    } catch (err) {
      alert('Failed to clone repository');
      console.error(err);
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="home-container">
  <div class="home-content">
    <h1 class="home-title">Underleaf</h1>
    <form on:submit|preventDefault={handleSubmit} class="home-form">
      <div class="input-container">
        <input
          type="url"
          bind:value={url}
          placeholder="https://github.com/username/repository"
          class="url-input"
          disabled={isLoading}
        />
        <button type="submit" class="submit-button" disabled={isLoading || !url.trim()}>
          {#if isLoading}
            <div class="loading-spinner"></div>
          {:else}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          {/if}
        </button>
      </div>
      <div class="tooltip">
        <span class="tooltip-text">Enter a public Git repository URL to get started</span>
      </div>
    </form>
  </div>
</div>
