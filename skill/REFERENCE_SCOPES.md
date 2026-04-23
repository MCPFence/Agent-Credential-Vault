# AIS Scope & Protocol Reference

## Scope Pattern Syntax

Scopes follow `action:resource` format with wildcard support:

```
read:email          -- Read email access
read:*              -- Read anything
write:own_*         -- Write only owned resources
chat:*              -- Chat with any service
deploy:production   -- Deploy to production
execute:workflow_*  -- Execute any workflow
```

**Wildcard rules:**
- `*` matches any single segment
- `read:*` matches `read:email`, `read:contacts`, etc.
- `fnmatch` is used for pattern matching

## Standard Scope Prefixes

| Prefix | Description |
|--------|-------------|
| `read:` | Read access to a resource |
| `write:` | Write/modify access |
| `chat:` | Conversational access |
| `search:` | Search capability |
| `summarize:` | Summarization access |
| `execute:` | Execute workflows/actions |
| `deploy:` | Deployment operations |
| `query:` | Analytics/query access |

## Tier-Based Ceilings

### Free Tier
```python
scope_ceiling = ["chat:*", "search:web", "summarize:*", "read:own_*"]
max_agents = 3
max_delegation_depth = 1
data_ceiling = "internal"
```

### Pro Tier
```python
scope_ceiling = ["chat:*", "search:*", "summarize:*", "read:*", "write:own_*", "execute:workflow_*"]
max_agents = 20
max_delegation_depth = 3
data_ceiling = "confidential"
```

## Protocol Token Formats

### MCP Token Claims
```json
{
  "iss": "aib",
  "sub": "agt_xxx",
  "aud": "target-service",
  "scope": "read:email chat:support",
  "owner_id": "pri_xxx",
  "delegation_chain_hash": "sha256:...",
  "exp": 1234567890
}
```

### A2A Agent Card
```json
{
  "name": "email-assistant",
  "description": "...",
  "url": "https://aib/api/v1/agents/agt_xxx",
  "securitySchemes": {
    "bearer": { "type": "http", "scheme": "bearer" }
  },
  "capabilities": { "streaming": false, "pushNotifications": false }
}
```

## Data Classification Levels

| Level | Description |
|-------|-------------|
| `public` | Public data, no restrictions |
| `internal` | Internal use, default level |
| `confidential` | Sensitive business data |
| `restricted` | Highly restricted (PII, financial) |

## Group-Based Enterprise Ceilings

| Group | Scopes | Data Level |
|-------|--------|------------|
| `agent-admins` | `*` (all) | restricted |
| `agent-users` | `read:*`, `write:own_*`, `chat:*` | confidential |
| `agent-viewers` | `read:*`, `chat:*` | internal |

## Rate Limits

| Resource | Default Limit |
|----------|---------------|
| Vault credential use | 60/hour per credential |
| Token issuance | No hard limit (audit logged) |
| TaskSession | 100 tool calls per session |
| TaskSession TTL | 30 minutes default |
