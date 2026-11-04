# Documentation

[English](../README.md) · [Deutsch](../README.de.md) · [Español](../README.es.md) · [简体中文](../README.zh-CN.md) · [Português (Brasil)](../README.pt-BR.md)

Start with the [project overview](../README.md) for the editor, capabilities and a local Docker Compose quickstart. The five introductions cover the same functionality and limits. The technical documents below are maintained in English.

## Choose a guide

| If you want to… | Read |
| --- | --- |
| Understand what the service protects, what it reveals and whom you trust | [Threat model](threat-model.md) |
| Run your own public instance or plan an update | [Operations and deployment](operations.md) |
| Send, receive or revoke a package from a terminal | [Command line client](cli.md) |
| Work on the browser, shared library or Rust API | [Development](development.md) |
| Reproduce crypto, lifecycle, real-cache or container checks | [Testing](testing.md) |
| Inspect packet formats, key derivation, capabilities and exact limits | [Protocol specification](protocol.md) |
| Follow the primary sources behind the design | [Design research](research.md) |
| Propose a change | [Contributing](../CONTRIBUTING.md) |
| Report a vulnerability privately | [Security policy](../SECURITY.md) |
| Review licensing and bundled notices | [Project license](../LICENSE) and [third-party notices](../THIRD_PARTY.md) |

## Where the code lives

| Path | Responsibility |
| --- | --- |
| [`web/`](../web/) | Svelte interface, browser worker and sensitive-session lifecycle |
| [`shared/`](../shared/) | Versioned protocol, cryptography, packing and proof of work |
| [`server/`](../server/) | Rust HTTP API, validation and atomic Valkey operations |
| [`cli/`](../cli/) | Command line client using the shared protocol |
| [`tests/`](../tests/) | Cross-client and complete transfer checks |
| [`deploy/`](../deploy/) | Service, cache and reverse-proxy configuration templates |
| [`.github/workflows/`](../.github/workflows/) | Continuous integration |
| [`images/`](images/) | Interface screenshots and the architecture diagram |
| [`licenses/`](licenses/) | Dependency inventories and original license notices |

## Read claims in context

The threat model describes trust boundaries; the protocol specifies behavior; the operations guide explains how to configure a host. None alone proves the state of a particular deployment. Test results establish the checks actually run and are recorded with the applicable revision in [releases](https://github.com/RedCamel1312/erase.to/releases) and [CI](https://github.com/RedCamel1312/erase.to/actions).

The service limits authorized retrievals and retention on its server. It cannot retract a recipient's copies, guarantee physical memory erasure or eliminate traffic metadata. Use synthetic data for development and reports, and never point integration tests at a production cache.
