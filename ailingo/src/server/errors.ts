export type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "BAD_REQUEST" | "PAYWALL" | "NO_HEARTS" | "LOCKED" | "TOO_FAST" | "RATE_LIMITED" | "CONFLICT";

const STATUS: Record<ErrorCode, number> = { UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, BAD_REQUEST: 400, PAYWALL: 402, NO_HEARTS: 409, LOCKED: 409, TOO_FAST: 429, RATE_LIMITED: 429, CONFLICT: 409 };

export class AppError extends Error {
  constructor(public code: ErrorCode, message?: string) {
    super(message ?? code);
  }
  get status() {
    return STATUS[this.code];
  }
}

export function jsonError(e: unknown): Response {
  if (e instanceof AppError) return Response.json({ error: e.code, message: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: "INTERNAL" }, { status: 500 });
}
