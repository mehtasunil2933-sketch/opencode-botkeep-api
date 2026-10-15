# OpenCode CLI Server on Zerops

Deploy **OpenCode 1.19.0** as a password-protected HTTP coding-agent API on Zerops, with **YOLO-style tool auto-approval** and **persistent workspace and session state**.

The repository name still includes `botkeep` because it began as a Botkeep starter. **Zerops is the primary deployment path below.** The separate [Botkeep guide](BOTKEEP.md) remains available.

> **Security:** `permission: "allow"` automatically approves tools, including shell execution and file modifications. Anyone with API credentials can effectively control the workload and access its available secrets. Use a dedicated project/volume, HTTPS and narrowly scoped model credentials. Never mount Hermes data here. This is OpenCode's session/agent API, **not** an OpenAI-compatible `/v1/chat/completions` endpoint. This repo uses OpenCode 1, not OpenCode 2.

## Files

| File | Purpose |
| --- | --- |
| [zerops-import.yaml](zerops-import.yaml) | Create a NEW Lightweight project, Local Storage `vol` and Node.js `opencode` runtime |
| [zerops-import-services.yaml](zerops-import-services.yaml) | Add ONLY the runtime to an existing project where `vol` already exists |
| [zerops.yaml](zerops.yaml) | Ubuntu/Node 22 build, port 4096, persistent volume and deployment setups |
| [package.json](package.json) / [package-lock.json](package-lock.json) | Exact OpenCode dependency and reproducible npm installation |
| [start.mjs](start.mjs) | Validate password/port, set persistent XDG paths and start the authenticated server |
| [opencode.json](opencode.json) | Enable tool auto-approval |
| [.env.example](.env.example) | Environment-variable reference; NOT automatically loaded |
| [ZEROPS.md](ZEROPS.md) | Expanded phased deployment, persistence checks, backup guidance and troubleshooting |
| [BOTKEEP.md](BOTKEEP.md) | Original alternative hosting guide |

## Architecture

```text
Your client -- HTTPS + Basic auth --> Zerops ingress --> opencode:4096
                                                        |
                                                        +-- /var/www
                                                        |   replaceable deployment + npm dependencies
                                                        |
                                                        +-- /mnt/vol/workspace
                                                        |   persistent working project / generated code
                                                        |
                                                        +-- /mnt/vol/opencode
                                                            persistent XDG data/state/config/cache
```

One application container is configured. `deploy.temporaryShutdown: true` removes the old application container before its replacement starts, avoiding overlapping app servers on the same state. Deployments intentionally have downtime. Volume directories are created only at runtime, not during build/prepare.

## 1. Create the project or add the missing runtime

### Option A — New project

In Zerops choose **Import a project** and paste [zerops-import.yaml](zerops-import.yaml):

```yaml
project:
  name: opencode
  corePackage: LIGHT
services:
  - hostname: vol
    type: local-storage:single@1
  - hostname: opencode
    type: nodejs@22
    minContainers: 1
    maxContainers: 1
    enableSubdomainAccess: true
```

Choose your region and inspect the estimated resource cost. No free-credit amount or hosting price is guaranteed by this repository. The import intentionally does not start a Git build before you configure secrets.

### Option B — Existing project with `vol`

If your `opencode` project and `vol` Local Storage already exist, **do not create duplicates**. Open that project, choose **Import services**, and paste [zerops-import-services.yaml](zerops-import-services.yaml). It creates only the missing Node.js runtime. If the runtime also already exists, skip import entirely.

**Check:** the project contains Local Storage `vol` and a Node.js runtime `opencode`. Do not substitute a Docker service or reuse the Hermes volume.

## 2. Add secret environment variables

In the **opencode service**, open **Environment variables** and add these as secrets:

| Name | Value |
| --- | --- |
| `OPENCODE_SERVER_PASSWORD` | Unique random password of at least 24 characters |
| `OPENAI_API_KEY` | Your OpenAI API key if using OpenAI; use the supported credential for your chosen provider otherwise |

Generate a password locally and save it in a password manager:

```bash
openssl rand -hex 24
```

Do not commit the generated value, provider keys or a real `.env`. Do not reuse Hermes' `API_SERVER_KEY`: this is a different server. The startup script deliberately refuses to start without a sufficiently long password.

These non-secret settings are already in `zerops.yaml`; do not add conflicting duplicates in the GUI:

```text
PORT=4096
OPENCODE_SERVER_USERNAME=opencode
OPENCODE_PROJECT_DIR=/mnt/vol/workspace
OPENCODE_DATA_DIR=/mnt/vol/opencode
```

## 3. Connect this private GitHub repository

In the opencode service's **Pipelines / CI/CD settings**, connect GitHub and authorize access to this private repository:

```text
Repository: mehtasunil2933-sketch/opencode-botkeep-api
Branch:     main
Config:     zerops.yaml at repository root
Setup:      opencode
```

Use the configuration/setup controls available in your Zerops UI; labels may vary. Do not make the repository public to work around missing GitHub authorization.

**Recommended persistence gate before the first agent deployment:** select setup `opencode-persistence` instead, deploy twice, and check `cat /mnt/vol/deploys.log` in the runtime Web Shell after each deployment. Old content must survive. This setup runs `sleep infinity` and intentionally serves no HTTP endpoint. Once it passes, switch the selected setup to `opencode` and deploy. See [ZEROPS.md](ZEROPS.md) for the full gate.

## 4. Deploy OpenCode

Deploy setup **`opencode`** from **`main`**. The pipeline installs dependencies with `npm ci`, checks the startup script and deploys `node_modules` with the platform binary. No global npm install is needed.

In the logs, check for version **1.19.0** and:

```text
Starting authenticated OpenCode on 0.0.0.0:4096
```

