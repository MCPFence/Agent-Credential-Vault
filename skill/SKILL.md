---
name: ais-agent-auth
description: >
  Agent identity & credential vault skill. All external service accounts (Gmail, Slack, GitHub, Notion,
  databases, API keys, etc.) MUST be accessed through this skill using `ais exec` for secure execution.
  Agents never see plaintext credentials — they are injected into subprocess environment variables only.
  Covers the full agent lifecycle: register identity → verify → start task → ais exec → finish task.
  Any scenario involving external service access, credential retrieval, OAuth tokens, cookies, API keys,
  or passwords MUST trigger this skill.
---

# Agent Identity & Credential Vault

You are an AI Agent. You **must NEVER see, hold, or output any plaintext credentials** (passwords, tokens, API keys, cookies).

All external service credentials are securely injected into subprocesses via `ais exec` — you only need the credential ID and a command. The credential is automatically injected; you never see the plaintext.

**Core principle: Use without seeing. Inject via exec when needed, auto-revoke when done, fully audited.**

---

## CLI Tool

All operations use the `ais` command-line tool. Platform-specific binaries are in the `bin/` directory:

```
bin/
├── darwin-arm64/ais      # macOS Apple Silicon
├── darwin-amd64/ais      # macOS Intel
├── linux-amd64/ais       # Linux x86_64
├── linux-arm64/ais       # Linux ARM64
└── windows-amd64/ais.exe # Windows x86_64
```

```bash
# Auto-detect platform
SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
[ "$ARCH" = "x86_64" ] && ARCH="amd64"
[ "$ARCH" = "aarch64" ] && ARCH="arm64"
AIS="${SKILL_DIR}/bin/${OS}-${ARCH}/ais"
```

**Global flags:**
- `--server URL` — AIS server address (default: http://localhost:8400)
- `--agent NAME` — specify which local identity to use
- `--app ID` — application identifier for identity binding (default: ais-cli, or $AIS_APP_ID)
- `--json` — JSON output (always use for scripts/agents)

---

## Full Workflow

```
1. Register identity  →  ais register <name> --app <app_id> --json
2. Load identity      →  ais load <name> (remembers last used identity)
3. Verify identity    →  ais verify --json
4. Start task         →  ais task start --type <type> --scopes <s1,s2> --json
5. List credentials   →  ais vault list --json (metadata only, no plaintext)
6. Secure execution   →  ais exec --cred <cred_id> -- <command> (credentials injected into subprocess)
7. Finish task        →  ais task finish <session_id>
```

**Important: There is no `vault use` command. The ONLY way to use credentials is via `ais exec`.**

---

## Phase 1: Register Identity

Each agent identity is bound to **one device + one application**. Identity files cannot be copied to other machines or used by other applications.

```bash
ais register EmailBot --app claude-code --desc "Email assistant" --json
```

Returns:
```json
{
  "agent_id": "agt_xxx",
  "claim_token": "claim_xxx",
  "status": "pending",
  "name": "EmailBot"
}
```

The identity is saved to `~/.ais-desktop/agents/EmailBot.json`. Give the `claim_token` to the owner to bind in the console.

## Phase 2: Load and Verify

```bash
# Load an existing identity
ais load EmailBot

# Verify identity is valid
ais verify --json
# → {"agent_id": "agt_xxx", "status": "active"}

# Show current identity details
ais whoami --json

# List all local identities
ais identities --json
```

## Phase 3: Start a Task

```bash
ais --json task start \
  --type email_summary \
  --scopes "read:email,read:contacts" \
  --desc "Summarize today's emails for the user"
```

Returns:
```json
{
  "session_id": "tsess_xxx",
  "task_type": "email_summary",
  "status": "active",
  "allowed_scopes": ["read:email", "read:contacts"],
  "denied_scopes": []
}
```

**Check `denied_scopes`**: Partial grants are normal. Continue working with the granted scopes.

---

## Phase 4: Secure Execution — ais exec (Core)

**This is the ONLY way to use credentials.** Credentials are injected into subprocess environment variables. You never see the plaintext, and output is automatically scrubbed.

### 4.1 List Available Credentials (Metadata Only)

```bash
ais --json vault list
ais --json vault list --service gmail
```

Returns (no plaintext — metadata only):
```json
[
  {
    "credential_id": "vcred_xxx",
    "service_name": "gmail",
    "credential_type": "oauth",
    "status": "active",
    "max_uses_per_hour": 60
  }
]
```

### 4.2 Execute Securely with exec

`ais exec` will: 1) retrieve credential from vault 2) inject into subprocess env vars 3) execute command 4) scrub sensitive values from output

```bash
# Use cookies to access a service ($AIS_COOKIES is a placeholder, ais replaces with real value)
ais exec --cred vcred_xxx -- curl -b $AIS_COOKIES http://example.com/api

# Use OAuth token
ais exec --cred vcred_xxx -- curl -H "Authorization: Bearer $AIS_TOKEN" https://api.github.com/user

# Use API Key with a Python script
ais exec --cred vcred_xxx --env OPENAI_API_KEY=api_key -- python my_script.py

# Multiple credentials
ais exec --cred vcred_aaa --env GH=api_key \
         --cred vcred_bbb --env SLACK=access_token \
         -- python multi_service.py

# Write credential to temp file (e.g., kubeconfig)
ais exec --cred vcred_xxx --file /tmp/.kube/config=kubeconfig_data -- kubectl get pods

# Timeout control (default 300 seconds)
ais exec --cred vcred_xxx --timeout 60 -- python long_task.py
```

