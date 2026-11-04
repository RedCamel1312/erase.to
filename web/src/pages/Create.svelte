<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import SessionWarning from '../components/SessionWarning.svelte';
  import { Composer, composerState, sizeLabel } from '../lib/controllers.ts';
  import { LIMITS } from '../lib/api.ts';
  import { TextMetrics } from '../lib/text-metrics.ts';
  let model = $state(composerState());
  let controller: Composer;
  let messageElement = $state<HTMLTextAreaElement>();
  let linkElement = $state<HTMLInputElement>();
  let passphraseOpen = $state(false);
  let dragging = $state(false);
  let measurement = $state({ bytes: 0, lines: 1, pending: false });
  const metrics = new TextMetrics((value) => (measurement = value));
  $effect(() => {
    if (!model.text) metrics.clear();
    else metrics.update(model.text);
  });
  const textBytes = $derived(measurement.bytes);
  const fileBytes = $derived(model.files.reduce((sum, file) => sum + file.size, 0));
  const limits = $derived(model.config ?? LIMITS);
  const ttlOptions = $derived(
    [
      { seconds: 60, label: '1 minute' },
      { seconds: 600, label: '10 minutes' },
      { seconds: 3600, label: '1 hour' },
      { seconds: 86400, label: '24 hours' },
      { seconds: 604800, label: '7 days' },
    ].filter((option) => option.seconds <= limits.max_ttl),
  );
  const overLimit = $derived(
    textBytes > limits.max_text_bytes ||
      (model.mode === 'files' && textBytes + fileBytes > limits.max_content_bytes),
  );
  const hasContent = $derived(
    Boolean(/\S/.test(model.text) || (model.mode === 'files' && model.files.length)),
  );
  const lines = $derived(measurement.lines);
  const clock = $derived(
    `${Math.floor(model.sessionSeconds / 60)
      .toString()
      .padStart(2, '0')}:${(model.sessionSeconds % 60).toString().padStart(2, '0')}`,
  );
  const submitLabel = $derived(
    {
      compose: 'Encrypt & create link',
      encrypt: 'Encrypting on this device…',
      proof: 'Computing proof-of-work…',
      upload: 'Uploading encrypted package…',
      share: 'Encrypt & create link',
      revoke: 'Revoking package…',
      revoked: 'Encrypt & create link',
    }[model.stage],
  );
  onMount(() => {
    controller = new Composer(model);
    controller.attach();
    void controller.init();
    return () => {
      controller.destroy();
      metrics.destroy();
    };
  });
  function selectFiles(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    controller.addFiles(Array.from(input.files ?? []));
    input.value = '';
  }
  function dropFiles(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    if (!model.busy && event.dataTransfer)
      controller.addFiles(Array.from(event.dataTransfer.files));
  }
  async function clear() {
    controller.clear();
    passphraseOpen = false;
    dragging = false;
    await tick();
    messageElement?.focus();
  }
  async function createLink() {
    await controller.submit();
    await tick();
    if (model.link) linkElement?.focus();
  }
</script>

<svelte:head
  ><title>erase.to | Encrypted sharing</title><meta
    name="robots"
    content="noindex,nofollow,noarchive,nosnippet"
  /></svelte:head
