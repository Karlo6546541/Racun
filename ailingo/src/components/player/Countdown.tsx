"use client";
import { useEffect, useState } from "react";
import { secondsToMidnight } from "@/lib/time";

export function fmt(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(s).padStart(2, "0");
}

export function Countdown({ tz }: { tz: string }) {
  const [s, setS] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setS(secondsToMidnight(new Date(), tz));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tz]);
  return <span style={{ fontVariantNumeric: "tabular-nums" }}>{s === null ? "–" : fmt(s)}</span>;
}
