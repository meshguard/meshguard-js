/**
 * MeshGuard Client Tests
 */

import {
  MeshGuardClient,
  MeshGuardError,
  AuthenticationError,
  PolicyDeniedError,
  RateLimitError,
} from "../src/index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(
  status: number,
  body: Record<string, unknown> = {},
): jest.SpyInstance {
  return jest.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Constructor / defaults
// ---------------------------------------------------------------------------

describe("MeshGuardClient constructor", () => {
  it("uses defaults when no options are provided", () => {
    const client = new MeshGuardClient();
    expect(client.gatewayUrl).toBe("http://localhost:3100");
    expect(client.traceId).toBeDefined();
  });

  it("accepts explicit options", () => {
    const client = new MeshGuardClient({
      gatewayUrl: "https://gw.example.com/",
      agentToken: "tok_abc",
      adminToken: "adm_xyz",
      timeout: 5000,
      traceId: "trace-1",
    });
    // Trailing slash should be stripped
    expect(client.gatewayUrl).toBe("https://gw.example.com");
    expect(client.agentToken).toBe("tok_abc");
    expect(client.adminToken).toBe("adm_xyz");
    expect(client.timeout).toBe(5000);
    expect(client.traceId).toBe("trace-1");
  });

  it("reads from environment variables", () => {
    process.env.MESHGUARD_GATEWAY_URL = "https://env-gw.test";
    process.env.MESHGUARD_AGENT_TOKEN = "tok_env";
    process.env.MESHGUARD_ADMIN_TOKEN = "adm_env";

    const client = new MeshGuardClient();
    expect(client.gatewayUrl).toBe("https://env-gw.test");
    expect(client.agentToken).toBe("tok_env");
    expect(client.adminToken).toBe("adm_env");

    delete process.env.MESHGUARD_GATEWAY_URL;
    delete process.env.MESHGUARD_AGENT_TOKEN;
    delete process.env.MESHGUARD_ADMIN_TOKEN;
  });
});

// ---------------------------------------------------------------------------
// check()
// ---------------------------------------------------------------------------

describe("check()", () => {
  it("returns allowed decision on 200", async () => {
    mockFetch(200, { policy: "default" });
    const client = new MeshGuardClient({ agentToken: "tok" });
    const decision = await client.check("read:contacts");

    expect(decision.allowed).toBe(true);
    expect(decision.action).toBe("read:contacts");
    expect(decision.decision).toBe("allow");
    expect(decision.policy).toBe("default");
  });

  it("returns denied decision on 403", async () => {
    mockFetch(403, {
      policy: "strict",
      rule: "no-contacts",
      message: "Denied",
    });
    const client = new MeshGuardClient({ agentToken: "tok" });
    const decision = await client.check("read:contacts");

    expect(decision.allowed).toBe(false);
    expect(decision.decision).toBe("deny");
    expect(decision.policy).toBe("strict");
    expect(decision.rule).toBe("no-contacts");
    expect(decision.reason).toBe("Denied");
  });

  it("throws MeshGuardError on 500", async () => {
    mockFetch(500, {});
    const client = new MeshGuardClient({ agentToken: "tok" });
    await expect(client.check("read:data")).rejects.toThrow(MeshGuardError);
  });
});

// ---------------------------------------------------------------------------
// enforce()
// ---------------------------------------------------------------------------

describe("enforce()", () => {
  it("returns decision when allowed", async () => {
    mockFetch(200, { policy: "default" });
    const client = new MeshGuardClient({ agentToken: "tok" });
    const decision = await client.enforce("read:contacts");
    expect(decision.allowed).toBe(true);
  });

  it("throws PolicyDeniedError when denied", async () => {
    mockFetch(403, { policy: "strict", message: "Nope" });
    const client = new MeshGuardClient({ agentToken: "tok" });
    await expect(client.enforce("write:secrets")).rejects.toThrow(
      PolicyDeniedError,
    );
  });
});

// ---------------------------------------------------------------------------
// govern()
// ---------------------------------------------------------------------------

describe("govern()", () => {
  it("executes function when allowed", async () => {
    mockFetch(200, {});
    const client = new MeshGuardClient({ agentToken: "tok" });
    const result = await client.govern("read:data", () => 42);
    expect(result).toBe(42);
  });

  it("executes async function when allowed", async () => {
    mockFetch(200, {});
    const client = new MeshGuardClient({ agentToken: "tok" });
    const result = await client.govern(
      "read:data",
      async () => "hello",
    );
    expect(result).toBe("hello");
  });

  it("does not execute function when denied", async () => {
    mockFetch(403, { message: "Denied" });
    const client = new MeshGuardClient({ agentToken: "tok" });
    const fn = jest.fn(() => "should not run");

    await expect(client.govern("write:secrets", fn)).rejects.toThrow(
      PolicyDeniedError,
    );
    expect(fn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Admin operations
// ---------------------------------------------------------------------------

describe("admin operations", () => {
  it("listAgents() parses response", async () => {
    mockFetch(200, {
      agents: [
        { id: "a1", name: "Bot A", trustTier: "verified", tags: ["prod"] },
      ],
    });
    const client = new MeshGuardClient({ adminToken: "adm" });
    const agents = await client.listAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe("Bot A");
    expect(agents[0].tags).toEqual(["prod"]);
  });

  it("createAgent() sends correct payload", async () => {
    const spy = mockFetch(200, { id: "new-1", name: "New Bot" });
    const client = new MeshGuardClient({ adminToken: "adm" });
    await client.createAgent({ name: "New Bot", trustTier: "untrusted" });

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.name).toBe("New Bot");
    expect(body.trustTier).toBe("untrusted");
  });

  it("getAuditLog() passes query params", async () => {
    const spy = mockFetch(200, { entries: [] });
    const client = new MeshGuardClient({ adminToken: "adm" });
    await client.getAuditLog({ limit: 10, decision: "deny" });

    const [url] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("limit=10");
    expect(url).toContain("decision=deny");
  });

  it("throws AuthenticationError without admin token", () => {
    const client = new MeshGuardClient();
    expect(() => client.listAgents()).rejects.toThrow(AuthenticationError);
  });
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

describe("health()", () => {
  it("returns healthy status", async () => {
    mockFetch(200, { status: "healthy" });
    const client = new MeshGuardClient();
    const h = await client.health();
    expect(h.status).toBe("healthy");
  });

  it("isHealthy() returns false on failure", async () => {
    jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    const client = new MeshGuardClient();
    expect(await client.isHealthy()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Exception hierarchy
// ---------------------------------------------------------------------------

describe("exceptions", () => {
  it("PolicyDeniedError has correct properties", () => {
    const err = new PolicyDeniedError({
      action: "write:email",
      policy: "strict",
      rule: "no-email",
      reason: "Email sending blocked",
    });
    expect(err).toBeInstanceOf(MeshGuardError);
    expect(err).toBeInstanceOf(PolicyDeniedError);
    expect(err.action).toBe("write:email");
    expect(err.policy).toBe("strict");
    expect(err.message).toContain("write:email");
    expect(err.message).toContain("strict");
    expect(err.message).toContain("Email sending blocked");
  });

  it("AuthenticationError inherits from MeshGuardError", () => {
    const err = new AuthenticationError();
    expect(err).toBeInstanceOf(MeshGuardError);
  });

  it("RateLimitError inherits from MeshGuardError", () => {
    const err = new RateLimitError();
    expect(err).toBeInstanceOf(MeshGuardError);
  });
});
