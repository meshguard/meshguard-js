# Using AGT With meshguard-js

MeshGuard supports both direct TypeScript/JavaScript SDK governance and AGT-native governance. AGT is an additional policy enforcement path for teams that already use Microsoft Agent Governance Toolkit or want AGT instrumentation in selected agents.

## Direct SDK Pattern

```ts
import { MeshGuardClient } from "meshguard";

const client = new MeshGuardClient({ agentToken: process.env.MESHGUARD_AGENT_TOKEN });
const decision = await client.check("read:contacts");
```

## AGT Adapter Pattern

```ts
import { MeshGuardPolicyBackend } from "@meshguard/agt";

const backend = new MeshGuardPolicyBackend({
  gatewayUrl: "https://gateway.meshguard.app",
  tenantId: "acme-corp",
  agentToken: process.env.MESHGUARD_AGENT_TOKEN!,
});
```

## How To Use Both

1. Keep current `meshguard-js` integrations in place.
2. Add AGT instrumentation where it fits a new or existing agent workflow.
3. Store policies in AGT-compatible YAML when you want shared policy files across paths.
4. Point both paths at the same MeshGuard tenant, policies, audit log, and operator console.
5. Choose the enforcement path per agent, framework, and deployment architecture.
