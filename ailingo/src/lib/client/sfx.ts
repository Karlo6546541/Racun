"use client";
/** Lightweight synthesized sound effects (Web Audio). No audio files, no external requests. */
let ctx: AudioContext | null = null;
let enabled = true;
export function setSound(on: boolean) {
  enabled = on;
}
function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}
function tone(f: number, d: number, type: OscillatorType = "sine", t0 = 0, g = 0.15) {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const v = a.createGain();
  const t = a.currentTime + t0;
  o.type = type;
  o.frequency.value = f;
  v.gain.setValueAtTime(0, t);
  v.gain.linearRampToValueAtTime(g, t + 0.01);
  v.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(v);
  v.connect(a.destination);
  o.start(t);
  o.stop(t + d + 0.03);
}
const SFX = {
  tap: () => tone(520, 0.05, "triangle", 0, 0.05),
  correct: () => {
    tone(660, 0.12);
    tone(880, 0.2, "sine", 0.1);
  },
  wrong: () => {
    tone(220, 0.18, "sawtooth", 0, 0.07);
    tone(160, 0.28, "sawtooth", 0.12, 0.07);
  },
  combo: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, "triangle", i * 0.07)),
  finish: () => [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, "triangle", i * 0.12)),
};
export type Sfx = keyof typeof SFX;
export function sfx(name: Sfx) {
  if (!enabled) return;
  try {
    SFX[name]();
  } catch {
    /* audio is optional */
  }
}
