/** Case- and diacritic-insensitive normalization (č ć š ž → c c s z, đ/dj → d). */
export function norm(s: string): string {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/dj/g, "d")
    .replace(/[^a-z0-9% ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Keyword matches at a word start; a keyword with a trailing space must be a whole word. */
export function hasKeyword(textNorm: string, kw: string): boolean {
  const k = norm(kw);
  if (!k) return false;
  const t = " " + textNorm + " ";
  return /\s$/.test(kw) ? t.includes(" " + k + " ") : t.includes(" " + k);
}

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}
