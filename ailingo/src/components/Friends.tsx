"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { addFriend, respondFriend } from "@/server/actions";

export function FriendForm() {
  const t = useTranslations("friends");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addFriend(q).catch(() => ({ ok: false, code: "notFound" as const }));
          setMsg(t(r.code ?? "notFound"));
          if (r.ok) setQ("");
        });
      }}
      style={{ display: "grid", gap: 8 }}
    >
      <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("addPh")} aria-label={t("addPh")} maxLength={120} />
      <button className="btn" disabled={pending || q.trim().length < 3}>
        {t("send")}
      </button>
      {msg && <p role="status">{msg}</p>}
    </form>
  );
}

export function FriendActions({ id, kind }: { id: string; kind: "incoming" | "friend" }) {
  const t = useTranslations("friends");
  const [pending, start] = useTransition();
  const act = (a: "accept" | "decline" | "remove") => start(async () => void (await respondFriend(id, a)));
  return kind === "incoming" ? (
    <span style={{ display: "flex", gap: 6 }}>
      <button className="btn btn-sm" disabled={pending} onClick={() => act("accept")}>
        {t("accept")}
      </button>
      <button className="btn btn-sm btn-ghost" disabled={pending} onClick={() => act("decline")}>
        {t("decline")}
      </button>
    </span>
  ) : (
    <button className="btn btn-sm btn-ghost" disabled={pending} onClick={() => act("remove")}>
      {t("remove")}
    </button>
  );
}
