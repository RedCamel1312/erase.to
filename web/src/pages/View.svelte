<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Reader, readerState, sizeLabel } from '../lib/controllers.ts';
  import Icon from '../components/Icon.svelte';
  import SessionWarning from '../components/SessionWarning.svelte';
  let model = $state(readerState());
  let controller: Reader;
  const isLongText = $derived((model.content?.text.length ?? 0) > 131072);
  const preview = $derived.by(() => {
    const text = model.content?.text ?? '';
    if (!isLongText) return text;
    const end = text.charCodeAt(131071);
    return text.slice(0, end >= 0xd800 && end <= 0xdbff ? 131071 : 131072);
  });
  let unlockElement = $state<HTMLInputElement>();
  async function openPackage() {
    await controller.open();
    await tick();
    if (model.phase === 'ready' && !model.busy && model.error) unlockElement?.focus();
  }
  function loadLink() {
    const original = location.href;
    history.replaceState(null, '', '/view');
    void controller.load(original);
  }
  onMount(() => {
    controller = new Reader(model);
    controller.attach();
    loadLink();
    const changed = () => {
      if (location.hash) {
        controller.clear();
        loadLink();
      }
    };
    window.addEventListener('hashchange', changed);
    return () => {
      window.removeEventListener('hashchange', changed);
      controller.destroy();
    };
  });
</script>

<svelte:head
  ><title>Open a message | erase.to</title><meta
    name="robots"
    content="noindex,nofollow,noarchive,nosnippet"
  /></svelte:head
>
<main id="main" class="reader-page" tabindex="-1">
  <header class="page-intro reader-intro">
    <div>
      <p class="eyebrow">Received package</p>
      <h1>Open a message</h1>
      <p class="intro">Retrieve the encrypted package and decrypt it on this device.</p>
    </div>
    {#if model.phase !== 'cleared' && model.phase !== 'error'}<button
        type="button"
        class="clear-button"
        onclick={() => controller.clear()}><Icon name="clear" size={16} />Clear</button
      >{/if}
  </header>
  {#if model.phase === 'ready' || model.phase === 'loading'}
    <section class="open-panel">
      <div class="open-panel-heading">
        <Icon size={22} />
        <h2>
          {model.phase === 'loading' ? 'Checking availability' : 'Encrypted package available'}
        </h2>
      </div>
      {#if model.phase === 'ready'}<div class="metadata-row">
          <p><span class="meta-label">Available retrievals</span>{model.remaining}</p>
          <p>
            <span class="meta-label">Expires</span>{new Date(
              model.expiresAt * 1000,
            ).toLocaleString()}
          </p>
        </div>
        <p class="hint">
          Opening uses one retrieval before the response is delivered. An interrupted connection may
          consume it. Files are offered as downloads and are never previewed here.
        </p>
        <form
          onsubmit={(event) => {
            event.preventDefault();
            void openPackage();
          }}
          method="post"
          autocomplete="off"
        >
          {#if model.required}<div class="field">
              <label for="unlock">Additional passphrase</label><input
                id="unlock"
                type="password"
                bind:this={unlockElement}
                bind:value={model.passphrase}
                autocomplete="off"
                maxlength="256"
                disabled={model.busy}
              />
              <p class="hint">
                An incorrect passphrase is rejected locally and does not use a retrieval.
              </p>
            </div>{/if}
          <button id="open-button" class="button primary" type="submit" disabled={model.busy}
            >{model.busy ? 'Processing…' : 'Open package'}<Icon name="arrow" size={16} /></button
          >
        </form>{/if}
    </section>
  {:else if model.phase === 'open' && model.content}
    <section class="decrypted-content" aria-label="Decrypted content">
      <div class="content-heading">
        <span>Decrypted locally</span><span
          >{model.remaining === 0
            ? 'Final retrieval used'
            : `${model.remaining} retrievals remained at delivery`}</span
        >
      </div>
      {#if model.content.text}<div
          class="message-text"
          role="textbox"
          aria-readonly="true"
          aria-multiline="true"
          aria-label="Decrypted message"
          tabindex="0"
        >
          {preview}
        </div>
        {#if isLongText}<p class="large-text-note">
            Long message preview. Copy or download the complete text using the controls below.
          </p>{/if}{/if}
      {#if model.content.files.length}<ul class="file-list downloads">
          {#each model.content.files as file, index}<li>
              <Icon name="file" />
              <div>
                <span class="filename">{file.name}</span><span class="hint"
                  >{sizeLabel(file.data.length)} · {file.mime}</span
                >
              </div>
              <button
                type="button"
                class="button small secondary"
                onclick={() => controller.download(index)}>Download</button
              >
            </li>{/each}
        </ul>{/if}
    </section>
    <div class="reader-actions">
      <div class="actions">
        {#if model.content.text}<button
            class="button secondary"
            type="button"
            onclick={() => controller.copyText()}><Icon name="copy" size={16} />Copy text</button
          >{#if isLongText}<button
              class="button secondary"
              type="button"
              onclick={() => controller.downloadText()}>Download full text</button
            >{/if}{/if}<button
          class="button secondary"
          type="button"
          onclick={() => controller.clear()}>Clear local view</button
        >
      </div>
      <a href="/" class="text-button">Create a message</a>
    </div>
    <p class="hint" role="status">{model.copied}</p>
  {:else}<section class="open-panel">
      <h2>{model.phase === 'cleared' ? 'Local view cleared' : 'Package unavailable'}</h2>
      <p class="hint">
        Reopen the complete original link to check availability. Used, expired, or revoked packages
        cannot be recovered.
      </p>
      <a href="/" class="button secondary">Create a message</a>
    </section>{/if}
  <section class="operation-status">
    <p class="status" role="status">
      <span
        class:working={model.busy}
        class:ready={!model.error && (model.phase === 'ready' || model.phase === 'open')}
        class="status-dot"
      ></span>{model.status}
    </p>
    {#if model.error}<p class="error" role="alert">{model.error}</p>{/if}<SessionWarning
      seconds={model.warning}
      keep={(event) => controller.session.keep(event)}
    />
  </section>
  <div class="security-note">
    <h2>Local handling</h2>
    <p>
      Decrypted content clears when this tab is hidden or after five minutes of inactivity.
      Downloaded files and clipboard copies remain outside this page’s control. Only open files from
      a sender you trust.
    </p>
  </div>
</main>
