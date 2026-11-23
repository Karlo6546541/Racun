import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import { cookies } from "next/headers";
import { prisma } from "@/server/db";
import { friendCode, unsign } from "@/server/codes";
import { GUEST_COOKIE, mergeGuestInto } from "@/server/guest";
import { track } from "@/server/analytics";

const base = PrismaAdapter(prisma);
const adapter: Adapter = {
  ...base,
  async createUser(data: AdapterUser) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...rest } = data;
    const admins = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const user = await prisma.user.create({
      data: { ...rest, friendCode: friendCode(), role: rest.email && admins.includes(rest.email.toLowerCase()) ? "ADMIN" : "USER" },
    });
    await track("signup");
    return user as AdapterUser;
  },
};

const providers: NextAuthConfig["providers"] = [];
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) providers.push(Google({ allowDangerousEmailAccountLinking: false }));
providers.push(
  Nodemailer({
    server: process.env.EMAIL_SERVER || "smtp://localhost:25",
    from: process.env.EMAIL_FROM || "AIlingo <noreply@example.com>",
    maxAge: 15 * 60,
    async sendVerificationRequest({ identifier, url, provider }) {
      if (!process.env.EMAIL_SERVER) {
        console.log(`\n[AIlingo] Magic link for ${identifier}:\n${url}\n`);
        return;
      }
      const { createTransport } = await import("nodemailer");
      const t = createTransport(provider.server);
      await t.sendMail({
        to: identifier,
        from: provider.from,
        subject: "Prijava u AIlingo / Sign in to AIlingo",
        text: `Prijavi se / Sign in:\n${url}\n\nLink vrijedi 15 minuta. / The link is valid for 15 minutes.`,
      });
    },
  }),
);

export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  providers,
  session: { strategy: "database", maxAge: 30 * 24 * 3600 },
  pages: { signIn: "/signin", verifyRequest: "/signin?sent=1", error: "/signin" },
  trustHost: true,
  events: {
    async signIn({ user }) {
      if (!user.id) return;
      const jar = await cookies();
      const guestId = unsign(jar.get(GUEST_COOKIE)?.value);
      if (guestId && guestId !== user.id) {
        await mergeGuestInto(guestId, user.id);
        jar.delete(GUEST_COOKIE);
      }
      const admins = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (user.email && admins.includes(user.email.toLowerCase())) await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    },
  },
});
