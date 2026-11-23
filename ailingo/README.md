# AIlingo

Gamificirana aplikacija (u stilu Duolinga) za učenje korištenja AI-ja u marketingu i svakodnevnom poslu.
Dvije staze, **AI od početnika do profesionalca** (ChatGPT, Claude, Grok, MCP, Claude Code, Codex) i **Marketing s AI-jem**, 46 lekcija i 368 vježbi na hrvatskom i engleskom.

**Bez ijednog AI API poziva.** Sve odgovore provjerava deterministički `Grader` na serveru. Opcionalni AI grader postoji samo kao isključeni stub (`FEATURE_AI_GRADER=off`).

## Što aplikacija ima

- **10 vrsta mini-igara** (višestruki izbor, mit ili činjenica, popuni prazninu, složi prompt, spoji parove, Prompt Doktor, Rubric Checker, ulovi halucinaciju, A/B dvoboj, složi radni tok) i Blitz način.
- **Prijava**: Google (Auth.js) i email magic link. Može se početi i kao **gost**, a napredak se pri prijavi prenosi na račun.
- **Gamifikacija**: XP i razine, dnevni niz sa Streak Freezeom, srca (obnavljaju se vremenom i vježbom), dnevni zadaci, 21 bedž, maskota Robi, zvukovi i konfeti.
- **Ljestvice**: tjedne lige od 30 natjecatelja (prvih 10 napreduje, zadnjih 5 pada, botovi popunjavaju prazna mjesta), globalna ljestvica (tjedno i svih vremena) i ljestvica prijatelja.
- **Monetizacija**: besplatno **10 minuta aktivnog učenja dnevno**, Premium (Stripe) je neograničen.
- **Ponavljanje**: SM-2 raspored, pregled grešaka, slobodna vježba, test razine.
- **Admin**: uređivanje vježbi uz Zod validaciju i pregled, izvoz sadržaja u JSON, postavljanje dnevnog limita, ručna dodjela Premiuma, označeni računi, zbirna statistika konverzije.
- **PWA**: manifest, service worker, offline stranica i web push podsjetnici.
- **GDPR**: izvoz svih podataka (JSON) i trajno brisanje računa koje otkazuje i pretplatu.

## Lokalno pokretanje

Treba: Node 20+ i PostgreSQL 14+.

```bash
cd ailingo
npm install
cp .env.example .env          # zatim popuni AUTH_SECRET i SESSION_HMAC_SECRET (openssl rand -base64 32)

# Baza (primjer s Dockerom; može i lokalni Postgres)
docker run -d --name ailingo-db -e POSTGRES_USER=ailingo -e POSTGRES_PASSWORD=ailingo -e POSTGRES_DB=ailingo -p 5432:5432 postgres:16

npx prisma migrate deploy      # kreira tablice
npm run db:seed                # učitava content/*.json u bazu
npm run dev                    # http://localhost:3000
```

Bez SMTP-a se magic link za prijavu ispisuje u konzolu servera. Admin pristup dobiva svaki email naveden u `ADMIN_EMAILS` pri prijavi.

### Google prijava

