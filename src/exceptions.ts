/**
 * MeshGuard Exceptions
 */

/** Base error for all MeshGuard errors. */
export class MeshGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeshGuardError";
    // Fix prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Raised when authentication fails (401). */
export class AuthenticationError extends MeshGuardError {
  constructor(message: string = "Invalid or expired token") {
    super(message);
    this.name = "AuthenticationError";
  }
}

/** Raised when an action is denied by policy (403). */
export class PolicyDeniedError extends MeshGuardError {
  /** The action that was denied. */
  readonly action: string;
  /** The policy that denied the action. */
  readonly policy?: string;
  /** The specific rule that matched. */
  readonly rule?: string;
  /** Human-readable reason for denial. */
  readonly reason: string;

  constructor(options: {
    action: string;
    policy?: string;
    rule?: string;
    reason?: string;
  }) {
    const { action, policy, rule, reason = "Access denied by policy" } = options;

    let message = `Action '${action}' denied`;
    if (policy) message += ` by policy '${policy}'`;
    if (rule) message += ` (rule: ${rule})`;
    message += `: ${reason}`;

    super(message);
    this.name = "PolicyDeniedError";
    this.action = action;
    this.policy = policy;
    this.rule = rule;
    this.reason = reason;
  }
}

/** Raised when rate limit is exceeded (429). */
export class RateLimitError extends MeshGuardError {
  constructor(message: string = "Rate limit exceeded") {
    super(message);
    this.name = "RateLimitError";
  }
}
