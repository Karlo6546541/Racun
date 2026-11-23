# Prompt: izgradi pravu AIlingo aplikaciju prema prototipu

> Zalijepi sve ispod crte u Claude Code (ili drugi agent za kodiranje) u korijenu repozitorija `Racun`.
> Prije toga provjeri da u `ailingo/` postoje `CLAUDE.md` i `prototype/`.

---

Ti si senior full-stack inženjer. Izgradi produkcijsku web aplikaciju **AIlingo** (gamificirano učenje AI-ja i marketinga u stilu Duolinga) prema postojećem prototipu.

## 0. Što već postoji (izvor istine)

- `ailingo/CLAUDE.md`: konvencije projekta. **Pročitaj ga prvi** i poštuj ga.
- `ailingo/prototype/index.html`: potpuno igriv prototip (vanilla JS). **Ponašanje, UX i tekstove prenosi 1:1**, ali u pravu arhitekturu. Čitaj ga kao specifikaciju za: grader, SM-2, XP/streak/srca, dnevne zadatke, lige s botovima, bedževe, onboarding, placement test, mascotu, zvukove, konfete.
- `ailingo/prototype/content/*.json`: **sav sadržaj** (46 lekcija, 368 vježbi, HR + EN, dvije staze: `ai` i `mk`). `meta.json` sadrži staze, razine, bedževe, zadatke, botove, placement. **Sadržaj ostaje u JSON datotekama i nikad se ne hardkodira u kod.**
- `ailingo/prototype/validate.mjs`: provjera strukture sadržaja. Zamijeni je Zod shemom (`npm run validate:content`) koja provjerava isto i više.
- Prototip je testiran skriptom koja automatski rješava svih 368 vježbi. **Napiši ekvivalentni Playwright E2E** (rješava svaku vježbu iz JSON-a, uključujući ogledne odgovore Rubric Checkera).

## 1. Neprobojna ograničenja

1. **Nikakvi AI/LLM API pozivi**, nikakvi AI ključevi. Provjera odgovora ide isključivo kroz sučelje `Grader` s `DeterministicGrader` implementacijom. `AiGrader` smije biti samo stub iza feature flaga `FEATURE_AI_GRADER` (default `off`). Dodaj test `no-ai-deps` koji pada ako se u `package.json` pojavi `openai`, `@anthropic-ai/*`, `ai`, `langchain` i slično.
2. **Server je izvor istine** za XP, streak, srca, ljestvice i vrijeme učenja. Klijentu se nikad ne vjeruje (vidi odjeljke 4 i 5).
3. Svaki ulaz kroz **Zod**. Rate limiting na auth i plaćanja. Nikakve tajne u klijentskom kodu.
4. Mobile-first, pristupačnost (tipkovnica, ARIA, kontrast, `prefers-reduced-motion`, alternativa za drag-and-drop), HR zadano, EN drugi jezik.

## 2. Tehnološki stack

Next.js (App Router) + TypeScript strict · Tailwind + shadcn/ui · Framer Motion · `next-intl` (hr default, en) · PostgreSQL + Prisma · **Auth.js v5** · **Stripe** (Checkout + Customer Portal + Webhooks) · Zod · Vitest · Playwright · deploy na Vercel + Postgres (Neon ili Supabase).

## 3. Autentifikacija (Google + gost)

- **Google prijava** (Auth.js Google provider) + **email magic link** (SMTP konfigurabilan, u dev-u ispis linka u konzolu).
- **Guest mode**: napredak u `localStorage` kroz isto sučelje `ProgressStore` (implementacije `LocalStore` i `DbStore`). Pri prijavi ili registraciji **jedan API poziv prenosi** napredak (Zod-validiran, idempotentan, bez dupliciranja XP-a, uz pravila anti-cheata iz odjeljka 4).
- Gost je ograničen istim dnevnim limitom vremena kao besplatni korisnik (odjeljak 5), praćen kroz anonimni httpOnly cookie ID na serveru, ne samo u `localStorage`.
- Rate limiting na `/api/auth/*` (npr. 10 zahtjeva/min po IP-u i po emailu).
- Sesije u bazi, sigurni cookie-ji (`Secure`, `HttpOnly`, `SameSite=Lax`), CSRF zaštita.
- Zaštićene rute: sve osim landinga, cijena i pravnih stranica. Admin rute samo za `Role.ADMIN`.

