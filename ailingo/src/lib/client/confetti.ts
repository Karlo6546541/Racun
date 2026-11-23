"use client";
export function confetti() {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cv = document.createElement("canvas");
  cv.setAttribute("aria-hidden", "true");
  Object.assign(cv.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "70" });
  cv.width = innerWidth;
  cv.height = innerHeight;
  document.body.appendChild(cv);
  const c = cv.getContext("2d")!;
  const cols = ["#58cc02", "#1cb0f6", "#ffc800", "#ff4b4b", "#ce82ff"];
  const P = Array.from({ length: 140 }, (_, i) => ({ x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.5, vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 4, s: 5 + Math.random() * 7, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: cols[i % 5] }));
  let f = 0;
  const step = () => {
    c.clearRect(0, 0, cv.width, cv.height);
    for (const p of P) {
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      p.vy += 0.03;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.r);
      c.fillStyle = p.c;
      c.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
      c.restore();
    }
    if (++f < 170) requestAnimationFrame(step);
    else cv.remove();
  };
  requestAnimationFrame(step);
}
