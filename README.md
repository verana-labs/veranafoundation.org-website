# veranafoundation.org

The institutional website of the **Verana Foundation** — the non-profit steward of
the open trust layer. The Foundation owns the specifications, stewards the
open-source software (Apache 2.0), grows the ecosystem (grants, devrel,
partnerships), and runs two membership classes (Associate and Contributor).

Built with **Next.js 15** (standalone output) and **Tailwind CSS v4**. Sister site
to [veranacouncil.org](https://github.com/verana-labs/veranacouncil.org-website):
it shares the information architecture but has its own *open-source commons*
personality (Space Grotesk display type, purple + green palette, GitHub-flavored
layout).

> The Foundation is **in formation**, stewarded by 2060 OÜ pre-incorporation.

## Develop

```bash
nvm use            # Node 22 (see .nvmrc)
npm install
npm run dev        # http://localhost:3000
```

## Build

```bash
npm run build      # produces .next/standalone
npm start
```

## Container

```bash
docker build -t veranalabs/veranafoundation.org-website:local .
docker run --rm -p 3000:3000 veranalabs/veranafoundation.org-website:local
```

## CI/CD

- **`docker-publish.yml`** — type-check + build on every PR/push; on push to `main`
  and on `v*` tags, builds and pushes the multi-arch image to Docker Hub
  (`veranalabs/veranafoundation.org-website`) and rolls out to the OVH Kubernetes
  cluster (namespace `web`).
- **`release-please.yml`** — maintains a release PR from Conventional Commits; merging
  it tags `v*` (which triggers the versioned image build) and announces the release
  on Discord via the reusable `2060-io/organization` workflow. A manual
  `workflow_dispatch` (input `notify_tag`) can (re)send a notification for an existing
  tag.

Required repo secrets: `DOCKER_HUB_LOGIN`, `DOCKER_HUB_PWD`, `OVH_KUBECONFIG`,
`DISCORD_UPDATES_WEBHOOK_URL`, `RELATICLE_API_TOKEN`.

## Contact form → CRM

The `/contact` form posts to a server-side route (`app/api/contact/route.ts`)
which writes the inquiry into the self-hosted **Relaticle CRM** as a Company
(when an organization is given), a Person, a Note, and — for membership /
partnership / grant inquiries — an Opportunity. Writes are **best-effort**: a CRM
error never fails the user's submission (it's logged, and alerted if
`ALERT_WEBHOOK_URL` is set).

Configuration (see `.env.example`):

| Var | Where | Notes |
| --- | --- | --- |
| `RELATICLE_API_URL` | k8s deployment env | In-cluster: `http://relaticle.relaticle.svc.cluster.local` |
| `RELATICLE_API_TOKEN` | GitHub secret → k8s Secret | Sanctum token bound to the `2060` team; CI upserts it into `veranafoundation-website-secrets` |
| `ALERT_WEBHOOK_URL` | optional env | Discord/Slack-compatible alert on CRM write failure |

For local development, copy `.env.example` to `.env.local` (gitignored) and set
the token. In production the token comes from the GitHub Actions secret — never
commit a `.env` file.

## Content spec

The page-by-page content and design spec lives in
`verana-strategy/2026/foundation-website/spec.md`.

## License

Apache-2.0. Site text CC-BY-SA 4.0; brand assets CC-BY 4.0.
