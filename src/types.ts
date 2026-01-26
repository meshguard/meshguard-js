/**
 * MeshGuard TypeScript Types
 */

/** Configuration options for the MeshGuard client. */
export interface MeshGuardOptions {
  /** MeshGuard gateway URL. Falls back to MESHGUARD_GATEWAY_URL env var. */
  gatewayUrl?: string;
  /** Agent JWT token. Falls back to MESHGUARD_AGENT_TOKEN env var. */
  agentToken?: string;
  /** Admin token for management APIs. Falls back to MESHGUARD_ADMIN_TOKEN env var. */
  adminToken?: string;
  /** Request timeout in milliseconds. Default: 30000. */
  timeout?: number;
  /** Optional trace ID for request correlation. Auto-generated if omitted. */
  traceId?: string;
}

/** Result of a policy evaluation. */
export interface PolicyDecision {
  /** Whether the action is allowed. */
  allowed: boolean;
  /** The action that was checked. */
  action: string;
  /** The decision result: "allow" or "deny". */
  decision: "allow" | "deny";
  /** The policy that produced this decision. */
  policy?: string;
  /** The specific rule that matched. */
  rule?: string;
  /** Human-readable reason for the decision. */
  reason?: string;
  /** Trace ID for request correlation. */
  traceId?: string;
}

/** A MeshGuard agent identity. */
export interface Agent {
  /** Unique agent identifier. */
  id: string;
  /** Display name. */
  name: string;
  /** Trust tier (e.g., "verified", "untrusted"). */
  trustTier: string;
  /** Tags associated with this agent. */
  tags: string[];
  /** Organization ID. */
  orgId?: string;
}

/** Options for creating an agent. */
export interface CreateAgentOptions {
  /** Agent display name. */
  name: string;
  /** Trust tier. Default: "verified". */
  trustTier?: string;
  /** Tags to assign. */
  tags?: string[];
}

/** An entry in the audit log. */
export interface AuditEntry {
  /** Unique entry ID. */
  id: string;
  /** Timestamp of the entry. */
  timestamp: string;
  /** The action that was evaluated. */
  action: string;
  /** The decision: "allow" or "deny". */
  decision: string;
  /** Agent ID that performed the action. */
  agentId?: string;
  /** Policy that was evaluated. */
  policy?: string;
  /** Additional metadata. */
  [key: string]: unknown;
}

/** Options for querying the audit log. */
export interface AuditLogOptions {
  /** Maximum number of entries to return. Default: 50. */
  limit?: number;
  /** Filter by decision ("allow" or "deny"). */
  decision?: string;
}

/** Gateway health status. */
export interface HealthStatus {
  status: string;
  [key: string]: unknown;
}

/** A policy definition. */
export interface Policy {
  id: string;
  name: string;
  [key: string]: unknown;
}
