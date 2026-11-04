<script lang="ts">
  let { seconds, keep }: { seconds: number; keep: (event: MouseEvent) => void } = $props();
</script>

{#if seconds > 0}
  <div class="session-warning">
    <p>
      <span aria-hidden="true"
        >Local session data clears in {seconds} seconds. Server retention is unchanged.</span
      ><span class="visually-hidden" role="status"
        >Inactivity limit approaching. Keep this session active to retain local data. Server
        retention is unchanged.</span
      >
    </p>
    <button type="button" class="button small secondary" onclick={keep}>Keep session active</button>
  </div>
{/if}
