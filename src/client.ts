/**
 * MeshGuard Client
 *
 * Core client for interacting with the MeshGuard gateway.
 */

import type {
  MeshGuardOptions,
  PolicyDecision,
  Agent,
  CreateAgentOptions,
  AuditEntry,
  AuditLogOptions,
  HealthStatus,
  Policy,
} from "./types.js";

import {
  MeshGuardError,
  AuthenticationError,
  PolicyDeniedError,
  RateLimitError,
} from "./exceptions.js";

/**
 * Client for the MeshGuard governance gateway.
 *
 * @example
 * ```ts
 * const client = new MeshGuardClient({
 *   gatewayUrl: "https://dashboard.meshguard.app",
 *   agentToken: "your-agent-token",
 * });
 *
 * // Check if an action is allowed
 * const decision = await client.check("read:contacts");
 * if (decision.allowed) {
 *   // proceed
 * }
 *
 * // Or enforce (throws on deny)
 * await client.enforce("read:contacts");
 *
 * // Or govern a function
 * const result = await client.govern("read:contacts", async () => {
 *   return fetchContacts();
 * });
 * ```
 */
export class MeshGuardClient {
  readonly gatewayUrl: string;
  readonly agentToken?: string;
  readonly adminToken?: string;
  readonly timeout: number;
  readonly traceId: string;

