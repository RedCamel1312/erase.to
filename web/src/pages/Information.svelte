<script lang="ts">
  import { onionUrl } from '../lib/site.ts';
  const btcAddress = 'bc1qddfz8u589nvh0gcxdqcz3yltracn9t9qq9jtm7';
  let copyStatus = $state('');
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(btcAddress);
      copyStatus = 'Bitcoin address copied.';
    } catch {
      copyStatus = 'Clipboard access unavailable. Select and copy the address manually.';
    }
  }
  let { page }: { page: 'about' | 'privacy' | 'terms' } = $props();
  const title = $derived(
    page === 'about'
      ? 'How erase.to works'
      : page === 'privacy'
        ? 'Privacy & security'
        : 'Terms of use',
  );
</script>

<svelte:head><title>{title} | erase.to</title></svelte:head>
<main id="main" class="document-page" tabindex="-1">
  <header class="page-intro">
    <div>
      <p class="eyebrow">
        {page === 'about'
          ? 'The project'
          : page === 'privacy'
            ? 'Security model'
            : 'Operational rules'}
      </p>
      <h1>{title}</h1>
      <p class="intro">
        {page === 'about'
          ? 'An independent project by RedCamel, built for information that does not need a permanent home.'
          : page === 'privacy'
            ? 'What the service retains, what encryption protects, and where its limits are.'
            : 'Use the service responsibly and understand its temporary nature.'}
      </p>
    </div>
  </header>
  {#if page === 'about'}
    <section>
      <h2>The Project</h2>
      <p>
        erase.to is an ephemeral communication tool designed by RedCamel. It is built to be a
        client-encrypted handoff environment where the server keeps ciphertext in volatile RAM.
      </p>
      <p>
        I build and maintain this project myself. The idea is straightforward: sharing a message or
        a file should not require an account, a contact list, or a permanent record. I want erase.to
        to remain a small, useful tool that you can understand, inspect, and run yourself.
      </p>
      <p>
        Privacy is not a premium feature. This service is free, runs without ads, and uses no
        third-party CDNs. The application keeps no access logs or tracking profiles. Creation is
        protected through single-use Proof-of-Work (PoW) without IP-based visitor records.
      </p>
      <p>
        Your data is encrypted locally in the browser. Decryption happens on your device, with
        'No-Store' headers on sensitive responses. The stored package is removed on expiry or when
        its retrieval limit is reached. In single-use mode, removal happens before the first
        retrieval response. There are no persistent message records. See Privacy for the threat
        model and its limits.
      </p>
    </section>
    <section>
      <h2>Source Code</h2>
      <p>
        I publish the source because you should not have to take privacy claims on faith. The
        repository explains how encryption works in the browser, how the fragment key is handled,
        what the server stores, how single-use and expiry work, and which security headers are set.
      </p>
      <details class="technical-notes">
        <summary>A closer look at the implementation</summary>
        <p>
          The browser encrypts text and files with XChaCha20-Poly1305. An optional passphrase uses
          Argon2id without replacing the random link secret. A Rust service applies expiry,
          retrieval limits, and revocation through atomic operations in a non-persistent Valkey
          cache. The server has no content-decryption path.
        </p>
        <p>
          I keep the wire format, operational assumptions, and verification steps in the
          <a
            href="https://github.com/RedCamel1312/erase.to/blob/main/docs/README.md"
            target="_blank"
            rel="noopener noreferrer">technical documentation</a
          >. Start with the
          <a
            href="https://github.com/RedCamel1312/erase.to/blob/main/docs/threat-model.md"
            target="_blank"
            rel="noopener noreferrer">threat model</a
          >
          if you want to know where the protection ends, or the
          <a
            href="https://github.com/RedCamel1312/erase.to/blob/main/docs/protocol.md"
            target="_blank"
            rel="noopener noreferrer">protocol specification</a
          > if you want to inspect the implementation.
        </p>
        <p>
          The tests cover specific behavior; they are not an independent security audit. If you find
          something I missed, please report it privately through the contact below or
          <a
            href="https://github.com/RedCamel1312/erase.to/security/advisories/new"
            target="_blank"
            rel="noopener noreferrer">GitHub's private reporting form</a
          >.
        </p>
      </details>
      <p>
        <a href="https://github.com/RedCamel1312/erase.to" target="_blank" rel="noopener noreferrer"
          >github.com/RedCamel1312/erase.to ↗</a
        >
      </p>
    </section>
    <section>
      <h2>Support the Infrastructure</h2>
      <p>
        Operating a secure, reliable server environment and maintaining the domain name requires
        ongoing financial resources. I pay this out of my own pocket. If you value this tool and
        wish to support my work and the server costs, consider dropping some sats.
      </p>
      <span class="field-label">Bitcoin (BTC) Address</span><code class="identifier"
        >{btcAddress}</code
      ><button type="button" class="button secondary small" onclick={copyAddress}
        >Copy Bitcoin address</button
      >
      <p class="hint" role="status">{copyStatus}</p>
    </section>
    <section>
      <h2>Retrieval and retention</h2>
      <p>
        Expiry and the maximum retrieval count apply together. Opening a link checks availability
        without retrieving the encrypted content. A separate passphrase is verified locally before
        an authorized retrieval is requested.
      </p>
      <p>
        The server counts each retrieval before delivering the response. A connection failure may
        therefore use a retrieval without a successful reading. Downloaded files and clipboard
        copies are outside the service’s control.
      </p>
    </section>
    <section>
      <h2>Contact me</h2>
      <p>
        If you have a question, find a problem, or want to discuss the project, you can reach me on
        Session. Please use synthetic examples for bug reports and keep live private links out of
        public issues.
      </p>
      <span class="field-label">Session ID</span><code class="identifier"
        >05d142f0db75884b2b84d3647acd19090681d1fe5a58c40039e72b2c0f2215a16a</code
      >
    </section>
  {:else if page === 'privacy'}
    <section>
      <h2>What I can promise, and what I cannot</h2>
      <p>
        I run erase.to without accounts, advertising, or visitor tracking. The application is
        designed to keep encrypted packages only for the time they are needed. I also want to be
        clear about its limits: the browser, the host, and the way you share a link still matter.
        This page describes those boundaries alongside the protections.
      </p>
    </section>
    <section>
      <h2>Encryption and access are separate</h2>
      <p>
        A fresh 256-bit random secret is generated for each package. Content is encrypted with
        XChaCha20-Poly1305. Optional passphrases use Argon2id with fixed parameters: 64 MiB memory
        and three iterations. The random secret remains part of the key derivation even when a
        passphrase is used.
      </p>
      <p>
        Separate capabilities authorize metadata access, content retrieval, and sender revocation.
        The server stores their hashes. Cryptographic metadata and retention settings are
        authenticated as associated data. An incorrect passphrase is checked locally against the
        read-capability hash before any consuming request.
      </p>
      <p>
        The browser removes the identifier and secret from the visible URL immediately after
        capturing the fragment. It does not put them in browser storage or history state. HTTP
        requests do not include URL fragments, although the API necessarily uses the identifier to
        locate the encrypted package.
      </p>
    </section>
    <section>
      <h2>Temporary server state</h2>
      <p>
        The server retains ciphertext, its identifier, cryptographic header, expiry, remaining
        retrieval count, and hashed capabilities. It also maintains short-lived challenge and
        aggregate rate-limit state. It does not keep IP-based visitor profiles or application access
        logs.
      </p>
      <p>
        Packages are held in dedicated Valkey memory with disk persistence disabled. Expiry and
        retrieval limits both apply. A cache restart removes its contents; an application restart
        alone does not necessarily do so. Capacity limits reject new packages rather than silently
        evicting existing ones.
      </p>
      <p>
        Packages are padded to 4 KiB boundaries before encryption. Exact content lengths, names, and
        MIME types are encrypted; the overall size range remains visible. Deletion means removal
        from active storage, not a verifiable physical overwrite of every memory copy.
      </p>
    </section>
    <section>
      <h2>Browser data and local clearing</h2>
      <p>
        There are no accounts, cookies, analytics, remote fonts, or service workers. The theme
        follows your browser or system by default, with light as the fallback. An explicit light or
        dark preference may persist in local storage; choosing System removes that preference.
        Message text, keys, passphrases, files, and links are never intentionally stored there.
        Sensitive responses use no-store headers.
      </p>
      <p>
        Local content and pending contexts clear after five minutes of inactivity, with a warning 30
        seconds beforehand. Visible decrypted content also clears when its tab becomes hidden.
        Clearing terminates cryptographic workers, aborts network requests, and revokes temporary
        download URLs. It does not change server expiry or erase copies made elsewhere.
      </p>
      <p>
        Downloaded files, clipboard history, screenshots, extensions, browser memory,
        operating-system swap, and snapshots remain outside this page’s control. JavaScript cannot
        promise physical memory erasure.
      </p>
    </section>
    {#if onionUrl}<section>
        <h2>Onion service</h2>
        <p>
          The service is also available through <a
            href={onionUrl}
            target="_blank"
            rel="noopener noreferrer">its onion address</a
          > in Tor Browser. Tor changes which parties can observe a connection’s source address. It does
          not protect a compromised device, prevent recipients from copying content, or eliminate traffic-correlation
          risks.
        </p>
      </section>{/if}
    <section>
      <h2>Limits of the model</h2>
      <p>
        The full link grants access unless an additional passphrase is required. A recipient can
        keep a copy. Use trusted channels, share any passphrase separately, and open files only from
        senders you trust.
      </p>
      <p>
        The browser, delivered JavaScript, TLS connection, and running server must be trustworthy.
        Compromising any of them can defeat these protections. Network operators and hosting
        infrastructure can still observe connection metadata. The service is not an anonymity
        network.
      </p>
      <p>
        Volatile storage also depends on deployment controls for swap, dumps, backups, and provider
        memory snapshots. These assumptions and the absence of an independent audit should be
        considered when deciding what to share.
      </p>
    </section>
  {:else}
    <section>
      <h2>Responsible use</h2>
      <p>
        Use erase.to only for material you are entitled to share and for lawful purposes. Do not use
        it to distribute malware, exploit or harass others, or disrupt services. You are responsible
        for your content and how you share access to it.
      </p>
    </section>
    <section>
      <h2>Expiry, retrieval, and recovery</h2>
      <p>
        Packages may become unavailable through expiry, exhausted retrieval limits, sender
        revocation, cache restart, or service failure. A retrieval counts before the response is
        delivered, and a connection failure may consume it.
      </p>
      <p>
        I cannot recover a missing package, lost link, or passphrase. Do not use this service as the
        only repository for important data. Recipients may retain copies outside the service.
      </p>
    </section>
    <section>
      <h2>Security and availability</h2>
      <p>
        The protections and limitations are described in the <a href="/privacy">security model</a>.
        The service does not promise uninterrupted availability, anonymity, or protection from
        compromised devices or infrastructure. Capacity and abuse controls can reject requests.
      </p>
      <p>These descriptions do not remove rights or obligations that apply under relevant law.</p>
    </section>
    <section>
      <h2>Contact</h2>
      <p>
        For service, abuse, and security reports, use the contact information on the <a
          href="/about">project page</a
        >. Send only the information needed to explain the issue.
      </p>
    </section>
  {/if}
</main>

<style>
  .technical-notes {
    margin-top: 1.2rem;
    border: 1px solid var(--line);
    border-radius: 5px;
    padding: 0.85rem 1rem;
  }
  .technical-notes summary {
    cursor: pointer;
    font-size: 0.82rem;
    font-weight: 600;
  }
  .technical-notes[open] summary {
    margin-bottom: 1rem;
  }
  .technical-notes summary:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 4px;
  }
</style>
