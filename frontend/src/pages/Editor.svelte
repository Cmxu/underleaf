<script lang="ts">
  import { onMount } from 'svelte';
  import FileTree from '../components/FileTree.svelte';
  import { compileRepo } from '../utils/api';
  export let navigate: (path: string) => void;

  let content = '% Start writing your LaTeX here';
  let repoUrl = '';
  let repoName = '';

  onMount(() => {
    repoUrl = sessionStorage.getItem('repoUrl') || '';
    if (!repoUrl) {
      navigate('/');
      return;
    }
    const parts = repoUrl.split('/');
    repoName = parts[parts.length - 1].replace(/\.git$/, '');
  });

  async function handleCompile() {
    if (!repoName) return;
    try {
      await compileRepo(repoName);
      alert('Compilation finished');
    } catch (err) {
      alert('Compilation failed');
      console.error(err);
    }
  }
</script>

{#if repoUrl}
<div style="height:100vh; display:flex; flex-direction:column;">
  <header class="app-header" style="padding:0.5rem; background:#1e1e1e; display:flex; justify-content:space-between;">
    <span style="color:#888888; font-family:'Open Sans', sans-serif">Repo: {repoUrl}</span>
    <button on:click={handleCompile} style="color:#888888; font-family:'Open Sans', sans-serif">Compile</button>
  </header>
  <div style="flex:1; display:flex;">
    <aside class="sidebar">
      <FileTree />
    </aside>
    <main style="flex:1;">
      <textarea bind:value={content} style="width:100%; height:100%;"></textarea>
    </main>
    <section class="preview">
      <p>PDF Preview</p>
      <!-- TODO: render PDF preview -->
    </section>
  </div>
</div>
{/if}
