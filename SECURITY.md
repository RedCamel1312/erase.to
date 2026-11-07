# Security reports

I maintain erase.to as an independent project. If you find a suspected vulnerability, please contact me privately through [GitHub's security reporting form](https://github.com/RedCamel1312/erase.to/security/advisories/new) or Session:

```
05d142f0db75884b2b84d3647acd19090681d1fe5a58c40039e72b2c0f2215a16a
```

Include the affected revision, relevant configuration, reproduction steps and expected impact. Use synthetic messages and an instance you control. Do not send real message links, private keys, production credentials or another person's content. Public issues are suitable for general hardening proposals, not undisclosed exploitable vulnerabilities.

The current main branch is maintained. Earlier PHP and Node.js implementations use different protocols and are not supported by this implementation. There is no independent audit certification. Read the [threat model](docs/threat-model.md) before relying on a property that is not covered by the documented design.

## Dependency checks

CI audits the complete JavaScript dependency tree, including development and build tools, at the Low threshold. Rust dependencies are checked against RustSec. No advisory exclusions or ignored severity levels are configured.

The build uses an exact, consumer-scoped dependency replacement documented in the [development guide](docs/development.md#build-dependency-replacement). Tests load the dependency resolved by the actual Svelte plugin and verify its package identity, configuration behavior and prototype handling. A clean scanner result describes known advisories at the time of the check; it is not a security certification.

## External testing

In November 2026 I received an anonymous black-box report about the public HTTPS service. During bursts of challenge requests, some otherwise valid requests to open a note received HTTP 429. Version 3.2.0 separates those budgets at the proxy and API. Regression tests cover both layers. This was a finding about availability; the report did not demonstrate an extra retrieval or a disclosure of plaintext.

The tester examined the public endpoint and the JavaScript it served. The report did not tie that deployment to a particular Git commit or inspect the host. It is not a certification or a full source or infrastructure audit.
