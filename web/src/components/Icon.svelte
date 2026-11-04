<script lang="ts">
  let {
    name = 'lock',
    size = 20,
  }: {
    name?: 'lock' | 'sun' | 'moon' | 'file' | 'arrow' | 'copy' | 'check' | 'clear';
    size?: number;
  } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.7"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name === 'lock'}<rect x="5" y="10" width="14" height="11" rx="2" /><path
      d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"
    />
  {:else if name === 'sun'}<circle cx="12" cy="12" r="4" /><path
      d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"
    />
  {:else if name === 'moon'}<path d="M20 13a8 8 0 0 1-9-9 8.5 8.5 0 1 0 9 9Z" />
  {:else if name === 'file'}<path d="M14 2H5v20h14V7l-5-5Zm0 0v5h5M8 12h8M8 16h6" />
  {:else if name === 'arrow'}<path d="M4 12h16m-6-6 6 6-6 6" />
  {:else if name === 'copy'}<rect x="8" y="8" width="12" height="13" rx="2" /><path
      d="M15 8V3H3v13h5"
    />
  {:else if name === 'clear'}<path d="m16 3 5 5-11 11H5l-3-3L13 3h3ZM6 12l7 7M11 21h10" />
  {:else}<path d="m5 12 4 4L19 6" />{/if}
</svg>