## 4. Ljestvice (leaderboard), lige, prijatelji

- **Tjedne lige** (Bronca, Srebrna, Zlatna, Safirna, Dijamantna), 30 članova po ligi, ljestvica se računa iz `XPEvent` zbroja za tekući `weekKey` (ponedjeljak, vremenska zona `Europe/Zagreb`). Prvih 10 napreduje, zadnjih 5 pada (uz uvjet `weeklyXp > 0`).
- **Seed botova** iz `content/meta.json` kad liga ima manje od 30 stvarnih članova. Botovi imaju deterministički tjedni XP (seed = `weekKey + ime + tier`), bez slučajnosti na klijentu. Označi ih diskretno u UI-ju kao simulirane.
- **Tjedni obračun** (Vercel Cron, idempotentan, zaštićen `CRON_SECRET`): zaključa tjedan, promovira/degradira, kreira nove lige.
- Dodatno: **globalna ljestvica** (top 100 ovaj tjedan i svih vremena), **ljestvica prijatelja**, vlastiti rang uvijek vidljiv.
- **Prijatelji**: dodavanje kodom ili emailom, zahtjev/prihvaćanje/blokiranje (`Friendship` s unikatnim parom), pregled niza i tjednog XP-a.
- **Anti-cheat**: XP se dodjeljuje **samo na serveru** iz provjerenih `Attempt` zapisa (server sam ocjenjuje preko `Grader`-a); dnevni strop XP-a po korisniku; `Attempt` mora referencirati postojeću vježbu i valjanu sesiju; ograničenje brzine odgovora (min. vrijeme po vježbi); sumnjive račune označi za pregled u adminu. Privatnost: javno se prikazuje samo ime/nadimak i avatar, uz opciju "sakrij me s ljestvica" u postavkama.

## 5. Monetizacija: besplatno 10 minuta dnevno

**Model**: besplatni korisnici mogu aktivno učiti **10 minuta dnevno**. Premium je neograničen. Limit je **konfigurabilan** (`FREE_DAILY_MINUTES`, default 10) i mijenja se u adminu bez deploya.

### 5.1 Što se broji kao "vrijeme učenja"
- Mjeri se **server-side**, ne klijentskom štopericom. Klijent šalje heartbeat svakih 15 s dok je kartica vidljiva (`document.visibilityState`) i dok postoji interakcija u zadnjih 30 s. Server dodaje sekunde u `DailyUsage` (korisnik + datum u `Europe/Zagreb`), uz strop od npr. 20 s po heartbeatu i idempotentne ključeve (nema duplog brojanja, nema paralelnih kartica koje zbrajaju dvostruko).
- Broje se: lekcije, Vježba (SM-2), Blitz, placement test. **Ne broje se**: pregled stabla, ljestvice, prijatelji, profil, postavke, pregled popisa grešaka i paywall ekran.
- Reset u ponoć po `Europe/Zagreb`.

### 5.2 Ponašanje kad se limit potroši
- **Meko slijetanje**: korisnik smije dovršiti trenutnu vježbu. Zatim se spremi napredak lekcije (nastavak sutra ili s Premiumom) i prikaže **paywall ekran**.
- Paywall ekran prikazuje: maskotu, "Dnevni limit od 10 min je iskorišten", **brojač do ponoći**, što je i dalje slobodno (ljestvice, prijatelji, pregled grešaka, profil), i dvije jasne opcije: **Nastavi s Premiumom** i **Vrati se sutra**. Bez lažne hitnosti, bez skrivenog zatvaranja prozora, bez manipulativnih tekstova.
- Streak se **čuva** kad je korisnik ispunio svoj dnevni cilj ili je potrošio cijeli besplatni limit (nije kažnjen zbog paywalla).
- **Srca (životi) nisu monetizirana**: obnavljaju se vremenom i Vježbom kao u prototipu. Jedini plaćeni zid je dnevni limit vremena.
- Prije limita pokaži diskretan **mjerač** ("7:20 preostalo danas") u gornjoj traci i upozorenje na 1 minutu.

