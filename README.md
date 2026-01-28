# MeshGuard SDK for TypeScript / JavaScript

> AI agent governance — policy enforcement, audit logging, and trust management.

[![npm](https://img.shields.io/npm/v/meshguard)](https://www.npmjs.com/package/meshguard)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

MeshGuard provides governance guardrails for AI agents. This SDK lets your TypeScript/JavaScript agents enforce policies, generate audit trails, and manage trust — with zero runtime dependencies.

## Features

- 🛡️ **Policy enforcement** — check, enforce, or govern any action
- 📋 **Audit logging** — full trail of every decision
- 🤖 **Agent management** — create, list, and revoke agents
- 🔗 **LangChain.js integration** — govern tools and toolkits
- 📦 **Zero runtime deps** — uses native `fetch` (Node 18+)
- 🎯 **Full TypeScript** — complete type definitions
- 🔄 **Dual output** — ESM + CommonJS

## Installation

```bash
npm install meshguard
```

## Quick Start

```ts
import { MeshGuardClient } from "meshguard";

// Connect to MeshGuard (free tier available at meshguard.app)
const client = new MeshGuardClient({
  agentToken: "your-agent-token",  // Get your token at meshguard.app
});

// Check if an action is allowed
const decision = await client.check("read:contacts");
if (decision.allowed) {
  console.log("Access granted!");
}
```

> **Pro tip:** Need advanced features like SSO, custom policies, or dedicated support? Check out [MeshGuard Pro and Enterprise](https://meshguard.app/pricing).

## Configuration

The client reads configuration from constructor options or environment variables:

| Option       | Env Variable             | Default                           |
| ------------ | ------------------------ | --------------------------------- |
| `gatewayUrl` | `MESHGUARD_GATEWAY_URL`  | `https://dashboard.meshguard.app` |
| `agentToken` | `MESHGUARD_AGENT_TOKEN`  | —                                 |
| `adminToken` | `MESHGUARD_ADMIN_TOKEN`  | —                                 |
| `timeout`    | —                        | `30000` (ms)                      |
| `traceId`    | —                        | Auto-generated UUID               |

```ts
// Using environment variables (zero-config)
const client = new MeshGuardClient();

// Explicit options override env vars
const client = new MeshGuardClient({
  agentToken: process.env.MY_TOKEN,
});

// Self-hosted (Enterprise only)
const client = new MeshGuardClient({
  gatewayUrl: "https://meshguard.yourcompany.com",
  agentToken: process.env.MY_TOKEN,
});
```

## Core Governance

### check() — Non-throwing policy check

Returns a `PolicyDecision` — never throws on deny.

```ts
const decision = await client.check("read:contacts");

if (decision.allowed) {
  const contacts = await fetchContacts();
} else {
  console.log(`Denied: ${decision.reason}`);
  console.log(`Policy: ${decision.policy}, Rule: ${decision.rule}`);
}
```

### enforce() — Throwing policy check

Throws `PolicyDeniedError` if the action is denied.

```ts
import { PolicyDeniedError } from "meshguard";

try {
  await client.enforce("write:email");
  await sendEmail(to, subject, body);
} catch (err) {
  if (err instanceof PolicyDeniedError) {
    console.error(`Blocked by policy: ${err.policy}`);
  }
}
```

### govern() — Governed function execution

Combines enforcement with execution — the function only runs if allowed.

```ts
// Sync or async functions work
const contacts = await client.govern("read:contacts", async () => {
  return db.contacts.findAll();
});

// With resource context
const file = await client.govern(
  "read:file",
  () => fs.readFileSync("/etc/config"),
  "/etc/config",
);
```

## Proxy Requests

Route HTTP requests through the MeshGuard governance proxy:

```ts
// GET through proxy
const response = await client.get("/api/users", "read:users");

// POST through proxy
const response = await client.post("/api/users", "write:users", {
  body: JSON.stringify({ name: "Alice" }),
  headers: { "Content-Type": "application/json" },
});

// Generic method
const response = await client.request("PATCH", "/api/users/1", "write:users", {
  body: JSON.stringify({ name: "Bob" }),
});
```

## Admin Operations

These require an `adminToken`:

### Agent Management

```ts
const admin = new MeshGuardClient({
  adminToken: "your-admin-token",
});

// List all agents
const agents = await admin.listAgents();
for (const agent of agents) {
  console.log(`${agent.name} (${agent.trustTier})`);
}

// Create a new agent
const result = await admin.createAgent({
  name: "data-bot",
  trustTier: "verified",
  tags: ["production", "data-team"],
});

// Revoke an agent
await admin.revokeAgent("agent-id-123");
```

### Audit Log

```ts
// Get recent entries
const entries = await admin.getAuditLog({ limit: 100 });

// Filter by decision
const denials = await admin.getAuditLog({
  limit: 50,
  decision: "deny",
});
```

### Policies

```ts
const policies = await admin.listPolicies();
```

## Health Check

```ts
// Detailed health info
const status = await client.health();

// Quick boolean check
if (await client.isHealthy()) {
  console.log("Gateway is up");
}
```

## LangChain.js Integration

Govern LangChain tools with MeshGuard policies:

```ts
import { MeshGuardClient } from "meshguard";
import {
  GovernedTool,
  GovernedToolkit,
  governedTool,
} from "meshguard/langchain";
```

### Wrap a single tool

```ts
import { DuckDuckGoSearch } from "@langchain/community/tools/duckduckgo";

const client = new MeshGuardClient();
const search = new DuckDuckGoSearch();

// Functional wrapper
const governed = governedTool("read:web_search", client, search);
const result = await governed.invoke("TypeScript SDK patterns");

// Class wrapper
const governedSearch = new GovernedTool({
  tool: search,
  action: "read:web_search",
  client,
  onDeny: (err) => `Search blocked: ${err.reason}`,
});
```

### Govern a toolkit

```ts
const toolkit = new GovernedToolkit({
  tools: [searchTool, calcTool, emailTool],
  client,
  actionMap: {
    search: "read:web_search",
    calculator: "execute:math",
    email: "write:email",
  },
  defaultAction: "execute:tool",
});

const governedTools = toolkit.getTools();
// Pass governedTools to your LangChain agent
```

## Error Handling

All errors extend `MeshGuardError`:

```ts
import {
  MeshGuardError,
  PolicyDeniedError,
  AuthenticationError,
  RateLimitError,
} from "meshguard";

try {
  await client.enforce("dangerous:action");
} catch (err) {
  if (err instanceof PolicyDeniedError) {
    // Action was denied by policy
    console.log(err.action);  // "dangerous:action"
    console.log(err.policy);  // "safety-policy"
    console.log(err.rule);    // "block-dangerous"
    console.log(err.reason);  // "Action not permitted"
  } else if (err instanceof AuthenticationError) {
    // Token is invalid or expired
  } else if (err instanceof RateLimitError) {
    // Too many requests
  } else if (err instanceof MeshGuardError) {
    // Other gateway error
  }
}
```

## Python SDK

Looking for the Python SDK? See [meshguard-python](https://github.com/meshguard/meshguard-python).

## Requirements

- **Node.js 18+** (uses native `fetch` and `crypto.randomUUID`)
- **TypeScript 5.0+** (optional — works with plain JavaScript too)

## License

MIT — see [LICENSE](./LICENSE).
