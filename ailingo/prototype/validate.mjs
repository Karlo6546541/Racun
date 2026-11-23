// Prototype content validator (plain Node, no deps). The real app uses Zod (npm run validate:content).
import { readFileSync } from "node:fs";
const rd = (f) => JSON.parse(readFileSync(new URL("./content/" + f, import.meta.url), "utf8"));
const errs = [];
const err = (m) => errs.push(m);
const isT = (t) => Array.isArray(t) && t.length === 2 && t.every((s) => typeof s === "string" && s.trim());
const need = (c, id, k) => { if (!isT(c[k])) err(`${id}: "${k}" must be [hr, en]`); };

const meta = rd("meta.json");
const byUnit = {};
for (const f of meta.unitFiles) { const d = rd(f); for (const u of Array.isArray(d) ? d : [d]) { const df = meta.unitDefaults[u.id]; if (df) { u.track ||= df.track; u.level ||= df.level; } u.key ||= "u" + u.order; u.lessons.forEach((l, i) => { l.id ||= u.key + "l" + (i + 1); l.exercises.forEach((e, j) => { e.id ||= l.id + "e" + (j + 1); }); }); byUnit[u.id] = u; } }
const units = [];
for (const t of meta.tracks) for (const id of t.order) { if (!byUnit[id]) err(`track ${t.id}: unknown unit ${id}`); else { if (byUnit[id].track !== t.id) err(`${id}: track mismatch`); units.push(byUnit[id]); } }
for (const id of Object.keys(byUnit)) if (!units.includes(byUnit[id])) err(`unit ${id} is not in any track order`);
const ids = new Set();
const types = new Set();
for (const u of units) {
  for (const l of u.lessons) {
    if (l.exercises.length < 8 || l.exercises.length > 12) err(`${l.id}: needs 8-12 exercises, has ${l.exercises.length}`);
    const lt = new Set(l.exercises.map((e) => e.type));
    if (lt.size < 3) err(`${l.id}: needs at least 3 exercise types`);
    for (const e of l.exercises) {
      if (ids.has(e.id)) err(`duplicate id ${e.id}`);
      ids.add(e.id); types.add(e.type);
      need(e, e.id, "q"); need(e, e.id, "explain");
      switch (e.type) {
        case "mc": case "doctor": case "compare": {
          const opts = e.type === "compare" ? [e.a, e.b] : e.options;
          if (e.type === "compare") { need(e, e.id, "a"); need(e, e.id, "b"); }
          if (!opts || opts.length < 2 || opts.length > 4) err(`${e.id}: 2-4 options`);
          if (!(e.answer >= 0 && e.answer < (opts || []).length)) err(`${e.id}: bad answer index`);
          if (e.type === "doctor") { need(e, e.id, "bad"); (e.options || []).forEach((o) => { if (!isT(o.t) || !isT(o.why)) err(`${e.id}: option needs t+why`); }); }
          else if (e.type === "mc") (e.options || []).forEach((o) => { if (!isT(o)) err(`${e.id}: option must be [hr,en]`); });
          break; }
        case "tf": if (typeof e.answer !== "boolean") err(`${e.id}: answer boolean`); break;
        case "fill":
          if (!e.answers?.hr?.length || !e.answers?.en?.length) err(`${e.id}: answers hr+en`);
          if (!/___/.test(e.q?.[0] || "") || !/___/.test(e.q?.[1] || "")) err(`${e.id}: q needs ___ in both languages`);
          break;
        case "build": if (e.slots?.length !== e.parts?.length || e.parts.length < 4) err(`${e.id}: slots/parts mismatch`); e.parts.forEach((p) => { if (!isT(p)) err(`${e.id}: part`); }); break;
        case "match": if (!e.pairs || e.pairs.length < 3 || e.pairs.length > 5) err(`${e.id}: 3-5 pairs`); break;
        case "order": if (!e.steps || e.steps.length < 3) err(`${e.id}: steps`); break;
        case "spot": if (!(e.bad >= 0 && e.bad < e.segments.length)) err(`${e.id}: bad index`); break;
        case "rubric": {
          const r = e.rubric; if (!r) { err(`${e.id}: rubric`); break; }
          const sum = r.lenPts + r.vaguePts + r.criteria.reduce((a, c) => a + c.pts, 0);
          if (sum !== 100) err(`${e.id}: rubric points sum to ${sum}, need 100`);
          if (!isT(r.model)) err(`${e.id}: rubric.model`);
          r.criteria.forEach((c) => { if (!c.kw?.hr?.length || !c.kw?.en?.length || !isT(c.hint) || !isT(c.label)) err(`${e.id}/${c.id}: criterion`); });
          break; }
        default: err(`${e.id}: unknown type ${e.type}`);
      }
    }
  }
}
for (const id of meta.placement.exercises) if (!ids.has(id)) err(`placement: unknown exercise ${id}`);
for (const u of units) { need(u, u.id, "title"); need(u, u.id, "summary"); if (!(u.level >= 1 && u.level <= 3)) err(`${u.id}: level 1-3`); }
const lids = new Set(); for (const u of units) for (const l of u.lessons) { if (lids.has(l.id)) err(`dup lesson ${l.id}`); lids.add(l.id); need(l, l.id, "title"); }
for (const b of meta.badges) { const m = b.rule.stat.match(/^(unit|track):(.+)$/); if (m && m[1] === "unit" && !byUnit[m[2]]) err(`badge ${b.id}: unknown unit`); }
const want = ["mc", "tf", "fill", "build", "match", "doctor", "rubric", "spot", "compare", "order"];
for (const t of want) if (!types.has(t)) err(`no exercise of type ${t}`);

if (errs.length) { console.error("✗ Content invalid:\n - " + errs.join("\n - ")); process.exit(1); }
console.log(`✓ Content valid: ${units.length} units, ${units.reduce((a, u) => a + u.lessons.length, 0)} lessons, ${ids.size} exercises, ${types.size}/10 types`);
