# CLAUDE.md — AIlingo

AIlingo je gamificirana aplikacija (stil Duolinga) koja uči kako učinkovito koristiti AI u marketingu i svakodnevnom poslu.
Zadani jezik je **hrvatski (hr)**, drugi je **engleski (en)**.

> Ovaj projekt živi u mapi `ailingo/` unutar repozitorija `Racun`. Ostatak repozitorija (Moji Računi) se ne dira.

## Zlatno pravilo: 100% bez AI-ja

- Nikakvi AI/LLM API pozivi, nikakvi API ključevi, nikakvi vanjski AI servisi. Aplikacija je deterministička i besplatna za pokretanje.
- Sva provjera odgovora ide kroz sučelje `Grader` (`src/lib/grading/`) i to **na serveru**. Preglednik nikad ne dobiva točne odgovore (`present.ts`).
- Opcionalni `AiGrader` smije postojati samo kao **stub** iza feature flaga `FEATURE_AI_GRADER`, koji je **`off` po defaultu**. Bez njega sve mora raditi.
- Nikad ne dodavati `openai`, `@anthropic-ai/*`, `ai`, `langchain` i slično u `package.json`. CI test (`tests/no-ai-deps.test.ts`) to provjerava.
- `.env.example` ne smije sadržavati AI ključeve.

## Tehnološki stack

Next.js 15 (App Router) · TypeScript (strict) · Tailwind CSS 4 · next-intl · Prisma 6 (PostgreSQL svugdje) · Stripe · Auth.js (email + Google) + Guest mode (`localStorage`) · Zod · Vitest · Playwright.

## Struktura mapa

```
ailingo/
├─ CLAUDE.md · README.md · .env.example · vercel.json
├─ content/        SVE vježbe, rubrike i ključne riječi (JSON), meta.json (staze, bedževi, zadaci, botovi, placement)
├─ messages/       hr.json, en.json (tekstovi sučelja)
├─ prisma/         schema.prisma, migrations/, seed.ts (content → baza)
├─ scripts/        validate-content.ts
├─ src/
│  ├─ lib/         čista logika bez React/DB: content/ (Zod shema), grading/ (Grader, normalizacija, present.ts),
│  │               srs/sm2.ts, game/ (xp, streak, hearts, leagues, usage, entitlement, quests, stats), time.ts
│  ├─ server/      Prisma, prijava i gost (viewer, guest), play.ts (sesije i ocjenjivanje), game.ts (XP, zadaci, bedževi),
│  │               leagues.ts, usage.ts (dnevni limit), billing.ts (Stripe), gdpr.ts, actions.ts (server actions)
│  ├─ app/         [locale]/ stranice (landing, onboarding, (app)/learn|practice|leagues|friends|profile|settings,
│  │               play, premium, signin, admin, legal) i api/ rute
│  └─ components/  Mascot, exercises/ (10 tipova), player/, Tree, Settings, Admin …
├─ public/         manifest, sw.js, offline.html, ikone
├─ tests/          unit/ (Vitest), e2e/ (Playwright, baza mora završavati na _test)
└─ prototype/      izvorni prototip (artefakt), čita ../content
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