Use the actual **HTTPS subdomain** displayed by Zerops. The import enables subdomain access, and `zerops.yaml` declares port 4096 with HTTP support. Do not invent a hostname. Treat the built-in subdomain as an initial test endpoint; use suitable production ingress/access controls for production.

## 5. Test authentication and health

On your own computer, use Bash and curl:

```bash
export BASE_URL="https://YOUR-ACTUAL-ZEROPS-SUBDOMAIN"
read -rsp "OpenCode server password: " OPENCODE_PASSWORD; echo

# Without credentials: expect HTTP 401.
curl -s -o /dev/null -w '%{http_code}\n' \
  "$BASE_URL/global/health"

# With credentials: expect healthy:true and version 1.19.0.
curl --fail-with-body -u "opencode:$OPENCODE_PASSWORD" \
  "$BASE_URL/global/health"

# Discover provider configuration and actual model IDs.
curl --fail-with-body -u "opencode:$OPENCODE_PASSWORD" \
  "$BASE_URL/config/providers"
```

Do not proceed if unauthenticated access succeeds or HTTPS is invalid. Do not disable authentication to make an ingress health check pass; use an appropriate TCP check or authenticated local probe if needed.

## 6. Create a session and send a coding task

These examples also require `jq`. Set a provider/model you actually have access to; a provider key alone does not guarantee model access or billing credit.

```bash
SESSION_ID=$(curl --fail-with-body -sS \
  -u "opencode:$OPENCODE_PASSWORD" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Zerops API test"}' \
  "$BASE_URL/session" | jq -er '.id')
printf 'Session ID: %s\n' "$SESSION_ID"

export PROVIDER_ID="openai"
export MODEL_ID="REPLACE_WITH_AVAILABLE_MODEL_ID"

jq -n --arg p "$PROVIDER_ID" --arg m "$MODEL_ID" \
  '{agent:"build", model:{providerID:$p,modelID:$m},
    parts:[{type:"text",text:"Create hello.txt in the current project containing Hello from OpenCode. Do not change anything else."}]}' \
  > /tmp/opencode-task.json

curl --fail-with-body -sS \
  -u "opencode:$OPENCODE_PASSWORD" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/opencode-task.json \
  "$BASE_URL/session/$SESSION_ID/message"
```

Stop if session creation fails. Model calls can incur charges. Inspect the task response for errors and verify `/mnt/vol/workspace/hello.txt` in the runtime Web Shell.

For long tasks, POST the same payload to `/session/$SESSION_ID/prompt_async`, then GET `/session/$SESSION_ID/message`. `/event` exposes SSE; your ingress must support unbuffered streaming for live events. The running server's `/doc` describes its exact API.

## 7. Verify persistence across a redeploy

1. Save the session ID and confirm `hello.txt` exists.
2. Redeploy **setup `opencode`**, not merely restart.
3. Check the file again in `/mnt/vol/workspace`.
4. GET `/session/$SESSION_ID` and `/session/$SESSION_ID/message` using the same credentials.

**Both the project file and session/history must survive.** Configuring a volume is not the same as verifying it in your account.

## Backups, sizing and security

- Back up BOTH `/mnt/vol/workspace` and `/mnt/vol/opencode`; state can contain credentials. Keep backups private and encrypted off-platform.
- Do not copy only a live SQLite `.db` file. For a simple consistent volume backup, stop the runtime, take the platform backup while storage remains available, then restart. Test restore into an isolated project.
- Start with roughly 1 GB application RAM if suitable and monitor actual usage; this is a suggestion, not a measured Zerops requirement. Builds and language servers can need more.
- Keep min/max application containers at 1. Keep the temporary shutdown deployment setting.
- `OPENCODE_PROJECT_DIR` selects a working directory; it does NOT sandbox shell execution. Agent-specific/project permission rules can override the global auto-approval setting.
- Do not embed the server password in a public web app or distributed mobile binary. Prefer a trusted backend proxy. CORS is not authentication.
- Add compilers, git or other runtime tools only when needed; mutable project/state data belongs on the volume, not `/var/www`.
- Upgrade the exact OpenCode dependency and lockfile intentionally. Do not assume a state database can safely be downgraded.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Password error | Service secret exists, is at least 24 characters, and reaches the runtime |
| 502 | Correct setup? server running? port 4096 declared? password guard passed? |
| 401 | Expected without auth; otherwise check credentials/proxy behavior |
| Missing binary | `npm ci` succeeded, optional platform dependencies were retained and node_modules was deployed |
| No usable model | Provider credentials, API billing/access, exact model IDs and outbound connectivity |
| Missing sessions after redeploy | Correct volume, XDG paths, same project context and same session ID |
| GitHub import denied | Authorize this private repository in Zerops GitHub integration |
| Tools waiting for approval | Check custom-agent/project configuration overriding global permissions |

## Validation status

Local checks passed for startup syntax, missing-password rejection, authenticated health, unauthenticated HTTP 401, loading auto-approval, and session/project-file survival across a local server restart with an external state directory. The YAML was syntax-checked locally and reviewed against the documentation below.

**This is not a claim of a completed Zerops deployment.** Cloud build, HTTPS routing, real model calls, redeploy persistence and backup restore must be checked in your account. No provider inference was used in the local smoke tests.

## Documentation

- [Zerops configuration](https://docs.zerops.io/zerops-yaml/specification)
- [Project/service import](https://docs.zerops.io/references/import)
- [Mounting Local Storage](https://docs.zerops.io/local-storage/how-to/connect)
- [Local Storage semantics and backups](https://docs.zerops.io/local-storage/overview)
- [OpenCode 1 server API](https://opencode.ai/docs/server/)
- [OpenCode 1 permissions](https://opencode.ai/docs/permissions/)
