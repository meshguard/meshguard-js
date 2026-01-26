/**
 * MeshGuard LangChain.js Integration
 *
 * Provides wrappers for governing LangChain tools with MeshGuard policy.
 *
 * @example
 * ```ts
 * import { MeshGuardClient } from "meshguard";
 * import { GovernedTool, GovernedToolkit } from "meshguard/langchain";
 * ```
 */

import { MeshGuardClient } from "./client.js";
import { PolicyDeniedError } from "./exceptions.js";

// ---------------------------------------------------------------------------
// Generic tool shape — keeps LangChain an optional peer dependency
// ---------------------------------------------------------------------------

/** Minimal interface matching LangChain `StructuredTool` / `Tool`. */
export interface LangChainTool {
  name: string;
  description: string;
  invoke(input: unknown, config?: unknown): Promise<unknown>;
  // Optional legacy methods
  call?(input: unknown, config?: unknown): Promise<unknown>;
}

type DenyHandler = (
  error: PolicyDeniedError,
  ...args: unknown[]
) => unknown;

// ---------------------------------------------------------------------------
// governedTool — functional wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap a LangChain tool so every invocation is governed by MeshGuard policy.
 *
 * @example
 * ```ts
 * import { DuckDuckGoSearch } from "@langchain/community/tools/duckduckgo";
 * import { MeshGuardClient } from "meshguard";
 * import { governedTool } from "meshguard/langchain";
 *
 * const client = new MeshGuardClient();
 * const search = governedTool("read:web_search", client, new DuckDuckGoSearch());
 *
 * const result = await search.invoke("TypeScript SDK patterns");
 * ```
 */
export function governedTool<T extends LangChainTool>(
  action: string,
  client: MeshGuardClient,
  tool: T,
  onDeny?: DenyHandler,
): T {
  // Create a proxy that intercepts invoke / call
  return new Proxy(tool, {
    get(target, prop, receiver) {
      if (prop === "invoke" || prop === "call") {
        return async (...args: unknown[]) => {
          try {
            await client.enforce(action);
            const fn = Reflect.get(target, prop, receiver) as (
              ...a: unknown[]
            ) => Promise<unknown>;
            return fn.apply(target, args);
          } catch (err) {
            if (err instanceof PolicyDeniedError && onDeny) {
              return onDeny(err, ...args);
            }
            throw err;
          }
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

// ---------------------------------------------------------------------------
// GovernedTool — class wrapper (mirrors Python GovernedTool)
// ---------------------------------------------------------------------------

/**
 * Wraps an existing LangChain tool with MeshGuard governance.
 *
 * @example
 * ```ts
 * const governed = new GovernedTool({
 *   tool: myTool,
 *   action: "read:web_search",
 *   client,
 * });
 * const result = await governed.invoke("query");
 * ```
 */
export class GovernedTool implements LangChainTool {
  readonly name: string;
  readonly description: string;
  readonly action: string;

  private readonly tool: LangChainTool;
  private readonly client: MeshGuardClient;
  private readonly onDeny?: DenyHandler;

  constructor(options: {
    tool: LangChainTool;
    action: string;
    client: MeshGuardClient;
    onDeny?: DenyHandler;
  }) {
    this.tool = options.tool;
    this.action = options.action;
    this.client = options.client;
    this.onDeny = options.onDeny;

    this.name = this.tool.name;
    this.description = this.tool.description;
  }

  /** Invoke the tool with governance. */
  async invoke(input: unknown, config?: unknown): Promise<unknown> {
    try {
      await this.client.enforce(this.action);
      return this.tool.invoke(input, config);
    } catch (err) {
      if (err instanceof PolicyDeniedError && this.onDeny) {
        return this.onDeny(err, input, config);
      }
      throw err;
    }
  }

  /** Legacy call method. */
  async call(input: unknown, config?: unknown): Promise<unknown> {
    return this.invoke(input, config);
  }
}

// ---------------------------------------------------------------------------
// GovernedToolkit — govern multiple tools at once
// ---------------------------------------------------------------------------

/**
 * Govern a collection of LangChain tools with MeshGuard policies.
 *
 * @example
 * ```ts
 * const toolkit = new GovernedToolkit({
 *   tools: [searchTool, calcTool],
 *   client,
 *   actionMap: {
 *     "search": "read:web_search",
 *     "calculator": "execute:math",
 *   },
 *   defaultAction: "execute:tool",
 * });
 *
 * const governedTools = toolkit.getTools();
 * ```
 */
export class GovernedToolkit {
  private readonly tools: LangChainTool[];
  private readonly client: MeshGuardClient;
  private readonly actionMap: Record<string, string>;
  private readonly defaultAction: string;
  private readonly onDeny?: DenyHandler;

  constructor(options: {
    tools: LangChainTool[];
    client: MeshGuardClient;
    actionMap?: Record<string, string>;
    defaultAction?: string;
    onDeny?: DenyHandler;
  }) {
    this.tools = options.tools;
    this.client = options.client;
    this.actionMap = options.actionMap ?? {};
    this.defaultAction = options.defaultAction ?? "execute:tool";
    this.onDeny = options.onDeny;
  }

  /** Get the MeshGuard action for a tool. */
  getAction(tool: LangChainTool): string {
    return this.actionMap[tool.name] ?? this.defaultAction;
  }

  /** Return governed versions of all tools. */
  getTools(): GovernedTool[] {
    return this.tools.map(
      (tool) =>
        new GovernedTool({
          tool,
          action: this.getAction(tool),
          client: this.client,
          onDeny: this.onDeny,
        }),
    );
  }
}
