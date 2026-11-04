<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './components/Icon.svelte';
  import Create from './pages/Create.svelte';
  import View from './pages/View.svelte';
  import Information from './pages/Information.svelte';
  import { onionUrl } from './lib/site.ts';
  import { ThemeController, themePreference, nextThemePreference } from './lib/theme.ts';
  const path = location.pathname.replace(/\/$/, '') || '/';
  let preference = $state(themePreference(document.documentElement.dataset.theme));
  const themeLabels = { system: 'System', light: 'Light', dark: 'Dark' };
  const themeAction = $derived(
    `Color theme: ${themeLabels[preference]}. Switch to ${themeLabels[nextThemePreference(preference)]}.`,
  );
  let theme: ThemeController | undefined;
  onMount(() => {
    theme = new ThemeController((state) => {
      preference = state.preference;
    });
    return () => theme?.destroy();
  });
</script>

<a
  class="skip-link"
  href="#main"
  onclick={(event) => {
    event.preventDefault();
    document.getElementById('main')?.focus();
  }}>Skip to content</a
>
<div class="site-shell">
  <header class="site-header">
    <a class="brand" href="/" aria-label="erase.to home"><Icon size={22} /><span>erase.to</span></a>
    <nav aria-label="Main navigation">
      <a href="/" aria-current={path === '/' || path === '/create' ? 'page' : undefined}>Create</a
      ><a href="/about" aria-current={path === '/about' ? 'page' : undefined}>How it works</a><a
        href="/privacy"
        aria-current={path === '/privacy' ? 'page' : undefined}>Privacy</a
      >
      <button
        type="button"
        class="theme-button"
        aria-label={themeAction}
        title={themeAction}
        onclick={() => theme?.cycle()}
        ><Icon
          name={preference === 'system' ? 'system' : preference === 'light' ? 'sun' : 'moon'}
          size={16}
        /><span>{themeLabels[preference]}</span></button
      >
    </nav>
  </header>
  {#if path === '/' || path === '/create'}<Create />{:else if path === '/view'}<View
    />{:else if ['/about', '/privacy', '/terms'].includes(path)}<Information
      page={path.slice(1) as 'about' | 'privacy' | 'terms'}
    />{:else}<main id="main" class="document-page" tabindex="-1">
      <h1>Page not found</h1>
      <p>This address is not available. Private packages require their complete original link.</p>
      <a class="button primary" href="/">Create a message</a>
    </main>{/if}
  <footer class="site-footer">
    <div>
      <a class="brand small-brand" href="/">erase.to</a>
      <p>Client-encrypted. Temporary by design.</p>
    </div>
    <nav aria-label="Footer navigation">
      <a href="/about">About</a><a href="/privacy">Privacy &amp; security</a><a href="/terms"
        >Terms</a
      >{#if onionUrl}<a href={onionUrl} target="_blank" rel="noopener noreferrer">Onion service</a
        >{/if}<a
        href="https://github.com/RedCamel1312/erase.to"
        target="_blank"
        rel="noopener noreferrer">Source ↗</a
      >
    </nav>
  </footer>
</div>