### 5.3 Planovi i cijene (konfigurabilno, ne hardkodirati)
- **Free**: 10 min/dan, svi sadržaji, ljestvice, prijatelji, bedževi.
- **Premium mjesečno** (prijedlog 6,99 €) i **godišnje** (prijedlog 49,99 €), 7 dana probnog razdoblja, popust za studente kroz Stripe promo kod.
- Premium dodatno: neograničeno vrijeme, mjesečno 2 besplatna Streak Freezea, Blitz bez limita, izvanmrežni način rada za sve lekcije.
- Cijene, probno razdoblje i `FREE_DAILY_MINUTES` žive u jednoj konfiguraciji (`config/pricing.ts` + admin override).

### 5.4 Stripe integracija
- **Stripe Checkout** (subscription mode) + **Customer Portal** (otkazivanje, promjena plana, računi). Otkazivanje mora biti jednako lako kao pretplata.
- **Webhooks** s provjerom potpisa i idempotencijom (`StripeEvent` tablica): `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`. Nikad se ne vjeruje redirectu na `success_url`, entitlement se mijenja samo iz webhooka.
- Entitlement provjera **na serveru** pri svakom startu sesije, heartbeatu i spremanju pokušaja. Klijent samo prikazuje stanje.
- Grace period 3 dana pri neuspjeloj naplati prije vraćanja na Free.
- **Stripe Tax** za PDV, cijene prikazane s PDV-om u EUR. Prikaži jasne uvjete, politiku otkazivanja i napomenu o pravu na odustajanje prema EU pravilima za potrošače.
- Napomena: u PWA/webu koristi se Stripe. Ako se ikad pakira kao native aplikacija, trgovine traže vlastitu naplatu (izvan opsega ovog zadatka).
- Brisanje računa (GDPR) **automatski otkazuje Stripe pretplatu** i briše/anonimizira kupca.

### 5.5 Analitika konverzije (privatno)
- Samo agregirani događaji bez trećih trackera: `paywall_shown`, `checkout_started`, `subscribed`, `canceled`. Prikaži u adminu.

## 6. Prisma model

Zadrži svih 15 modela iz `ailingo/CLAUDE.md` plan (User, Unit, Lesson, Exercise, Attempt, Progress, XPEvent, Streak, DailyQuest, Badge, UserBadge, League, LeagueMembership, Friendship, ReviewItem) plus: `Account`, `Session`, `VerificationToken`, `PushSubscription` i **novo**:

- `Subscription` (userId unique, stripeCustomerId, stripeSubscriptionId, status, plan, currentPeriodEnd, cancelAtPeriodEnd, trialEnd)
- `DailyUsage` (userId ili anonId, date, seconds, unique po korisniku i datumu)
- `StripeEvent` (id događaja kao ključ, type, processedAt)
- `AppConfig` (key/value za `FREE_DAILY_MINUTES`, cijene, flagove)
- `User.hideFromLeaderboards`, `User.anonId` za prijenos gosta
- Indeksi za ljestvice: `XPEvent(weekKey, userId)`, `LeagueMembership(leagueId, weeklyXp)`.

Tipovi `Unit/Lesson/Exercise` su kopija sadržaja iz JSON-a (seed skripta s `contentHash`), JSON ostaje izvor istine. Kôd mora podržavati i opcionalne `track` i `level` polja jedinica.

## 7. Funkcionalnosti za prenijeti iz prototipa

Landing · onboarding (ime, cilj, razina, dnevni cilj 5/10/15/20, placement test) · stablo vještina s dvije staze i razinama · player lekcija (svih 10 tipova + Blitz, tipkovnica, tap-to-place i drag-and-drop) · Grader s normalizacijom hrvatskih znakova · Rubric Checker s jasnom porukom "automatska kontrolna lista, a ne AI ocjena" · XP, combo, streak + Streak Freeze, srca · dnevni zadaci · bedževi · ekrani prelaska razine i konfeti · maskota Robi · Web Audio zvukovi (isključivi) · Vježba (SM-2, pregled grešaka, Blitz) · lige, prijatelji, profil s kalendarom · postavke (jezik, zvuk, cilj, trgovina dragulja, GDPR izvoz i brisanje) · **admin** za pregled i uređivanje lekcija i vježbi (Zod validacija, pregled prije spremanja, izvoz natrag u JSON) te konfiguraciju limita i cijena · PWA s offlineom za učitane lekcije i prefetchom sljedeće vježbe · Web Push podsjetnici (email isključen po defaultu).