1. Google Cloud Console → APIs & Services → Credentials → **OAuth client ID** (Web application).
2. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google` (u produkciji tvoja domena).
3. Upiši `AUTH_GOOGLE_ID` i `AUTH_GOOGLE_SECRET` u `.env`. Bez njih se gumb za Google ne prikazuje.

### Stripe (Premium)

1. U Stripe Dashboardu (test mode) napravi proizvod s dvije cijene (mjesečna i godišnja pretplata) i upiši njihove ID-jeve u `STRIPE_PRICE_MONTHLY` i `STRIPE_PRICE_YEARLY`.
2. Upiši `STRIPE_SECRET_KEY`. Uključi Customer Portal u Stripe postavkama.
3. Lokalno prosljeđuj webhookove: `stripe listen --forward-to localhost:3000/api/stripe/webhook` i dobiveni `whsec_…` upiši u `STRIPE_WEBHOOK_SECRET`.
4. Opcionalno: `STRIPE_TAX=on` za automatski PDV, `STRIPE_TRIAL_DAYS` za probno razdoblje.

Oznake cijena na stranici Premium (npr. „6,99 €”) mijenjaju se u tablici `AppConfig` (`PRICE_MONTHLY_LABEL`, `PRICE_YEARLY_LABEL`). Iznose stvarno naplaćuje Stripe prema cijenama koje si tamo postavio.

## Kako radi monetizacija

- Klijent šalje heartbeat svakih 15 s, i to samo dok je kartica vidljiva i korisnik je bio aktivan u zadnjih 30 s. Server dodaje najviše 20 s po otkucaju, a vrijeme posljednjeg otkucaja dijele sve kartice, pa dvije kartice ne broje dvostruko.
- Broje se lekcije, vježba, Blitz i test razine. Stablo, ljestvice, prijatelji, profil i pregled grešaka se ne broje.
- Kad limit istekne, trenutnu vježbu je moguće dovršiti (90 s tolerancije), pa se prikazuje paywall s odbrojavanjem do ponoći (Europe/Zagreb). Napredak lekcije se čuva i lekcija se nastavlja sljedeći put.
- Za goste se vrijeme broji i po (hashiranoj) IP adresi, pa novi gost-kolačić ne resetira limit.
- Premium se uključuje **isključivo** iz potpisanog Stripe webhooka, nikad iz povratnog URL-a. Neuspjela naplata ostavlja 3 dana tolerancije.
- Srca nisu monetizirana.

## Zaštita od varanja

- Preglednik nikad ne dobiva točne odgovore: opcije su promiješane HMAC-om po sesiji, a objašnjenja, prihvaćeni odgovori i ključne riječi rubrika šalju se tek nakon ocjene.
- XP dodjeljuje samo server, iz provjerenih pokušaja, uz dnevni strop. Odgovori brži od 0,6 s se odbijaju, a račun se označava za pregled u adminu.

## Sadržaj

Sadržaj živi u `content/*.json` (redoslijed staza i jedinica je u `content/meta.json`) i nikad u kodu.

```bash
npm run validate:content   # Zod provjera strukture, bodova rubrika i referenci
npm run db:seed            # sinkronizira JSON u bazu
```

Izmjene napravljene u adminu spremaju se u bazu. Gumb „Izvezi sadržaj” vraća ih u JSON format.

## Testovi

```bash
npm run lint
npm run typecheck
npm run test               # Vitest: grader za svih 368 vježbi, mapiranje odgovora, SM-2, streak, srca, lige, vrijeme, pretplata, zabrana AI ovisnosti
npm run build
npm run test:e2e           # Playwright na zasebnoj bazi ailingo_test (mora završavati na _test)
E2E_FULL=1 npm run test:e2e   # dodatno odigra svih 46 lekcija
```

E2E koristi testne rute (`/api/test/*`) koje rade samo uz `E2E=1` i tajni `E2E_TEST_SECRET`. U produkciji ih ne postavljaj.

## Deploy (Vercel)

1. Postgres (Neon, Supabase ili sl.) i `DATABASE_URL`.
2. Sve varijable iz `.env.example` u Vercel projekt (Root Directory: `ailingo`).
3. Build: `npm run build`, zatim jednom `npx prisma migrate deploy` i `npm run db:seed`.
4. `vercel.json` pokreće tjedni obračun liga i dnevne podsjetnike. Postavi `CRON_SECRET`.
5. Stripe webhook endpoint: `https://tvoja-domena/api/stripe/webhook`.

## Struktura

```
content/        JSON sadržaj (izvor istine)
messages/       prijevodi sučelja (hr, en)
prisma/         shema, migracije, seed
src/lib/        čista logika: sadržaj, grader, SM-2, XP, streak, srca, lige, vrijeme, pretplata
src/server/     baza, prijava i gost, igranje, lige, mjerenje vremena, Stripe, GDPR
src/app/        stranice ([locale]) i API rute
src/components/ maskota, vježbe, player, stablo, postavke, admin
tests/          unit (Vitest) i e2e (Playwright)
prototype/      izvorni prototip (artefakt)
```

## Pravne napomene

Uvjeti korištenja, pravila privatnosti i kolačića su **predlošci** i moraju ih pregledati pravnik prije objave, kao i cijene, PDV i pravila o otkazivanju za EU potrošače.