  constructor(options: MeshGuardOptions = {}) {
    this.gatewayUrl = (
      options.gatewayUrl ??
      process.env.MESHGUARD_GATEWAY_URL ??
      "http://localhost:3100"
    ).replace(/\/+$/, "");

    this.agentToken =
      options.agentToken ?? process.env.MESHGUARD_AGENT_TOKEN;
    this.adminToken =
      options.adminToken ?? process.env.MESHGUARD_ADMIN_TOKEN;
    this.timeout = options.timeout ?? 30_000;
    this.traceId = options.traceId ?? crypto.randomUUID();
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private headers(includeAuth = true): Record<string, string> {
    const h: Record<string, string> = {
      "X-MeshGuard-Trace-ID": this.traceId,
    };
    if (includeAuth && this.agentToken) {
      h["Authorization"] = `Bearer ${this.agentToken}`;
    }
    return h;
  }

  private adminHeaders(): Record<string, string> {
    if (!this.adminToken) {
      throw new AuthenticationError("Admin token required for this operation");
    }
    return {
      "X-Admin-Token": this.adminToken,
      "X-MeshGuard-Trace-ID": this.traceId,
    };
  }

  private async handleResponse(response: Response): Promise<Record<string, unknown>> {
    if (response.status === 401) {
      throw new AuthenticationError("Invalid or expired token");
    }
    if (response.status === 403) {
      const data = await this.safeJson(response);
      throw new PolicyDeniedError({
        action: (data.action as string) ?? "unknown",
        policy: data.policy as string | undefined,
        rule: data.rule as string | undefined,
        reason: (data.message as string) ?? "Access denied by policy",
      });
    }
    if (response.status === 429) {
      throw new RateLimitError("Rate limit exceeded");
    }
    if (response.status >= 400) {
      const text = await response.text();
      throw new MeshGuardError(`Request failed: ${response.status} ${text}`);
    }
    return this.safeJson(response);
  }

  private async safeJson(response: Response): Promise<Record<string, unknown>> {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private async fetch(
    url: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------------------------------------------------------------------------
  // Core Governance
  // ---------------------------------------------------------------------------

  /**
   * Check if an action is allowed by policy.
   *
   * Returns a {@link PolicyDecision} — never throws on deny.
   */
  async check(action: string, resource?: string): Promise<PolicyDecision> {
    const h = this.headers();
    h["X-MeshGuard-Action"] = action;
    if (resource) h["X-MeshGuard-Resource"] = resource;

    try {
      const response = await this.fetch(`${this.gatewayUrl}/proxy/check`, {
        method: "GET",
        headers: h,
      });

      if (response.status === 403) {
        const data = await this.safeJson(response);
        return {
          allowed: false,
          action,
          decision: "deny",
          policy: data.policy as string | undefined,
          rule: data.rule as string | undefined,
          reason: data.message as string | undefined,
          traceId: this.traceId,
        };
      }

      const data = await this.handleResponse(response);
      return {
        allowed: true,
        action,
        decision: "allow",
        policy: data.policy as string | undefined,
        traceId: this.traceId,
      };
    } catch (err) {
      if (err instanceof PolicyDeniedError) {
        return {
          allowed: false,
          action,
          decision: "deny",
          policy: err.policy,
          rule: err.rule,
          reason: err.reason,
          traceId: this.traceId,
        };
      }
      throw err;
    }
  }

  /**
   * Enforce policy — throws {@link PolicyDeniedError} if the action is denied.
   */
  async enforce(action: string, resource?: string): Promise<PolicyDecision> {
    const decision = await this.check(action, resource);
    if (!decision.allowed) {
      throw new PolicyDeniedError({
        action,
        policy: decision.policy,
        rule: decision.rule,
        reason: decision.reason,
      });
    }
    return decision;
  }

  /**
   * Execute a function only if the action is allowed by policy.
   *
   * @example
   * ```ts
   * const contacts = await client.govern("read:contacts", async () => {
   *   return db.contacts.findAll();
   * });
   * ```
   */
  async govern<T>(
    action: string,
    fn: () => T | Promise<T>,
    resource?: string,
  ): Promise<T> {
    await this.enforce(action, resource);
    return fn();
  }

  // ---------------------------------------------------------------------------
  // Proxy Requests
  // ---------------------------------------------------------------------------

  /**
   * Make a governed request through the MeshGuard proxy.
   */
  async request(
    method: string,
    path: string,
    action: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const h: Record<string, string> = {
      ...this.headers(),
      "X-MeshGuard-Action": action,
    };

    // Merge any caller-provided headers
    if (init.headers) {
      const extra =
        init.headers instanceof Headers
          ? Object.fromEntries(init.headers.entries())
          : (init.headers as Record<string, string>);
      Object.assign(h, extra);
    }

    const response = await this.fetch(
      `${this.gatewayUrl}/proxy/${path.replace(/^\/+/, "")}`,
      { ...init, method, headers: h },
    );

    await this.handleResponse(response);
    return response;
  }

  /** GET through the governance proxy. */
  async get(path: string, action: string, init?: RequestInit): Promise<Response> {
    return this.request("GET", path, action, init);
  }

  /** POST through the governance proxy. */
  async post(path: string, action: string, init?: RequestInit): Promise<Response> {
    return this.request("POST", path, action, init);
  }

  /** PUT through the governance proxy. */
  async put(path: string, action: string, init?: RequestInit): Promise<Response> {
    return this.request("PUT", path, action, init);
  }

  /** DELETE through the governance proxy. */
  async delete(path: string, action: string, init?: RequestInit): Promise<Response> {
    return this.request("DELETE", path, action, init);
  }

  // ---------------------------------------------------------------------------
  // Health & Info
  // ---------------------------------------------------------------------------

  /** Check gateway health. */
  async health(): Promise<HealthStatus> {
    const response = await this.fetch(`${this.gatewayUrl}/health`);
    return (await response.json()) as HealthStatus;
  }

  /** Quick boolean health check. */
  async isHealthy(): Promise<boolean> {
    try {
      const h = await this.health();
      return h.status === "healthy";
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Admin Operations
  // ---------------------------------------------------------------------------

  /** List all agents (requires admin token). */
  async listAgents(): Promise<Agent[]> {
    const response = await this.fetch(`${this.gatewayUrl}/admin/agents`, {
      headers: this.adminHeaders(),
    });
    const data = await this.handleResponse(response);
    const agents = (data.agents as Array<Record<string, unknown>>) ?? [];
    return agents.map((a) => ({
      id: a.id as string,
      name: a.name as string,
      trustTier: a.trustTier as string,
      tags: (a.tags as string[]) ?? [],
      orgId: a.orgId as string | undefined,
    }));
  }

  /** Create a new agent (requires admin token). */
  async createAgent(options: CreateAgentOptions): Promise<Record<string, unknown>> {
    const response = await this.fetch(`${this.gatewayUrl}/admin/agents`, {
      method: "POST",
      headers: {
        ...this.adminHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: options.name,
        trustTier: options.trustTier ?? "verified",
        tags: options.tags ?? [],
      }),
    });
    return this.handleResponse(response);
  }

  /** Revoke an agent (requires admin token). */
  async revokeAgent(agentId: string): Promise<void> {
    const response = await this.fetch(
      `${this.gatewayUrl}/admin/agents/${agentId}`,
      { method: "DELETE", headers: this.adminHeaders() },
    );
    await this.handleResponse(response);
  }

  /** List all policies (requires admin token). */
  async listPolicies(): Promise<Policy[]> {
    const response = await this.fetch(`${this.gatewayUrl}/admin/policies`, {
      headers: this.adminHeaders(),
    });
    const data = await this.handleResponse(response);
    return (data.policies as Policy[]) ?? [];
  }

  /** Get audit log entries (requires admin token). */
  async getAuditLog(options: AuditLogOptions = {}): Promise<AuditEntry[]> {
    const params = new URLSearchParams();
    params.set("limit", String(options.limit ?? 50));
    if (options.decision) params.set("decision", options.decision);

    const response = await this.fetch(
      `${this.gatewayUrl}/admin/audit?${params}`,
      { headers: this.adminHeaders() },
    );
    const data = await this.handleResponse(response);
    return (data.entries as AuditEntry[]) ?? [];
  }
}
