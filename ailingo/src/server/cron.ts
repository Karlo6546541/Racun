import { AppError } from "./errors";

export function assertCron(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw new AppError("FORBIDDEN");
}
