<div align="center">

# Feelr

**One line. Any API. Zero context overhead.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GoReleaser](https://img.shields.io/github/v/release/progradetech/feelr?label=CLI&logo=go)](https://github.com/progradetech/feelr/releases)
[![GitHub Actions](https://img.shields.io/github/actions/workflow/status/progradetech/feelr/release.yml?label=Build&logo=github)](https://github.com/progradetech/feelr/actions)
[![Go Report Card](https://goreportcard.com/badge/github.com/progradetech/feelr/cli)](https://goreportcard.com/report/github.com/progradetech/feelr/cli)

</div>

---

## What is Feelr?

Feelr is an agent-friendly API simplification layer. It sits between AI agents and real-world APIs, transforming complex endpoints into minimal, predictable calls that work with ~50 tokens of context instead of thousands. Open-source, self-hostable, and designed for the agentic coding era.

Think of it as a lobster's antennae -- feelers that sense and navigate API capabilities instantly, without wading through documentation or heavy protocol overhead.

## Features

- **4 Connectors** -- GitHub, Slack, Stripe, and Discord out of the box, with more on the way
- **Composable Action Chains** -- pre-built and user-defined multi-step workflows with data passing and conditional logic
- **Progressive CLI Discovery** -- `feelr tools` lets agents discover available actions with agent-optimized descriptions
- **Web Dashboard** -- manage API keys, monitor usage, and connect services at a glance
- **Self-Hostable** -- full Docker Compose setup with feature parity (minus billing)
- **3 Billing Tiers** -- Hatchling (free), Lobster, and Leviathan for cloud-hosted; unlimited for self-hosted

## Quick Start

### API Path

```bash
# 1. Create an API key
curl -X POST https://api.feelr.dev/admin/keys \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label": "my-agent"}'

# 2. Store a credential (e.g., GitHub PAT)
curl -X POST https://api.feelr.dev/admin/credentials \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"connector": "github", "token": "ghp_..."}'

# 3. Run an action
curl https://api.feelr.dev/v1/github/repos.list \
  -H "X-Feelr-Key: fk_live_..."
```

### CLI Path

```bash
# 1. Install (see Install section below)
brew install progradetech/feelr/feelr

# 2. Configure
feelr init

# 3. Authenticate a connector
feelr auth github

# 4. Run an action
feelr run github repos.list
```

```
ID                  NAME              PRIVATE  LANGUAGE
andrewprograde/app  my-cool-app       false    TypeScript
andrewprograde/lib  shared-utils      false    Go
andrewprograde/ops  infra-configs     true     HCL
```

## Install

### Homebrew

```bash
brew install progradetech/feelr/feelr
```

### curl

```bash
curl -sSL https://feelr.dev/install.sh | sh
```

### go install

```bash
go install github.com/progradetech/feelr/cli@latest
```

### GitHub Releases

Download pre-built binaries for Linux, macOS, and Windows from the [Releases page](https://github.com/progradetech/feelr/releases).

## Documentation

Full documentation is available at [feelr.dev/docs](https://feelr.dev/docs), including:

- Quick-start guides (API and CLI)
- Authentication setup
- Connector reference with action tables
- CLI command reference
- Composable action chains

## Self-Hosting

Feelr is fully self-hostable with Docker Compose. The self-hosted version has full feature parity with the cloud service (billing is disabled by default).

```bash
git clone https://github.com/progradetech/feelr.git
cd feelr/self-host
./init.sh
docker compose up -d
```

See the [self-hosting guide](self-host/README.md) for detailed setup, configuration, TLS, backups, and troubleshooting.

## Contributing

Contributions are welcome! The easiest way to contribute is by building a new connector -- copy the [template](connectors/_template/), implement your actions, and open a PR.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide, including project structure, connector guidelines, and commit conventions. No CLA required.

## License

[MIT](LICENSE)
