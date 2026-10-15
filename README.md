# OpenCode API on Botkeep

OpenCode **1.19.0**, running as an authenticated headless HTTP API with tools auto-approved (`permission: "allow"`). This is OpenCode 1, not OpenCode 2. It is a coding-agent API, NOT an OpenAI-compatible `/v1/chat/completions` service.

## Security and platform gate

**Anyone with API access can control this workload, execute commands and access its available credentials.** Use a dedicated workload, narrowly scoped provider keys, HTTPS and preferably network access controls. Never mount unrelated projects or credentials. OpenCode permissions do not replace OS/container isolation. Custom agents or project config can override global permission settings.

Botkeep's public Express starter says HTTP routing and TLS are not active in its preview. A preview configurator is NOT proof that a real runtime or public endpoint is provisioned. Confirm real process execution, npm package installation, allocated inbound port, HTTPS routing and persistent writable storage before proceeding. If these are unavailable, this repository alone cannot make a public API work. Do not enter real secrets in a demo/preview environment.

## Step 1 — Import this repository

1. Open https://botkeep.cloud/app/create and select a real Node.js application runtime, Node 22 or newer when available.
2. Connect GitHub and authorize the Botkeep GitHub App for this private repository only.
3. Select this repository, branch `main`, project root `/` (or leave the root field empty if that means the repository root).
4. If private GitHub import is unavailable, download the repository ZIP and use Botkeep's ZIP importer; ensure package.json is at the configured project root.
5. Start with about 1 GB RAM if your plan permits; this is a suggested starting allocation, not a measured requirement. Builds, language servers and tasks may need more RAM/disk.

## Step 2 — Install dependencies

Use `npm ci` as the installation/build command if Botkeep exposes that field. If the platform installs dependencies automatically, confirm the install succeeds in its logs. Start command: `npm start`.

No Docker, SSH, sudo or global npm installation is required. The npm package still needs a compatible Linux runtime, executable binaries and permitted subprocess execution.

## Step 3 — Environment and secrets

Set these in the actual workload's Environment/Secrets section:

| Variable | Value |
| --- | --- |
| PORT | Exact port Botkeep allocates/routes, e.g. 4096 only if that is the allocated port |
| OPENCODE_SERVER_USERNAME | opencode |
| OPENCODE_SERVER_PASSWORD | Unique random password, at least 24 characters |
| OPENAI_API_KEY | Your API key if using OpenAI; use the appropriate provider credentials otherwise |

The startup script also accepts `SERVER_PORT` if `PORT` is absent; it otherwise defaults to 4096. It refuses to start without the password. Do not paste provider keys or the server password into GitHub, chat, screenshots or README edits.

The `.env.example` file is documentation only: the app does not automatically load `.env`.

Optional:
- `OPENCODE_PROJECT_DIR`: an existing directory for the agent's working project. Default: repository root. Install/clone or upload the project first. Start with a small scratch project before trusting it with real code.
- `OPENCODE_DATA_DIR`: a directory verified by Botkeep to persist across restarts AND redeployments. Default: `.opencode-data` in the deployment root. The script places XDG data/state/cache/config below this directory. Merely choosing a path does not make it persistent.

Back up both the project and OpenCode state. Do not commit state: it can contain sessions and credentials. Stop the workload before making a consistent filesystem backup. Check platform backup/restore behavior before relying on it.

## Step 4 — Start and verify networking

Click Start/Deploy. Look for `Starting authenticated OpenCode on 0.0.0.0:...`. Match the listening port to the platform's allocated/routed port. Obtain the real HTTPS base URL from the platform; do not invent a hostname.

Do not expose raw HTTP with Basic authentication over the public internet. If Botkeep cannot provide secure ingress, ask support whether supported secure routing is available before continuing.

## Step 5 — Test from your own computer

These examples use Bash, curl and jq. Avoid `set -x` when handling secrets.

```bash
export BASE_URL="https://YOUR-ACTUAL-HTTPS-ENDPOINT"
export OPENCODE_USER="opencode"
read -rsp "Server password: " OPENCODE_PASSWORD; echo

# Authentication must be required: this should return 401.
curl -s -o /dev/null -w '%{http_code}\n' "$BASE_URL/global/health"

# Authenticated health: expect healthy:true and a version.
curl --fail-with-body -u "$OPENCODE_USER:$OPENCODE_PASSWORD" \
  "$BASE_URL/global/health"

# Inspect available/connected providers and model IDs.
curl --fail-with-body -u "$OPENCODE_USER:$OPENCODE_PASSWORD" \
  "$BASE_URL/config/providers"

# Create a session. Stop and inspect the response if this fails.
SESSION_ID=$(curl --fail-with-body -sS \
  -u "$OPENCODE_USER:$OPENCODE_PASSWORD" \
  -H 'Content-Type: application/json' \
  -d '{"title":"API smoke test"}' "$BASE_URL/session" | jq -er '.id')
printf 'Session: %s\n' "$SESSION_ID"
```

Set a model supported by your authenticated provider, using IDs returned by the provider endpoint:

```bash
export PROVIDER_ID="openai"
export MODEL_ID="REPLACE_WITH_AVAILABLE_MODEL_ID"

jq -n --arg provider "$PROVIDER_ID" --arg model "$MODEL_ID" \
  '{agent:"build", model:{providerID:$provider,modelID:$model},
    parts:[{type:"text",text:"Create hello.txt in the current project containing Hello from OpenCode. Do not modify anything else."}]}' \
  > /tmp/opencode-task.json

curl --fail-with-body -sS \
  -u "$OPENCODE_USER:$OPENCODE_PASSWORD" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/opencode-task.json \
  "$BASE_URL/session/$SESSION_ID/message"
```

This call can incur model-provider charges and creates a file in the workload. It waits for the agent response. For long tasks, POST the same body to `/session/$SESSION_ID/prompt_async`, then retrieve `/session/$SESSION_ID/message`. SSE events are available at `/event`; the host must support streaming without buffering for live events. Consult the running server's `/doc` for its exact schema.

For a browser client, configure explicit trusted CORS origins if needed; CORS is NOT authentication. Prefer a backend proxy so server credentials are not embedded in a public web app or distributed mobile binary. This starter does not add custom CORS origins.

## Troubleshooting

- Password error: set a unique password of at least 24 characters in Environment and restart.
- Binary missing: run `npm ci`; do not omit optional npm dependencies, because platform-specific binaries may require them.
- Address in use / inaccessible: check allocated port, actual ingress and workload logs.
- 401 with credentials: check username and secret values; never disable authentication as a workaround.
- No connected models: check provider credentials, API account/billing, provider/model IDs and outbound connectivity.
- Pending permission: inspect project/custom-agent configuration and the running config; it may override the global allow setting.
- Data disappears: verify persistent storage behavior, including redeployments. The default directory is not a durability guarantee.
- Process killed / out of memory: increase RAM or reduce concurrent tasks; consider build/language-server usage.

## Sources

- https://opencode.ai/docs/
- https://opencode.ai/docs/server/
- https://opencode.ai/docs/permissions/
- https://botkeep.cloud/docs/github
- https://botkeep.cloud/templates/express-api

This repository is a deployment starter, not a claim that it has been deployed or that Botkeep networking has been verified.
