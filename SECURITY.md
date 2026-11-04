# Security reports

I maintain erase.to as an independent project. If you find a suspected vulnerability, please contact me privately through [GitHub's security reporting form](https://github.com/RedCamel1312/erase.to/security/advisories/new) or Session:

```
05d142f0db75884b2b84d3647acd19090681d1fe5a58c40039e72b2c0f2215a16a
```

Include the affected revision, relevant configuration, reproduction steps and expected impact. Use synthetic messages and an instance you control. Do not send real message links, private keys, production credentials or another person's content. Public issues are suitable for general hardening proposals, not undisclosed exploitable vulnerabilities.

The current main branch is maintained. Earlier PHP and Node.js implementations use different protocols and are not supported by this implementation. There is no independent audit certification. Read the [threat model](docs/threat-model.md) before relying on a property that is not covered by the documented design.

## Known build dependency advisory

The Svelte Vite plugin brings in `deepmerge@4.3.1`, covered by [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4). This is a build/development dependency, not a live message-processing dependency. No corrected upstream release was available when this mitigation was added.

The repository applies [a pinned pnpm patch](patches/deepmerge@4.3.1.patch) that blocks the reported `__proto__` assignments in both merge directions. [Regression tests](web/tests/build-dependency.test.ts) load the exact dependency resolved by the Svelte plugin and exercise the poisoning cases and expected configuration-merge behavior. Runtime protocol and cryptographic code are unchanged by this mitigation.

A version-based Dependabot alert may remain visible for `4.3.1` despite the applied patch. The package has not been relabeled, the alert is not dismissed, and no broad audit exception is configured. [Development instructions](docs/development.md#patched-build-dependency) explain reproducible installation and when to replace this temporary patch with a supported upgrade.