### 4.3 Environment Variable Placeholders

`$VAR` and `${VAR}` in command arguments are automatically replaced by ais with the corresponding credential values. You don't need to know the actual credential content.

**`--env` mapping syntax:** `--env ENV_VAR=json_field`, where json_field corresponds to a field name in credential_data.

| Credential Type | Default Env Vars (when --env not specified) |
|----------------|---------------------------------------------|
| `cookie` | `$AIS_COOKIES`=cookies, `$AIS_DOMAIN`=domain |
| `oauth` | `$AIS_TOKEN`=access_token |
| `api_key` | `$AIS_API_KEY`=api_key, `$AIS_API_SECRET`=api_secret |
| `password` | `$AIS_USERNAME`=username, `$AIS_PASSWORD`=password |

### 4.4 Security Mechanisms

- Credentials exist only in subprocess env vars — the agent (parent process) cannot read them
- Credential plaintext in subprocess stdout/stderr is automatically replaced with `[AIS:REDACTED]`
- Temp files are deleted after subprocess exits, with 0600 permissions
- Subprocess exit code is passed through to the agent

### 4.5 Using Credentials Inside Subprocesses

Subprocesses read credentials via standard environment variables — no AIS SDK required:

```python
# my_script.py — credentials injected via env vars
import os
import openai
client = openai.OpenAI(api_key=os.environ["OPENAI_API_KEY"])
```

---

## Phase 5: Request Additional Permissions Mid-Task

When you discover you need permissions beyond the original request:

```bash
ais --json task auth tsess_xxx --scopes "read:calendar" --reason "User asked to check calendar schedule"
```

Task pauses → waits for owner approval in console → approved → continue.

## Phase 6: Finish Task

```bash
ais task finish tsess_xxx
```

All credential access is immediately revoked. Audit log records task completion.

---

## Decision Template

```
User: "Summarize today's emails and send to Slack"

My approach:
1. Identity → ais load EmailBot && ais verify --json
2. Start task → ais --json task start --type email_summary --scopes "read:email,write:slack"
3. Check grants → granted? Continue. Denied? Inform user or degrade gracefully
4. List creds → ais --json vault list --service gmail
5. Secure exec → ais exec --cred vcred_gmail -- python fetch_emails.py
   (Python script reads os.environ["AIS_TOKEN"], I never see the plaintext)
6. Send Slack → ais exec --cred vcred_slack -- python send_slack.py
7. Finish → ais task finish tsess_xxx
```

---

## Command Reference

### Identity Management

| Command | Description |
|---------|-------------|
| `ais register <name> --app <id> --json` | Register new agent (bound to device + app) |
| `ais load <name>` | Load existing identity |
| `ais verify --json` | Verify identity is valid |
| `ais whoami --json` | Show identity info (including binding status) |
| `ais identities --json` | List all local identities |

### Task Management

| Command | Description |
|---------|-------------|
| `ais task start --type <t> --scopes <s> --json` | Start task, declare required permissions |
| `ais task status <session_id> --json` | Check task status |
| `ais task credential <session_id> --resource <r> --scopes <s> --json` | Get short-lived token |
| `ais task finish <session_id>` | Finish task, revoke all credentials |
| `ais task auth <session_id> --scopes <s> --reason <r> --json` | Request additional permissions |

### Vault (View Only)

| Command | Description |
|---------|-------------|
| `ais vault list --json` | List available credentials (metadata only) |
| `ais vault list --service gmail --json` | Filter by service |

### Secure Execution (The ONLY Way to Use Credentials)

| Command | Description |
|---------|-------------|
| `ais exec --cred <id> -- <command>` | Inject credentials and execute (you never see plaintext) |
| `ais exec --cred <id> --env K=field -- <cmd>` | Custom env var mapping |
| `ais exec --cred <id> --file path=field -- <cmd>` | Write credential to temp file |
| `ais exec --cred <id> --timeout N -- <cmd>` | Set timeout (seconds) |

### Utilities

| Command | Description |
|---------|-------------|
| `ais health --json` | Check server connection |

---

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `ais verify` returns non-active | Suspended by owner or key mismatch | Check `ais whoami --json` |
| "No agent identity loaded" | No identity loaded, or device/app binding mismatch | `ais register` or check `--app` flag |
| "device binding mismatch" | Identity file was copied to another machine | Re-register on current device |
| "app binding mismatch" | Another application tried to use this identity | Use correct `--app` or re-register |
| "No active task" | Called exec without starting a task | Start a task first |
| Scope denied | capabilities/ceiling/policy restriction | Check denied_scopes for the reason |
| Connection refused | AIS server unreachable | Check `--server` address, run `ais health` |

---

## Security Rules

1. **Never hardcode credentials** — all external accounts accessed via `ais exec`
2. **Never use vault use** — that command is removed; `exec` is the only way
3. **Never log credentials** — tokens, passwords, API keys must never appear in your output
4. **Release when done** — `ais task finish` invalidates all credentials
5. **Least privilege** — only request the scopes you need
6. **Partial grants are normal** — check denied_scopes, continue with what you have
7. **Full audit coverage** — every credential use is logged
8. **Identity bound to device + app** — non-transferable

---

## Scope Format

`action:resource`, with wildcard support: `read:email`, `read:*`, `write:own_*`, `chat:*`

Owner tier determines the permission ceiling:
- **free**: `chat:*`, `search:web`, `summarize:*`, `read:own_*` (max 3 agents)
- **pro**: above + `read:*`, `write:own_*`, `execute:workflow_*` (max 20 agents)
