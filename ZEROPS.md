# OpenCode CLI server on Zerops

Separate stack modeled on the Hermes runbook: runtime service, Local Storage, persistence gate, one server, authenticated API. Do not change or mount the existing Hermes service/volume. The original Botkeep deployment remains supported.

## Important boundaries

- Uses pinned OpenCode 1.19.0, not OpenCode 2.
- YOLO-style tool auto-approval is enabled in opencode.json. It is not OS isolation: agent shell tools can access workload files and credentials.
- Use a NEW Zerops project with its own Local Storage. No Hermes keys, memory or files should be mounted here.
- maxContainers is 1 and deploy.temporaryShutdown is true: old containers are removed before replacements start. There will be deployment downtime, intentionally avoiding overlapping app servers on one state directory.
- Volume paths are touched only at runtime. Build/prepare cannot access /mnt/vol.
- Keep API/provider secrets in the opencode service's secret environment variables, not Git. Never use a public endpoint without authentication and HTTPS.

## Phase 0 — Prerequisites

Access to Zerops and this private GitHub repository; provider API credentials if you want paid model calls. Check actual credits and import cost estimates; no price or free-credit amount is promised here.

Generate a unique server password locally and save it in a password manager:

```bash
openssl rand -hex 24
```

The startup script requires at least 24 characters. Do not commit the generated value.

## Phase 1 — Create the separate project

In Zerops choose Import a project. Paste zerops-import.yaml from this repository. Select an appropriate region; use Lightweight core (LIGHT) if suitable and inspect optional paid features before confirmation. The import creates only a new Local Storage service `vol` and a Node.js runtime `opencode`. No automatic Git build is requested so secrets and the persistence gate can be configured first.

Check: both services exist. Storage should be available; the runtime may await its first deployment. Do not modify the existing Hermes project.

## Phase 2 — Prove persistence before running the agent

1. Connect this private repository to the opencode service through Zerops GitHub integration. Authorize this repository; use main and root zerops.yaml.
2. Select setup `opencode-persistence` for the first deployment, NOT the main app setup. If the dashboard starts a build automatically before setup can be selected, cancel it and select the persistence setup; a main app build without the password should fail closed.
3. Deploy. Open the runtime's Remote web terminal/Web Shell.
4. Run `cat /mnt/vol/deploys.log`.
5. Redeploy the SAME persistence setup and run the command again.

Check: the original line remains and another line is added. Restarts may add lines too; the test is survival of the old content after a redeploy, not an exact line count. The gate intentionally serves no HTTP endpoint. A public 502 during this gate is expected. Do not proceed if persistence fails.

## Phase 3 — Set service secrets

In the opencode service's Environment Variables settings, add secret values:

| Name | Value |
| --- | --- |
| OPENCODE_SERVER_PASSWORD | Your unique password from Phase 0 |
| OPENAI_API_KEY | Your OpenAI API key if using OpenAI; use the correct credential for another provider otherwise |

Do not copy Hermes API_SERVER_KEY: this is a different server with separate authentication. Username, port, project and state locations are already declared in zerops.yaml. Avoid duplicate GUI values for these variables.

## Phase 4 — Deploy the OpenCode app

Switch the service's selected zerops setup to `opencode` and deploy main. Keep minContainers and maxContainers at 1. npm ci runs during build on Ubuntu; deployed node_modules includes the platform binary. All workspace/state creation occurs in runtime initCommands.

Check logs for OpenCode 1.19.0 and `Starting authenticated OpenCode on 0.0.0.0:4096`.

Paths:

| Path | Purpose |
| --- | --- |
| /var/www | Replaceable deployment files and npm dependencies |
| /mnt/vol/workspace | Persistent working project/code |
| /mnt/vol/opencode | Persistent XDG data/state/config/cache, including sessions/provider auth where applicable |
| /mnt/vol/deploys.log | Persistence marker |

Data and workspace are in the same security boundary. Auto-approved shell execution is NOT confined to workspace by setting OPENCODE_PROJECT_DIR.

## Phase 5 — Validate authentication and HTTPS

Use the real Zerops HTTPS subdomain shown for this service. The import enables subdomain access; port 4096 is declared HTTP-capable. Do not invent the URL. Treat the built-in subdomain as an initial testing endpoint; configure suitable production ingress/access controls for a production service.

From your own Bash terminal:

