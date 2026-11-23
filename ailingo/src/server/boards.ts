import { prisma } from "./db";
import { weekKey } from "@/lib/time";

export type BoardRow = { id: string; rank: number; name: string; xp: number; isMe: boolean };

/** Global top 100 (weekly from XP events, or all-time), plus your own rank if you are outside it. Guests and hidden users are excluded. */
export async function globalBoard(meId: string, allTime: boolean): Promise<BoardRow[]> {
  const rows = allTime
    ? await prisma.$queryRaw<{ id: string; name: string | null; xp: number }[]>`
        SELECT id, name, "xpTotal" AS xp FROM "User" WHERE "isGuest" = false AND "hideFromLeaderboards" = false AND "xpTotal" > 0 ORDER BY "xpTotal" DESC, id LIMIT 100`
    : await prisma.$queryRaw<{ id: string; name: string | null; xp: number }[]>`
        SELECT u.id, u.name, CAST(SUM(e.amount) AS INTEGER) AS xp FROM "XPEvent" e JOIN "User" u ON u.id = e."userId"
        WHERE e."weekKey" = ${weekKey()} AND u."isGuest" = false AND u."hideFromLeaderboards" = false
        GROUP BY u.id, u.name ORDER BY xp DESC, u.id LIMIT 100`;
  return rows.map((r, i) => ({ id: r.id, rank: i + 1, name: r.name || "AIlingo", xp: Number(r.xp), isMe: r.id === meId }));
}

export async function friendsBoard(meId: string): Promise<BoardRow[]> {
  const fs = await prisma.friendship.findMany({ where: { status: "ACCEPTED", OR: [{ requesterId: meId }, { addresseeId: meId }] } });
  const ids = [meId, ...fs.map((f) => (f.requesterId === meId ? f.addresseeId : f.requesterId))];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const xp = await prisma.xPEvent.groupBy({ by: ["userId"], where: { userId: { in: ids }, weekKey: weekKey() }, _sum: { amount: true } });
  const map = new Map(xp.map((x) => [x.userId, x._sum.amount ?? 0]));
  return users
    .map((u) => ({ id: u.id, name: u.name || "AIlingo", xp: map.get(u.id) ?? 0, isMe: u.id === meId, rank: 0 }))
    .sort((a, b) => b.xp - a.xp)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
