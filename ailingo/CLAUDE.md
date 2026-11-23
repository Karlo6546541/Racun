# CLAUDE.md — AIlingo

AIlingo je gamificirana aplikacija (stil Duolinga) koja uči kako učinkovito koristiti AI u marketingu i svakodnevnom poslu.
Zadani jezik je **hrvatski (hr)**, drugi je **engleski (en)**.

> Ovaj projekt živi u mapi `ailingo/` unutar repozitorija `Racun`. Ostatak repozitorija (Moji Računi) se ne dira.

## Zlatno pravilo: 100% bez AI-ja

- Nikakvi AI/LLM API pozivi, nikakvi API ključevi, nikakvi vanjski AI servisi. Aplikacija je deterministička i besplatna za pokretanje.
- Sva provjera odgovora ide kroz sučelje `Grader` (`src/lib/grading/`). Jedina implementacija je `DeterministicGrader`.
- Opcionalni `AiGrader` smije postojati samo kao **stub** iza feature flaga `FEATURE_AI_GRADER`, koji je **`off` po defaultu**. Bez njega sve mora raditi.
- Nikad ne dodavati `openai`, `@anthropic-ai/*`, `ai`, `langchain` i slično u `package.json`. CI test (`tests/no-ai-deps.test.ts`) to provjerava.
- `.env.example` ne smije sadržavati AI ključeve.

## Tehnološki stack

Next.js (App Router) · TypeScript (strict) · Tailwind CSS · shadcn/ui · Framer Motion · next-intl · Prisma (PostgreSQL; SQLite za lokalni razvoj) · Auth.js (email + Google) + Guest mode (`localStorage`) · Zod · Vitest · Playwright.

## Struktura mapa

```
ailingo/
├─ CLAUDE.md
├─ README.md, .env.example
├─ prisma/            schema.prisma, seed.ts, migrations/
├─ content/           SVE vježbe, rubrike i liste ključnih riječi (JSON/YAML), nikad u kodu
│  ├─ units/          unit-1-sto-je-ai/{unit.json, lesson-*.json}, unit-2-..., unit-3..6 (placeholderi)
│  ├─ badges.json, quests.json, bots.json
│  └─ placement.json
├─ messages/          hr.json, en.json (UI stringovi; sadržaj lekcija je u content/)
├─ scripts/           validate-content.ts, seed-content.ts
├─ src/
│  ├─ app/[locale]/   (landing)(app)(admin) rute: learn, lesson/[id], practice, leagues, profile, friends, settings, admin
│  ├─ app/api/        auth, progress, export, delete-account, push (svi ulazi kroz Zod)
│  ├─ components/     ui/ (shadcn), exercises/ (jedna komponenta po tipu), mascot/, gamification/
│  ├─ lib/
│  │  ├─ grading/     Grader.ts (sučelje), DeterministicGrader.ts, graders/<tip>.ts, normalize.ts
│  │  ├─ content/     schema.ts (Zod), loader.ts
│  │  ├─ srs/         sm2.ts
│  │  ├─ gamification/ xp.ts, streak.ts, hearts.ts, quests.ts, leagues.ts, badges.ts
│  │  ├─ progress/    ProgressStore.ts (sučelje) + DbStore + LocalStore (guest)
│  │  ├─ audio/       sfx.ts (Web Audio sinteza)
│  │  ├─ flags.ts, rate-limit.ts, db.ts
│  └─ middleware.ts
├─ public/            manifest.webmanifest, sw, ikone
└─ tests/             unit/ (Vitest), e2e/ (Playwright)
```

## Konvencije koda

- TypeScript `strict`, bez `any`. Svaki vanjski ulaz (API body, query, content datoteke) prolazi kroz Zod.
- Čista logika (grading, SM-2, XP, streak, lige) je u `src/lib/**` kao **čiste funkcije bez React/DB ovisnosti** da se lako testira.
- Komponente: funkcijske, `"use client"` samo gdje treba. Jedna komponenta po tipu vježbe, sve implementiraju isti `ExerciseProps`.
- Imenovanje: datoteke `kebab-case`, komponente `PascalCase`, funkcije `camelCase`, Prisma modeli `PascalCase`.
- Korisnički tekst nikad hardkodiran u komponentama: `messages/{hr,en}.json` (UI) ili `content/` (lekcije).
- Datumi i "dan" streaka računaju se u korisnikovoj vremenskoj zoni (`Europe/Zagreb` default), pohrana u UTC.

## Pravila sadržaja

- Svaka lekcija: 8–12 vježbi, 3–5 min, najmanje 3 različita tipa vježbe.
- Svaka vježba ima `explanation` (hr + en) koji se prikazuje nakon odgovora.
- Rubric Checker: pravila i ključne riječi su **u datoteci vježbe** (`rubric.criteria[].keywords`), uz `model_answer`. UI uvijek jasno kaže: *"Automatska kontrolna lista elemenata, a ne AI ocjena kvalitete."*
- Hrvatski se uspoređuje normalizirano: lowercase, `č/ć→c`, `š→s`, `ž→z`, `đ→dj/d`, trim, skupljanje razmaka (`normalize.ts`).
- `npm run validate:content` mora proći prije svakog commita koji dira `content/`.

## Pravila razvoja (workflow)

1. Radi se po fazama 1–5. Ne preskakati faze, ne počinjati sljedeću bez zelenog lint + testova.
2. Nakon svake faze: `npm run lint && npm run typecheck && npm run test`, zatim jasan git commit (`feat(faza-N): ...`).
3. Tipovi vježbi se dodaju na 4 mjesta: Zod shema, grader, React komponenta, primjer u contentu + test.
4. Bez novih zavisnosti bez razloga. Preferirati lagana rješenja (Web Audio umjesto audio datoteka).
5. Pristupačnost nije dodatak: svaka interaktivna komponenta ima tipkovnički put, ARIA oznake, `prefers-reduced-motion` i kontrast ≥ 4.5:1. Drag-and-drop uvijek ima tap/tipkovničku alternativu.
6. Sigurnost/GDPR: rate limiting na auth rutama, izvoz podataka (JSON), trajno brisanje računa, nikakvi trackeri trećih strana.
7. Monetizacija: besplatno je 10 min aktivnog učenja dnevno (`FREE_DAILY_MINUTES`, konfigurabilno), Premium je neograničen. Srca i sam sadržaj nisu iza plaćanja. Vrijeme se mjeri i provjerava na serveru, a Premium se aktivira isključivo iz potpisanog Stripe webhooka.

## Naredbe (cilj nakon Faze 1)

```
npm run dev | build | lint | typecheck | test | test:e2e
npm run validate:content
npx prisma migrate dev | db seed
```