## 8. Faze rada (obavezan redoslijed)

Nakon **svake** faze: `npm run lint && npm run typecheck && npm run test`, zatim jasan git commit (`feat(faza-N): …`). Ne prelazi dalje dok nije zeleno.

1. **Temelji**: Next.js scaffold, i18n, Prisma shema i migracije, seed sadržaja iz JSON-a, Auth.js (Google + email), guest mode i prijenos napretka, rate limiting.
2. **Engine**: Zod shema sadržaja + `validate:content`, `Grader`/`DeterministicGrader`, svih 10 komponenti vježbi, player, serverski `Attempt` API.
3. **Gamifikacija i ljestvice**: XP, streak, srca, zadaci, bedževi, lige s botovima, tjedni cron, prijatelji, anti-cheat, mascot, zvukovi.
4. **Monetizacija**: `DailyUsage` i heartbeat, mjerač i paywall ekran, Stripe Checkout/Portal/webhooks, entitlement sloj, admin za limit i cijene, privatna analitika konverzije.
5. **Učenje i kvaliteta**: SM-2 Vježba, pregled grešaka, Blitz, placement; admin za sadržaj; PWA offline; pristupačnost; GDPR (izvoz, brisanje + otkazivanje pretplate); sigurnosna zaglavlja i CSP; README, `.env.example` (bez AI ključeva).

## 9. Testovi (minimum)

- **Vitest**: svaki grader (uključujući `č ć š ž đ`), Rubric Checker (bodovi, ogledni odgovori prolaze prag), SM-2, XP/streak/Streak Freeze/srca, rang i promocija liga, **obračun dnevnog vremena** (idempotencija, strop po heartbeatu, preklapanje kartica, ponoć u `Europe/Zagreb`), **entitlement** (Free, probno, Premium, grace, istek), obrada webhooka (potpis, duplikat događaja).
- **Playwright E2E**: (1) prijava (mock Google) i prijenos gosta, (2) automatsko rješavanje svih lekcija iz JSON-a, (3) **paywall**: s `FREE_DAILY_MINUTES=1` i lažnim satom korisnik stigne do ekrana ograničenja, napredak lekcije se čuva, (4) Stripe test-mode checkout s fiksturama webhookova otključava neograničeno učenje, (5) ljestvica prikazuje rang i botove, (6) izvoz i brisanje računa.
- `no-ai-deps` test i CI (GitHub Actions) koji pokreće lint, typecheck, unit, validate:content i E2E.

## 10. Kriteriji prihvaćanja (Definition of Done)

- [ ] `npm run lint`, `typecheck`, `test`, `validate:content`, `test:e2e` svi prolaze.
- [ ] Google prijava radi, gost se pretvara u račun bez gubitka napretka.
- [ ] Ljestvice (liga, globalna, prijatelji) točne i otporne na manipulaciju klijenta.
- [ ] Besplatni korisnik ne može učiti više od `FREE_DAILY_MINUTES` dnevno ni zaobilaskom (druga kartica, brisanje `localStorage`, ručni API pozivi).
- [ ] Premium se aktivira isključivo iz potpisanog webhooka i gasi otkazivanjem ili neuspjelom naplatom nakon grace perioda.
- [ ] Otkazivanje pretplate u 2 klika, brisanje računa otkazuje pretplatu.
- [ ] Nijedan AI API poziv, nijedan AI ključ u repozitoriju ili `.env.example`.
- [ ] README opisuje lokalno pokretanje (Postgres u Dockeru, Stripe CLI za webhookove, Google OAuth postavljanje) i deploy.

## 11. Način rada

- Prvo mi **kratko prikaži plan** (strukturu mapa, finalnu Prisma shemu, tok mjerenja vremena i Stripe tok) i **pričekaj moje odobrenje**, tek onda piši kod.
- Kad je odluka moja (cijene, točna lista Premium pogodnosti, pravni tekstovi), predloži zadanu vrijednost i označi je u konfiguraciji, ne zaustavljaj rad.
- Pravne stranice (uvjeti, privatnost, kolačići) napravi kao **predloške s oznakom "provjeriti s pravnikom"**.
- Ne dodiraj ostatak repozitorija izvan `ailingo/`.
- Na kraju svake faze napiši kratak sažetak: što radi, što je testirano, što je ostalo.
