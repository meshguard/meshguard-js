/**
 * MeshGuard SDK for TypeScript / JavaScript
 *
 * AI agent governance — policy enforcement, audit logging, and trust management.
 *
 * @example
 * ```ts
 * import { MeshGuardClient } from "meshguard";
 *
 * const client = new MeshGuardClient({ agentToken: "tok_..." });
 *
 * const decision = await client.check("read:contacts");
 * if (decision.allowed) {
 *   // proceed
 * }
 * ```
 *
 * @packageDocumentation
 */

// Core client
export { MeshGuardClient } from "./client.js";

// Types
export type {
  MeshGuardOptions,
  PolicyDecision,
  Agent,
  CreateAgentOptions,
  AuditEntry,
  AuditLogOptions,
  HealthStatus,
  Policy,
} from "./types.js";

// Exceptions
export {
  MeshGuardError,
  AuthenticationError,
  PolicyDeniedError,
  RateLimitError,
} from "./exceptions.js";
