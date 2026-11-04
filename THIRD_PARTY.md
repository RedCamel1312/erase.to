# Third-party software and notices

The erase.to application source is licensed under the [MIT License](LICENSE), with its project copyright retained. Dependencies keep their own licenses and copyright notices. This document records the pinned production JavaScript graph, the normal/build Rust dependency closure and selected deployment components used by this source tree; it is not a replacement for any upstream license.

The unmodified notice files linked below are included with the repository. Preserve the relevant notices when distributing browser bundles, server binaries or other artifacts. An `OR` expression offers alternatives under the upstream terms; an `AND` expression includes multiple requirements. The tables preserve package metadata rather than relabeling every dependency as MIT.

## Scope and reproducibility

- JavaScript inventory: `pnpm licenses list --prod --json` after `pnpm install --frozen-lockfile`, using `pnpm-lock.yaml`. A production dependency graph can contain compiler helpers that are not present in the final browser runtime. The table is deliberately conservative and is not a bundle-size report.
- Rust inventory: `cargo metadata --locked --format-version 1 --manifest-path server/Cargo.toml`, traversing the root package's normal and build dependency edges while excluding development-only edges. Versions come from `server/Cargo.lock`. Platform branches are included conservatively; a particular target can use fewer crates.
- Rust notice files were copied from the downloaded source packages for those exact locked versions. The machine-readable [JavaScript inventory](docs/licenses/npm/inventory.json) and [Rust inventory](docs/licenses/rust/inventory.json) contain no build-host paths.
- Development-only tools, the operating system, browser, reverse proxy, Valkey and Tor are separately installed software. Their licenses are not replaced by this application inventory. The NGINX relay's core notice is additionally included below. A container, operating-system image or bundled-tool release must also preserve the notices for what it actually distributes.

Update both inventories and copied notices when a lockfile changes. Regenerate the dependency graph from the new lockfile, inspect new or changed license expressions, and copy the source packages' actual notice files. Package metadata alone is not a substitute for those texts.

## JavaScript production dependency graph

