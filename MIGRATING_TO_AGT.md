# Migrating From meshguard-js To AGT + MeshGuard

The TypeScript SDK remains supported for existing integrations. The forward path for in-process policy enforcement is AGT-compatible policy plus MeshGuard as the managed PDP and audit plane.

## Current SDK Pattern

```ts
import { MeshGuardClient } from "meshguard";

const client = new MeshGuardClient({ agentToken: process.env.MESHGUARD_AGENT_TOKEN });
const decision = await client.check("read:contacts");
```

## Migration Path

1. Keep current SDK calls for existing production agents.
2. Move policy YAML to AGT-compatible `governance.toolkit/v1`.
3. Use MeshGuard policy-as-code checks in CI.
4. Adopt the AGT adapter for new agents and new policy features.
5. Retire direct SDK enforcement only after audit parity is verified.

