import { z } from "zod";
import { AppError, jsonError } from "./errors";
import { clientIp, rateLimit } from "./ratelimit";

/** Wraps a JSON route: parses the body with Zod, maps errors to status codes. */
export function jsonRoute<S extends z.ZodTypeAny, R>(schema: S, fn: (input: z.infer<S>, req: Request) => Promise<R>, opts: { limit?: [number, number] } = {}) {
  return async (req: Request) => {
    try {
      if (opts.limit) await rateLimit(`${new URL(req.url).pathname}:${clientIp(req.headers)}`, opts.limit[0], opts.limit[1]);
      const body = await req.json().catch(() => {
        throw new AppError("BAD_REQUEST", "Invalid JSON");
      });
      const parsed = schema.safeParse(body);
      if (!parsed.success) throw new AppError("BAD_REQUEST", parsed.error.issues.map((i) => i.message).join("; "));
      return Response.json(await fn(parsed.data, req));
    } catch (e) {
      return jsonError(e);
    }
  };
}
