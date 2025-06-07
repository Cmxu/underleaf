<script lang="ts">
  import Home from './pages/Home.svelte';
  import EditorPage from './pages/Editor.svelte';

  let path = window.location.pathname;

  const navigate = (p: string) => {
    window.history.pushState({}, '', p);
    path = p;
  };

  window.addEventListener('popstate', () => {
    path = window.location.pathname;
  });
</script>

{#if path === '/editor'}
  <EditorPage {navigate} />
{:else}
  <Home {navigate} />
{/if}