| Package | Version | Declared license | Included notices |
| --- | --- | --- | --- |
| [@jridgewell/gen-mapping](https://github.com/jridgewell/sourcemaps/tree/main/packages/gen-mapping) | 0.3.13 | MIT | [LICENSE](docs/licenses/npm/jridgewell__gen-mapping-0.3.13/LICENSE) |
| [@jridgewell/remapping](https://github.com/jridgewell/sourcemaps/tree/main/packages/remapping) | 2.3.5 | MIT | [LICENSE](docs/licenses/npm/jridgewell__remapping-2.3.5/LICENSE) |
| [@jridgewell/resolve-uri](https://github.com/jridgewell/resolve-uri#readme) | 3.1.2 | MIT | [LICENSE](docs/licenses/npm/jridgewell__resolve-uri-3.1.2/LICENSE) |
| [@jridgewell/sourcemap-codec](https://github.com/jridgewell/sourcemaps/tree/main/packages/sourcemap-codec) | 1.6.0 | MIT | [LICENSE](docs/licenses/npm/jridgewell__sourcemap-codec-1.6.0/LICENSE) |
| [@jridgewell/trace-mapping](https://github.com/jridgewell/sourcemaps/tree/main/packages/trace-mapping) | 0.3.31 | MIT | [LICENSE](docs/licenses/npm/jridgewell__trace-mapping-0.3.31/LICENSE) |
| [@sveltejs/acorn-typescript](https://github.com/sveltejs/acorn-typescript#readme) | 1.0.13 | MIT | [LICENSE.md](docs/licenses/npm/sveltejs__acorn-typescript-1.0.13/LICENSE.md) |
| [@types/estree](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/estree) | 1.0.10 | MIT | [LICENSE](docs/licenses/npm/types__estree-1.0.10/LICENSE) |
| [acorn](https://github.com/acornjs/acorn) | 8.19.0 | MIT | [LICENSE](docs/licenses/npm/acorn-8.19.0/LICENSE) |
| [aria-query](https://github.com/A11yance/aria-query#readme) | 5.3.1 | Apache-2.0 | [LICENSE](docs/licenses/npm/aria-query-5.3.1/LICENSE) |
| [axobject-query](https://github.com/A11yance/axobject-query#readme) | 4.1.0 | Apache-2.0 | [LICENSE](docs/licenses/npm/axobject-query-4.1.0/LICENSE) |
| [clsx](https://github.com/lukeed/clsx#readme) | 2.1.1 | MIT | [license](docs/licenses/npm/clsx-2.1.1/license) |
| [devalue](https://github.com/sveltejs/devalue#readme) | 5.9.4 | MIT | [LICENSE](docs/licenses/npm/devalue-5.9.4/LICENSE) |
| [esm-env](https://github.com/benmccann/esm-env) | 1.2.2 | MIT | [LICENSE](docs/licenses/npm/esm-env-1.2.2/LICENSE) |
| [esrap](https://github.com/sveltejs/esrap#readme) | 2.4.0 | MIT | [LICENSE](docs/licenses/npm/esrap-2.4.0/LICENSE) |
| [is-reference](https://github.com/Rich-Harris/is-reference#readme) | 3.0.3 | MIT | [README.md](docs/licenses/npm/is-reference-3.0.3/README.md), [package.json](docs/licenses/npm/is-reference-3.0.3/package.json) |
| [libsodium-sumo](https://github.com/jedisct1/libsodium.js) | 0.8.4 | ISC | [LICENSE](docs/licenses/npm/libsodium-sumo-0.8.4/LICENSE) |
| [libsodium-wrappers-sumo](https://github.com/jedisct1/libsodium.js) | 0.8.4 | ISC | [LICENSE](docs/licenses/npm/libsodium-wrappers-sumo-0.8.4/LICENSE) |
| [locate-character](https://gitlab.com/Rich-Harris/locate-character#README) | 3.0.0 | MIT | [README.md](docs/licenses/npm/locate-character-3.0.0/README.md), [package.json](docs/licenses/npm/locate-character-3.0.0/package.json) |
| [magic-string](https://github.com/Rich-Harris/magic-string#readme) | 0.30.21 | MIT | [LICENSE](docs/licenses/npm/magic-string-0.30.21/LICENSE) |
| [svelte](https://svelte.dev) | 5.57.3 | MIT | [LICENSE.md](docs/licenses/npm/svelte-5.57.3/LICENSE.md) |
| [zimmerframe](https://github.com/sveltejs/zimmerframe#readme) | 1.1.5 | MIT | [LICENSE](docs/licenses/npm/zimmerframe-1.1.5/LICENSE) |

The published packages `is-reference 3.0.3` and `locate-character 3.0.0` contain MIT declarations but no standalone license files. Their original READMEs and package metadata are preserved above. No copyright statement or additional upstream license file has been invented to fill those packaging gaps.

### Native cryptography included by the JavaScript package

`libsodium-sumo` includes the compiled native libsodium implementation. The installed wrapper reports `sodium_version_string()` as `1.0.22`; the wrapper package version is separately `0.8.4`. Its upstream [ISC notice](docs/licenses/native/libsodium-1.0.22/LICENSE) is preserved in addition to the JavaScript package notices. The source of that additional notice is the [libsodium 1.0.22 tag](https://github.com/jedisct1/libsodium/blob/1.0.22/LICENSE).

## Optional container relay

The supplied Compose configuration uses the official `nginx:1.30.6-alpine` image as a separate HTTP relay, pinned by digest in `compose.yaml`. NGINX is licensed under BSD-2-Clause. The unmodified [NGINX 1.30.6 notice](docs/licenses/native/nginx-1.30.6/LICENSE) is copied from the [official release-1.30.6 source tag](https://github.com/nginx/nginx/blob/release-1.30.6/LICENSE), retaining both upstream copyright statements and all terms.

This notice covers NGINX itself. The Alpine base image and other packages in that image retain their own notices and are not represented as BSD-2-Clause by this entry. Preserve the official image's package and license information when distributing a modified relay image; updating its pinned version also requires reviewing this notice.

## Locally patched development dependency

The Svelte build plugin's `deepmerge@4.3.1` dependency has a small repository-maintained security patch. It is outside the production JavaScript graph above. Its unchanged [MIT license notice](docs/licenses/npm/deepmerge-4.3.1/license.txt) is preserved alongside [the patch](patches/deepmerge@4.3.1.patch); the upstream package version and attribution remain intact. See [the development guide](docs/development.md#patched-build-dependency) for the affected advisory, exact scope, tests and removal criteria.

## Rust normal and build dependencies

This closure includes 126 package/version entries. Build-time crates appear because they contribute to creating the distributed binary. Some packages are present at more than one version, and are listed separately.

| Crate | Version | Declared license | Included notices |
| --- | --- | --- | --- |
| [arcstr](https://github.com/thomcc/arcstr) | 1.2.0 | Apache-2.0 OR MIT OR Zlib | [LICENSE-APACHE](docs/licenses/rust/arcstr-1.2.0/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/arcstr-1.2.0/LICENSE-MIT), [LICENSE-ZLIB](docs/licenses/rust/arcstr-1.2.0/LICENSE-ZLIB) |
| [async-lock](https://github.com/smol-rs/async-lock) | 3.5.0 | Apache-2.0 OR MIT | [LICENSE-APACHE](docs/licenses/rust/async-lock-3.5.0/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/async-lock-3.5.0/LICENSE-MIT) |
| [atomic-waker](https://github.com/smol-rs/atomic-waker) | 1.1.2 | Apache-2.0 OR MIT | [LICENSE-APACHE](docs/licenses/rust/atomic-waker-1.1.2/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/atomic-waker-1.1.2/LICENSE-MIT), [LICENSE-THIRD-PARTY](docs/licenses/rust/atomic-waker-1.1.2/LICENSE-THIRD-PARTY) |
| [axum](https://github.com/tokio-rs/axum) | 0.8.9 | MIT | [LICENSE](docs/licenses/rust/axum-0.8.9/LICENSE) |
| [axum-core](https://github.com/tokio-rs/axum) | 0.5.6 | MIT | [LICENSE](docs/licenses/rust/axum-core-0.5.6/LICENSE) |
| [base64](https://github.com/marshallpierce/rust-base64) | 0.22.1 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/base64-0.22.1/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/base64-0.22.1/LICENSE-MIT) |
| [base64](https://github.com/marshallpierce/rust-base64) | 0.23.1 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/base64-0.23.1/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/base64-0.23.1/LICENSE-MIT) |
| [bitflags](https://github.com/bitflags/bitflags) | 2.13.2 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/bitflags-2.13.2/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/bitflags-2.13.2/LICENSE-MIT) |
| [block-buffer](https://github.com/RustCrypto/utils) | 0.10.4 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/block-buffer-0.10.4/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/block-buffer-0.10.4/LICENSE-MIT) |
| [bytes](https://github.com/tokio-rs/bytes) | 1.12.1 | MIT | [LICENSE](docs/licenses/rust/bytes-1.12.1/LICENSE) |
| [cc](https://github.com/rust-lang/cc-rs) | 1.11.0 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/cc-1.11.0/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/cc-1.11.0/LICENSE-MIT) |
| [cfg-if](https://github.com/rust-lang/cfg-if) | 1.0.5 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/cfg-if-1.0.5/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/cfg-if-1.0.5/LICENSE-MIT) |
| [combine](https://github.com/Marwes/combine) | 4.6.9 | MIT | [LICENSE](docs/licenses/rust/combine-4.6.9/LICENSE) |
| [cpufeatures](https://github.com/RustCrypto/utils) | 0.2.17 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/cpufeatures-0.2.17/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/cpufeatures-0.2.17/LICENSE-MIT) |
| [crypto-common](https://github.com/RustCrypto/traits) | 0.1.7 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/crypto-common-0.1.7/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/crypto-common-0.1.7/LICENSE-MIT) |
| [digest](https://github.com/RustCrypto/traits) | 0.10.7 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/digest-0.10.7/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/digest-0.10.7/LICENSE-MIT) |
| [displaydoc](https://github.com/yaahc/displaydoc) | 0.2.7 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/displaydoc-0.2.7/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/displaydoc-0.2.7/LICENSE-MIT) |
| [errno](https://github.com/lambda-fairy/rust-errno) | 0.3.14 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/errno-0.3.14/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/errno-0.3.14/LICENSE-MIT) |
| [event-listener](https://github.com/smol-rs/event-listener) | 5.4.2 | Apache-2.0 OR MIT | [LICENSE-APACHE](docs/licenses/rust/event-listener-5.4.2/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/event-listener-5.4.2/LICENSE-MIT) |
| [event-listener-strategy](https://github.com/smol-rs/event-listener-strategy) | 0.5.4 | Apache-2.0 OR MIT | [LICENSE-APACHE](docs/licenses/rust/event-listener-strategy-0.5.4/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/event-listener-strategy-0.5.4/LICENSE-MIT) |
| [find-msvc-tools](https://github.com/rust-lang/cc-rs) | 0.1.15 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/find-msvc-tools-0.1.15/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/find-msvc-tools-0.1.15/LICENSE-MIT) |
| [form_urlencoded](https://github.com/servo/rust-url) | 1.2.2 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/form_urlencoded-1.2.2/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/form_urlencoded-1.2.2/LICENSE-MIT) |
| [futures-channel](https://github.com/rust-lang/futures-rs) | 0.3.34 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/futures-channel-0.3.34/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/futures-channel-0.3.34/LICENSE-MIT) |
| [futures-core](https://github.com/rust-lang/futures-rs) | 0.3.34 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/futures-core-0.3.34/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/futures-core-0.3.34/LICENSE-MIT) |
| [futures-sink](https://github.com/rust-lang/futures-rs) | 0.3.34 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/futures-sink-0.3.34/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/futures-sink-0.3.34/LICENSE-MIT) |
| [futures-task](https://github.com/rust-lang/futures-rs) | 0.3.34 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/futures-task-0.3.34/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/futures-task-0.3.34/LICENSE-MIT) |
| [futures-util](https://github.com/rust-lang/futures-rs) | 0.3.34 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/futures-util-0.3.34/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/futures-util-0.3.34/LICENSE-MIT) |
| [generic-array](https://github.com/fizyk20/generic-array.git) | 0.14.7 | MIT | [LICENSE](docs/licenses/rust/generic-array-0.14.7/LICENSE) |
| [getrandom](https://github.com/rust-random/getrandom) | 0.2.17 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/getrandom-0.2.17/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/getrandom-0.2.17/LICENSE-MIT) |
| [hex](https://github.com/KokaKiwi/rust-hex) | 0.4.3 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/hex-0.4.3/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/hex-0.4.3/LICENSE-MIT) |
| [http](https://github.com/hyperium/http) | 1.5.0 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/http-1.5.0/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/http-1.5.0/LICENSE-MIT) |
| [http-body](https://github.com/hyperium/http-body) | 1.1.0 | MIT | [LICENSE](docs/licenses/rust/http-body-1.1.0/LICENSE) |
| [http-body-util](https://github.com/hyperium/http-body) | 0.1.5 | MIT | [LICENSE](docs/licenses/rust/http-body-util-0.1.5/LICENSE) |
| [http-range-header](https://github.com/MarcusGrass/parse-range-headers) | 0.4.2 | MIT | [LICENSE](docs/licenses/rust/http-range-header-0.4.2/LICENSE) |
| [httparse](https://github.com/seanmonstar/httparse) | 1.10.1 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/httparse-1.10.1/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/httparse-1.10.1/LICENSE-MIT) |
| [httpdate](https://github.com/pyfisch/httpdate) | 1.0.3 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/httpdate-1.0.3/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/httpdate-1.0.3/LICENSE-MIT) |
| [hyper](https://github.com/hyperium/hyper) | 1.12.0 | MIT | [LICENSE](docs/licenses/rust/hyper-1.12.0/LICENSE) |
| [hyper-util](https://github.com/hyperium/hyper-util) | 0.1.21 | MIT | [LICENSE](docs/licenses/rust/hyper-util-0.1.21/LICENSE) |
| [icu_collections](https://github.com/unicode-org/icu4x) | 2.1.1 | Unicode-3.0 | [LICENSE](docs/licenses/rust/icu_collections-2.1.1/LICENSE) |
| [icu_locale_core](https://github.com/unicode-org/icu4x) | 2.1.1 | Unicode-3.0 | [LICENSE](docs/licenses/rust/icu_locale_core-2.1.1/LICENSE) |
| [icu_normalizer](https://github.com/unicode-org/icu4x) | 2.1.1 | Unicode-3.0 | [LICENSE](docs/licenses/rust/icu_normalizer-2.1.1/LICENSE) |
| [icu_normalizer_data](https://github.com/unicode-org/icu4x) | 2.1.1 | Unicode-3.0 | [LICENSE](docs/licenses/rust/icu_normalizer_data-2.1.1/LICENSE) |
| [icu_properties](https://github.com/unicode-org/icu4x) | 2.1.2 | Unicode-3.0 | [LICENSE](docs/licenses/rust/icu_properties-2.1.2/LICENSE) |
| [icu_properties_data](https://github.com/unicode-org/icu4x) | 2.1.2 | Unicode-3.0 | [LICENSE](docs/licenses/rust/icu_properties_data-2.1.2/LICENSE) |
| [icu_provider](https://github.com/unicode-org/icu4x) | 2.1.1 | Unicode-3.0 | [LICENSE](docs/licenses/rust/icu_provider-2.1.1/LICENSE) |
| [idna](https://github.com/servo/rust-url/) | 1.1.0 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/idna-1.1.0/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/idna-1.1.0/LICENSE-MIT) |
| [idna_adapter](https://github.com/hsivonen/idna_adapter) | 1.2.1 | Apache-2.0 OR MIT | [LICENSE-APACHE](docs/licenses/rust/idna_adapter-1.2.1/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/idna_adapter-1.2.1/LICENSE-MIT) |
| [ipnet](https://github.com/krisprice/ipnet) | 2.12.2 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/ipnet-2.12.2/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/ipnet-2.12.2/LICENSE-MIT) |
| [itoa](https://github.com/dtolnay/itoa) | 1.0.18 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/itoa-1.0.18/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/itoa-1.0.18/LICENSE-MIT) |
| [libc](https://github.com/rust-lang/libc) | 0.2.191 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/libc-0.2.191/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/libc-0.2.191/LICENSE-MIT) |
| [litemap](https://github.com/unicode-org/icu4x) | 0.8.3 | Unicode-3.0 | [LICENSE](docs/licenses/rust/litemap-0.8.3/LICENSE) |
| [log](https://github.com/rust-lang/log) | 0.4.35 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/log-0.4.35/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/log-0.4.35/LICENSE-MIT) |
| [matchit](https://github.com/ibraheemdev/matchit) | 0.8.4 | MIT AND BSD-3-Clause | [LICENSE](docs/licenses/rust/matchit-0.8.4/LICENSE), [LICENSE.httprouter](docs/licenses/rust/matchit-0.8.4/LICENSE.httprouter) |
| [memchr](https://github.com/BurntSushi/memchr) | 2.8.3 | Unlicense OR MIT | [COPYING](docs/licenses/rust/memchr-2.8.3/COPYING), [LICENSE-MIT](docs/licenses/rust/memchr-2.8.3/LICENSE-MIT) |
| [mime](https://github.com/hyperium/mime) | 0.3.17 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/mime-0.3.17/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/mime-0.3.17/LICENSE-MIT) |
| [mime_guess](https://github.com/abonander/mime_guess) | 2.0.5 | MIT | [LICENSE](docs/licenses/rust/mime_guess-2.0.5/LICENSE) |
| [mio](https://github.com/tokio-rs/mio) | 1.2.4 | MIT | [LICENSE](docs/licenses/rust/mio-1.2.4/LICENSE) |
| [once_cell](https://github.com/matklad/once_cell) | 1.21.4 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/once_cell-1.21.4/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/once_cell-1.21.4/LICENSE-MIT) |
| [parking](https://github.com/smol-rs/parking) | 2.2.1 | Apache-2.0 OR MIT | [LICENSE-APACHE](docs/licenses/rust/parking-2.2.1/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/parking-2.2.1/LICENSE-MIT), [LICENSE-THIRD-PARTY](docs/licenses/rust/parking-2.2.1/LICENSE-THIRD-PARTY) |
| [percent-encoding](https://github.com/servo/rust-url/) | 2.3.2 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/percent-encoding-2.3.2/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/percent-encoding-2.3.2/LICENSE-MIT) |
| [pin-project-lite](https://github.com/taiki-e/pin-project-lite) | 0.2.17 | Apache-2.0 OR MIT | [LICENSE-APACHE](docs/licenses/rust/pin-project-lite-0.2.17/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/pin-project-lite-0.2.17/LICENSE-MIT) |
| [potential_utf](https://github.com/unicode-org/icu4x) | 0.1.6 | Unicode-3.0 | [LICENSE](docs/licenses/rust/potential_utf-0.1.6/LICENSE) |
| [proc-macro2](https://github.com/dtolnay/proc-macro2) | 1.0.107 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/proc-macro2-1.0.107/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/proc-macro2-1.0.107/LICENSE-MIT) |
| [quote](https://github.com/dtolnay/quote) | 1.0.47 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/quote-1.0.47/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/quote-1.0.47/LICENSE-MIT) |
| [redis](https://github.com/redis-rs/redis-rs) | 1.2.2 | BSD-3-Clause | [LICENSE](docs/licenses/rust/redis-1.2.2/LICENSE) |
| [ring](https://github.com/briansmith/ring) | 0.17.14 | Apache-2.0 AND ISC | [LICENSE](docs/licenses/rust/ring-0.17.14/LICENSE), [LICENSE-BoringSSL](docs/licenses/rust/ring-0.17.14/LICENSE-BoringSSL), [LICENSE-other-bits](docs/licenses/rust/ring-0.17.14/LICENSE-other-bits), [third_party/fiat/LICENSE](docs/licenses/rust/ring-0.17.14/third_party/fiat/LICENSE) |
| [ryu](https://github.com/dtolnay/ryu) | 1.0.23 | Apache-2.0 OR BSL-1.0 | [LICENSE-APACHE](docs/licenses/rust/ryu-1.0.23/LICENSE-APACHE), [LICENSE-BOOST](docs/licenses/rust/ryu-1.0.23/LICENSE-BOOST) |
| [serde](https://github.com/serde-rs/serde) | 1.0.229 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/serde-1.0.229/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/serde-1.0.229/LICENSE-MIT) |
| [serde_core](https://github.com/serde-rs/serde) | 1.0.229 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/serde_core-1.0.229/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/serde_core-1.0.229/LICENSE-MIT) |
| [serde_derive](https://github.com/serde-rs/serde) | 1.0.229 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/serde_derive-1.0.229/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/serde_derive-1.0.229/LICENSE-MIT) |
| [serde_json](https://github.com/serde-rs/json) | 1.0.154 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/serde_json-1.0.154/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/serde_json-1.0.154/LICENSE-MIT) |
| [serde_path_to_error](https://github.com/dtolnay/path-to-error) | 0.1.20 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/serde_path_to_error-0.1.20/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/serde_path_to_error-0.1.20/LICENSE-MIT) |
| [serde_urlencoded](https://github.com/nox/serde_urlencoded) | 0.7.1 | MIT/Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/serde_urlencoded-0.7.1/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/serde_urlencoded-0.7.1/LICENSE-MIT) |
| [sha2](https://github.com/RustCrypto/hashes) | 0.10.9 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/sha2-0.10.9/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/sha2-0.10.9/LICENSE-MIT) |
| [shlex](https://github.com/comex/rust-shlex) | 2.0.1 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/shlex-2.0.1/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/shlex-2.0.1/LICENSE-MIT) |
| [signal-hook-registry](https://github.com/vorner/signal-hook) | 1.4.8 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/signal-hook-registry-1.4.8/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/signal-hook-registry-1.4.8/LICENSE-MIT) |
| [slab](https://github.com/tokio-rs/slab) | 0.4.12 | MIT | [LICENSE](docs/licenses/rust/slab-0.4.12/LICENSE) |
| [smallvec](https://github.com/servo/rust-smallvec) | 1.16.4 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/smallvec-1.16.4/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/smallvec-1.16.4/LICENSE-MIT) |
| [socket2](https://github.com/rust-lang/socket2) | 0.6.5 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/socket2-0.6.5/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/socket2-0.6.5/LICENSE-MIT) |
| [stable_deref_trait](https://github.com/storyyeller/stable_deref_trait) | 1.2.1 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/stable_deref_trait-1.2.1/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/stable_deref_trait-1.2.1/LICENSE-MIT) |
| [syn](https://github.com/dtolnay/syn) | 3.0.9 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/syn-3.0.9/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/syn-3.0.9/LICENSE-MIT) |
| [sync_wrapper](https://github.com/Actyx/sync_wrapper) | 1.0.2 | Apache-2.0 | [LICENSE](docs/licenses/rust/sync_wrapper-1.0.2/LICENSE) |
| [synstructure](https://github.com/mystor/synstructure) | 0.14.0 | MIT | [LICENSE](docs/licenses/rust/synstructure-0.14.0/LICENSE) |
| [tinystr](https://github.com/unicode-org/icu4x) | 0.8.5 | Unicode-3.0 | [LICENSE](docs/licenses/rust/tinystr-0.8.5/LICENSE) |
| [tokio](https://github.com/tokio-rs/tokio) | 1.54.1 | MIT | [LICENSE](docs/licenses/rust/tokio-1.54.1/LICENSE) |
| [tokio-macros](https://github.com/tokio-rs/tokio) | 2.7.2 | MIT | [LICENSE](docs/licenses/rust/tokio-macros-2.7.2/LICENSE) |
| [tokio-util](https://github.com/tokio-rs/tokio) | 0.7.20 | MIT | [LICENSE](docs/licenses/rust/tokio-util-0.7.20/LICENSE) |
| [tower](https://github.com/tower-rs/tower) | 0.5.3 | MIT | [LICENSE](docs/licenses/rust/tower-0.5.3/LICENSE) |
| [tower-http](https://github.com/tower-rs/tower-http) | 0.6.11 | MIT | [LICENSE](docs/licenses/rust/tower-http-0.6.11/LICENSE) |
| [tower-layer](https://github.com/tower-rs/tower) | 0.3.3 | MIT | [LICENSE](docs/licenses/rust/tower-layer-0.3.3/LICENSE) |
| [tower-service](https://github.com/tower-rs/tower) | 0.3.3 | MIT | [LICENSE](docs/licenses/rust/tower-service-0.3.3/LICENSE) |
| [tracing](https://github.com/tokio-rs/tracing) | 0.1.44 | MIT | [LICENSE](docs/licenses/rust/tracing-0.1.44/LICENSE) |
| [tracing-core](https://github.com/tokio-rs/tracing) | 0.1.36 | MIT | [LICENSE](docs/licenses/rust/tracing-core-0.1.36/LICENSE), [src/spin/LICENSE](docs/licenses/rust/tracing-core-0.1.36/src/spin/LICENSE) |
| [try-lock](https://github.com/seanmonstar/try-lock) | 0.2.5 | MIT | [LICENSE](docs/licenses/rust/try-lock-0.2.5/LICENSE) |
| [typenum](https://github.com/paholg/typenum) | 1.20.1 | MIT OR Apache-2.0 | [LICENSE](docs/licenses/rust/typenum-1.20.1/LICENSE), [LICENSE-APACHE](docs/licenses/rust/typenum-1.20.1/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/typenum-1.20.1/LICENSE-MIT) |
| [unicase](https://github.com/seanmonstar/unicase) | 2.10.0 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/unicase-2.10.0/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/unicase-2.10.0/LICENSE-MIT) |
| [unicode-ident](https://github.com/dtolnay/unicode-ident) | 1.0.27 | (MIT OR Apache-2.0) AND Unicode-3.0 | [LICENSE-APACHE](docs/licenses/rust/unicode-ident-1.0.27/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/unicode-ident-1.0.27/LICENSE-MIT), [LICENSE-UNICODE](docs/licenses/rust/unicode-ident-1.0.27/LICENSE-UNICODE) |
| [untrusted](https://github.com/briansmith/untrusted) | 0.9.0 | ISC | [LICENSE.txt](docs/licenses/rust/untrusted-0.9.0/LICENSE.txt) |
| [url](https://github.com/servo/rust-url) | 2.5.8 | MIT OR Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/url-2.5.8/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/url-2.5.8/LICENSE-MIT) |
| [utf8_iter](https://github.com/hsivonen/utf8_iter) | 1.1.0 | Apache-2.0 OR MIT | [COPYRIGHT](docs/licenses/rust/utf8_iter-1.1.0/COPYRIGHT), [LICENSE-APACHE](docs/licenses/rust/utf8_iter-1.1.0/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/utf8_iter-1.1.0/LICENSE-MIT) |
| [utf_types](https://github.com/hsivonen/utf_types) | 1.0.0 | Apache-2.0 OR MIT | [COPYRIGHT](docs/licenses/rust/utf_types-1.0.0/COPYRIGHT), [LICENSE-APACHE](docs/licenses/rust/utf_types-1.0.0/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/utf_types-1.0.0/LICENSE-MIT) |
| [version_check](https://github.com/SergioBenitez/version_check) | 0.9.5 | MIT/Apache-2.0 | [LICENSE-APACHE](docs/licenses/rust/version_check-0.9.5/LICENSE-APACHE), [LICENSE-MIT](docs/licenses/rust/version_check-0.9.5/LICENSE-MIT) |
| [want](https://github.com/seanmonstar/want) | 0.3.2 | MIT | [LICENSE](docs/licenses/rust/want-0.3.2/LICENSE) |
| [wasi](https://github.com/bytecodealliance/wasi) | 0.11.1+wasi-snapshot-preview1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | [LICENSE-APACHE](docs/licenses/rust/wasi-0.11.1+wasi-snapshot-preview1/LICENSE-APACHE), [LICENSE-Apache-2.0_WITH_LLVM-exception](docs/licenses/rust/wasi-0.11.1+wasi-snapshot-preview1/LICENSE-Apache-2.0_WITH_LLVM-exception), [LICENSE-MIT](docs/licenses/rust/wasi-0.11.1+wasi-snapshot-preview1/LICENSE-MIT) |
| [windows-link](https://github.com/microsoft/windows-rs) | 0.2.1 | MIT OR Apache-2.0 | [license-apache-2.0](docs/licenses/rust/windows-link-0.2.1/license-apache-2.0), [license-mit](docs/licenses/rust/windows-link-0.2.1/license-mit) |
| [windows-sys](https://github.com/microsoft/windows-rs) | 0.52.0 | MIT OR Apache-2.0 | [license-apache-2.0](docs/licenses/rust/windows-sys-0.52.0/license-apache-2.0), [license-mit](docs/licenses/rust/windows-sys-0.52.0/license-mit) |
| [windows-sys](https://github.com/microsoft/windows-rs) | 0.61.2 | MIT OR Apache-2.0 | [license-apache-2.0](docs/licenses/rust/windows-sys-0.61.2/license-apache-2.0), [license-mit](docs/licenses/rust/windows-sys-0.61.2/license-mit) |
| [windows-targets](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | [license-apache-2.0](docs/licenses/rust/windows-targets-0.52.6/license-apache-2.0), [license-mit](docs/licenses/rust/windows-targets-0.52.6/license-mit) |
| [windows_aarch64_gnullvm](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | [license-apache-2.0](docs/licenses/rust/windows_aarch64_gnullvm-0.52.6/license-apache-2.0), [license-mit](docs/licenses/rust/windows_aarch64_gnullvm-0.52.6/license-mit) |
| [windows_aarch64_msvc](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | [license-apache-2.0](docs/licenses/rust/windows_aarch64_msvc-0.52.6/license-apache-2.0), [license-mit](docs/licenses/rust/windows_aarch64_msvc-0.52.6/license-mit) |
| [windows_i686_gnu](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | [license-apache-2.0](docs/licenses/rust/windows_i686_gnu-0.52.6/license-apache-2.0), [license-mit](docs/licenses/rust/windows_i686_gnu-0.52.6/license-mit) |
| [windows_i686_gnullvm](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | [license-apache-2.0](docs/licenses/rust/windows_i686_gnullvm-0.52.6/license-apache-2.0), [license-mit](docs/licenses/rust/windows_i686_gnullvm-0.52.6/license-mit) |
| [windows_i686_msvc](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | [license-apache-2.0](docs/licenses/rust/windows_i686_msvc-0.52.6/license-apache-2.0), [license-mit](docs/licenses/rust/windows_i686_msvc-0.52.6/license-mit) |
| [windows_x86_64_gnu](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | [license-apache-2.0](docs/licenses/rust/windows_x86_64_gnu-0.52.6/license-apache-2.0), [license-mit](docs/licenses/rust/windows_x86_64_gnu-0.52.6/license-mit) |
| [windows_x86_64_gnullvm](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | [license-apache-2.0](docs/licenses/rust/windows_x86_64_gnullvm-0.52.6/license-apache-2.0), [license-mit](docs/licenses/rust/windows_x86_64_gnullvm-0.52.6/license-mit) |
| [windows_x86_64_msvc](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | [license-apache-2.0](docs/licenses/rust/windows_x86_64_msvc-0.52.6/license-apache-2.0), [license-mit](docs/licenses/rust/windows_x86_64_msvc-0.52.6/license-mit) |
| [writeable](https://github.com/unicode-org/icu4x) | 0.6.4 | Unicode-3.0 | [LICENSE](docs/licenses/rust/writeable-0.6.4/LICENSE) |
| [xxhash-rust](https://github.com/DoumanAsh/xxhash-rust) | 0.8.19 | BSL-1.0 | [LICENSE](docs/licenses/rust/xxhash-rust-0.8.19/LICENSE) |
| [yoke](https://github.com/unicode-org/icu4x) | 0.8.4 | Unicode-3.0 | [LICENSE](docs/licenses/rust/yoke-0.8.4/LICENSE) |
| [yoke-derive](https://github.com/unicode-org/icu4x) | 0.8.4 | Unicode-3.0 | [LICENSE](docs/licenses/rust/yoke-derive-0.8.4/LICENSE) |
| [zerofrom](https://github.com/unicode-org/icu4x) | 0.1.8 | Unicode-3.0 | [LICENSE](docs/licenses/rust/zerofrom-0.1.8/LICENSE) |
| [zerofrom-derive](https://github.com/unicode-org/icu4x) | 0.1.8 | Unicode-3.0 | [LICENSE](docs/licenses/rust/zerofrom-derive-0.1.8/LICENSE) |
| [zerotrie](https://github.com/unicode-org/icu4x) | 0.2.5 | Unicode-3.0 | [LICENSE](docs/licenses/rust/zerotrie-0.2.5/LICENSE) |
| [zerovec](https://github.com/unicode-org/icu4x) | 0.11.9 | Unicode-3.0 | [LICENSE](docs/licenses/rust/zerovec-0.11.9/LICENSE) |
| [zerovec-derive](https://github.com/unicode-org/icu4x) | 0.11.7 | Unicode-3.0 | [LICENSE](docs/licenses/rust/zerovec-derive-0.11.7/LICENSE) |
| [zmij](https://github.com/dtolnay/zmij) | 1.0.23 | MIT | [LICENSE-MIT](docs/licenses/rust/zmij-1.0.23/LICENSE-MIT) |

## License text fidelity

The copied files retain upstream wording, author names and copyright statements. Some notices include third-party components within a dependency; those notices are included as supplied. License labels and dependency counts describe this lockfile snapshot, not all future versions of those projects.