```bash
export BASE_URL="https://YOUR-ACTUAL-ZEROPS-SUBDOMAIN"
read -rsp "OpenCode server password: " OPENCODE_PASSWORD; echo

# Expect 401 (no credentials).
curl -s -o /dev/null -w '%{http_code}\n' "$BASE_URL/global/health"

# Expect healthy:true and version 1.19.0.
curl --fail-with-body -u "opencode:$OPENCODE_PASSWORD" \
  "$BASE_URL/global/health"

# Provider/model discovery.
curl --fail-with-body -u "opencode:$OPENCODE_PASSWORD" \
  "$BASE_URL/config/providers"
```

Check: HTTPS is valid, unauthenticated access is rejected, authenticated health succeeds. If ingress reports a failure because it probes an authenticated route, configure an appropriate TCP check or authenticated local execution probe; do not disable server authentication.

## Phase 6 — Use it as an API

Commands below require jq:

```bash
SESSION_ID=$(curl --fail-with-body -sS \
  -u "opencode:$OPENCODE_PASSWORD" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Zerops persistence test"}' \
  "$BASE_URL/session" | jq -er '.id')

export PROVIDER_ID="openai"
export MODEL_ID="REPLACE_WITH_AVAILABLE_MODEL_ID"
jq -n --arg p "$PROVIDER_ID" --arg m "$MODEL_ID" \
  '{agent:"build", model:{providerID:$p,modelID:$m},
    parts:[{type:"text",text:"Create persistence-check.txt in the current project containing opencode-zerops-persistence-ok. Do not change anything else."}]}' \
  > /tmp/opencode-task.json

curl --fail-with-body -sS \
  -u "opencode:$OPENCODE_PASSWORD" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/opencode-task.json \
  "$BASE_URL/session/$SESSION_ID/message"
```

Choose an actually available model from provider discovery. Model calls may incur charges. Inspect the response for errors and check the file in the runtime terminal:

```bash
cat /mnt/vol/workspace/persistence-check.txt
```

For long tasks POST the same payload to `/session/$SESSION_ID/prompt_async`, then fetch `/session/$SESSION_ID/message`; `/event` offers SSE. The installed server's `/doc` is the exact schema reference. This is an agent/session API, not an OpenAI chat-completions proxy.

## Phase 7 — Real redeploy test

1. Save SESSION_ID locally and confirm the test file exists.
2. Redeploy the opencode setup, not merely restart.
3. Check the file again in the runtime terminal.
4. With the same password, GET `/session/$SESSION_ID` and `/session/$SESSION_ID/message` from your computer.

Check: project file AND session/history survive replacement of the container. Do not declare persistence verified until this succeeds on Zerops.

## Phase 8 — Backups and operations

Back up both /mnt/vol/workspace and /mnt/vol/opencode, including associated config/auth data. OpenCode may use SQLite with WAL; do not copy just a live .db file. Zerops Local Storage backups are live volume archives and can capture database files mid-write. For an initially simple consistent backup, stop the runtime service, keep the volume available, take a Local Storage backup through the platform and restart. Test a restore into an isolated project before relying on the backup. Keep an encrypted off-platform copy; backup state may contain secrets.

Keep one container. Start with roughly 1 GB RAM and monitor before adjusting; this is not a measured Zerops sizing guarantee. Monitor credits, volume usage, model spending and process failures. OS tools required by coding tasks (git, compilers, language servers) must exist in the runtime; add only necessary packages to run.prepareCommands, never put volume writes there. Update the pinned dependency and lockfile intentionally, test and redeploy; do not assume database downgrades are safe.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Password startup error | Secret exists, is at least 24 characters, and is available to the runtime |
| 502 | Right setup selected? app started? port 4096 declared? password guard passed? |
| 401 | Expected without auth; otherwise check username/password and proxy handling |
| Missing binary | npm ci succeeded, node_modules deployed, optional platform dependencies not omitted |
| State lost | Correct volume, paths and selected setup; redo the persistence gate |
| Session missing but file survives | XDG state paths, API project context and whether the same session ID is used |
| GitHub cannot clone | Authorize private repository access in Zerops; do not make the repository public just to work around auth |

## Reference documentation

- https://docs.zerops.io/zerops-yaml/specification
- https://docs.zerops.io/references/import
- https://docs.zerops.io/local-storage/how-to/connect
- https://docs.zerops.io/local-storage/overview
- https://opencode.ai/docs/server/
- https://opencode.ai/docs/permissions/

The files were prepared and local runtime tests are separate from a real Zerops deployment. Live import, networking, provider calls, persistence and restore must be checked in your account.