>
<main id="main" class="create-page" tabindex="-1">
  <h1 class="visually-hidden">Create an encrypted handoff</h1>
  {#if !model.expiresAt}
    <form
      class="composer"
      onsubmit={(event) => {
        event.preventDefault();
        void createLink();
      }}
      method="post"
      autocomplete="off"
    >
      <div class="compose-head">
        <div class="mode-control" role="group" aria-label="Content type">
          <button
            type="button"
            class:active={model.mode === 'text'}
            aria-pressed={model.mode === 'text'}
            disabled={model.busy}
            onclick={() => {
              model.mode = 'text';
              controller.edit();
            }}>Text</button
          ><button
            type="button"
            class:active={model.mode === 'files'}
            aria-pressed={model.mode === 'files'}
            disabled={model.busy}
            onclick={() => {
              model.mode = 'files';
              controller.edit();
            }}
            >Files{#if model.files.length}<span class="file-count">{model.files.length}</span
              >{/if}</button
          >
        </div>
        <button type="button" class="clear-button" title="Clear all local content" onclick={clear}
          ><Icon name="clear" size={16} /><span>Clear</span></button
        >
      </div>
      <div class="content-editor">
        {#if model.mode === 'files'}
          <div class="file-area">
            <div
              class="file-drop"
              class:dragging
              role="region"
              aria-label="File selection"
              ondragover={(event) => {
                event.preventDefault();
                if (!model.busy) dragging = true;
              }}
              ondragleave={() => (dragging = false)}
              ondrop={dropFiles}
            >
              <Icon name="file" size={24} /><label for="files"
                >Drop files here or choose from your device</label
              ><input
                id="files"
                type="file"
                multiple
                aria-describedby="file-limits"
                disabled={model.busy}
                onchange={selectFiles}
              />
              <p class="hint" id="file-limits">
                Up to {limits.max_files} files · {sizeLabel(limits.max_content_bytes)} for files and message
                combined<br />Large packages need sufficient device memory and a stable connection.
              </p>
            </div>
            {#if model.files.length}<ul class="file-list" aria-label="Selected files">
                {#each model.files as file, index}<li>
                    <Icon name="file" size={17} />
                    <div>
                      <span class="filename">{file.name}</span><span class="hint"
                        >{sizeLabel(file.size)}</span
                      >
                    </div>
                    <button
                      type="button"
                      class="remove-file"
                      aria-label={`Remove ${file.name}`}
                      disabled={model.busy}
                      onclick={() => controller.removeFile(index)}>×</button
                    >
                  </li>{/each}
              </ul>{/if}
          </div>
        {/if}
        <label class="visually-hidden" for="message"
          >{model.mode === 'files' ? 'Optional message' : 'Your message'}</label
        >
        <textarea
          id="message"
          aria-describedby="size-counter"
          bind:this={messageElement}
          bind:value={model.text}
          oninput={() => controller.edit()}
          class:compact={model.mode === 'files'}
          placeholder={model.mode === 'files'
            ? 'Optional message for the recipient…'
            : 'Write the information you want to share…'}
          maxlength={limits.max_text_bytes}
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          disabled={model.busy}></textarea>
        <div class="editor-foot">
          <span
            >{#if model.mode === 'files'}{model.files.length} / {limits.max_files} files{:else}Plain
              text{#if !measurement.pending}
                <span class="meta-divider">/</span>
                {lines.toLocaleString()}
                {lines === 1 ? 'line' : 'lines'}{/if}{/if}</span
          ><span id="size-counter" class:over-limit={overLimit}
            ><span class="visually-hidden"
              >{model.mode === 'files' ? 'Combined message and file size:' : 'Message size:'}
            </span>{measurement.pending
              ? 'Counting…'
              : sizeLabel(model.mode === 'text' ? textBytes : textBytes + fileBytes)} / {sizeLabel(
              model.mode === 'text' ? limits.max_text_bytes : limits.max_content_bytes,
            )}</span
          >
        </div>
      </div>
      <div class="delivery-settings">
        <div class="settings-row">
          <div class="field">
            <label for="ttl">Expires after</label><select
              id="ttl"
              bind:value={model.ttl}
              onchange={() => controller.edit()}
              disabled={model.busy}
              >{#each ttlOptions as option}<option value={option.seconds}>{option.label}</option
                >{/each}</select
            >
          </div>
          <div class="field">
            <label for="views">Maximum retrievals</label><input
              id="views"
              type="number"
              inputmode="numeric"
              min="1"
              max={model.config?.max_views ?? 100}
              step="1"
              value={model.views}
              oninput={(event) => {
                model.views = Number(event.currentTarget.value);
                controller.edit();
              }}
              disabled={model.busy}
            />
          </div>
        </div>
        <p class="settings-hint">
          Removed when either limit is reached. Retrievals count before delivery.
        </p>
        <details class="passphrase-options" bind:open={passphraseOpen}>
          <summary
            ><Icon name="lock" size={14} /><span>Additional passphrase</span><span class="optional"
              >{model.passphrase ? 'set' : 'optional'}</span
            ></summary
          >
          <div class="passphrase-content">
            <label class="visually-hidden" for="passphrase">Additional passphrase</label><input
              id="passphrase"
              type="password"
              bind:value={model.passphrase}
              oninput={() => controller.edit()}
              maxlength="256"
              autocomplete="new-password"
              spellcheck="false"
              disabled={model.busy}
            />
            <p class="hint">
              Share separately. An incorrect passphrase is rejected locally without using a
              retrieval.
            </p>
          </div>
        </details>
        <button
          id="create-button"
          class="button primary create-button"
          type="submit"
          disabled={model.busy ||
            !model.configured ||
            !hasContent ||
            overLimit ||
            measurement.pending}
          >{#if model.busy}<span class="busy-indicator" aria-hidden="true"></span>{:else}<Icon
              name="lock"
              size={16}
            />{/if}{submitLabel}{#if !model.busy}<Icon name="arrow" size={16} />{/if}</button
        >
      </div>
    </form>
  {:else}
    <section class="receipt" aria-labelledby="result-heading">
      <div class="receipt-heading">
        <span class="receipt-mark"><Icon name="check" size={22} /></span>
        <div>
          <p class="eyebrow">Delivery receipt</p>
          <h2 id="result-heading">
            {model.canRevoke ? 'Your private link is ready' : 'Package revoked'}
          </h2>
        </div>
      </div>
      {#if model.link}<label class="field-label" for="share-link">Complete private link</label
        ><input
          id="share-link"
          class="monospace share-link"
          bind:this={linkElement}
          readonly
          value={model.link}
          spellcheck="false"
          autocomplete="off"
        /><button
          class="button primary copy-link-button"
          type="button"
          onclick={() => controller.copyLink()}
          ><Icon name="copy" size={16} />Copy private link</button
        >
        <p class="hint copy-feedback" role="status">{model.copied}</p>{/if}
      <dl class="receipt-facts">
        <div>
          <dt>{model.canRevoke ? 'Expires' : 'Original expiry'}</dt>
          <dd>{new Date(model.expiresAt * 1000).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Retrieval limit</dt>
          <dd>{model.createdViews}</dd>
        </div>
      </dl>
      <p class="receipt-help">
        {model.canRevoke
          ? 'Anyone with the complete link can request access. Share any passphrase through a separate channel.'
          : 'Stored ciphertext has been removed. Copies already received remain outside this page’s control.'}
      </p>
      {#if model.canRevoke}<div class="revoke-row">
          <span>Sender control · this session only</span><button
            class="text-button"
            type="button"
            disabled={model.busy}
            onclick={() => controller.revoke()}
            >{model.stage === 'revoke' ? 'Revoking…' : 'Revoke package'}</button
          >
        </div>{/if}
      <button type="button" class="button secondary new-handoff" onclick={clear}
        >New handoff<Icon name="arrow" size={16} /></button
      >
      <p class="hint new-handoff-hint">
        Starting again clears this link and its local revocation control.
      </p>
    </section>
  {/if}
  <section class="operation-status" aria-label="Operation status">
    {#if model.error}<p class="error" role="alert">{model.error}</p>
      {#if !model.configured}<button
          class="text-button"
          type="button"
          onclick={() => controller.init()}>Retry connection</button
        >{/if}{:else if model.status !== 'Ready to create an encrypted package.'}<p
        class="status"
        role="status"
      >
        {model.status}
      </p>{/if}<SessionWarning
      seconds={model.warning}
      keep={(event) => controller.session.keep(event)}
    />
  </section>
  <div class="local-session" class:near-expiry={model.warning > 0}>
    {#if model.sessionSeconds > 0}<span>Local data clears after inactivity</span><span
        class="session-time"
        aria-label={`${model.sessionSeconds} seconds until local clearing`}>{clock}</span
      >{:else}<span>Encrypted on your device. Temporary on the server.</span>{/if}<a
      href="/privacy"
      aria-label="Read the security model">Privacy &amp; security ↗</a
    >
  </div>
</main>
