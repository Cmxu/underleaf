<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase';

  onMount(async () => {
    // Handle OAuth callback
    const { data, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('Auth callback error:', error);
      await goto('/?error=auth_error');
    } else if (data.session) {
      // Successful authentication, redirect to home
      await goto('/');
    } else {
      // No session, redirect to home
      await goto('/');
    }
  });
</script>

<svelte:head>
  <title>Authenticating... - Underleaf</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-dark-800">
  <div class="text-center">
    <div class="loading-spinner mb-4"></div>
    <p class="text-white text-lg">Authenticating...</p>
  </div>
</div> 