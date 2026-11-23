# Prompt za Replit: aplikacija „Moji Računi”

Zalijepi sve ispod u Replit Agent.

---

Napravi mobilnu web-aplikaciju (PWA) na **hrvatskom jeziku** pod nazivom **„Moji Računi”**. Korisnik slika račun, aplikacija ga sama pročita i izreže s pozadine, upiše datum, iznos i trgovinu, a korisnik jednim dodirom odabere koliko traje garancija. Aplikacija pamti do kada garancija vrijedi i upozori prije isteka. **Najvažniji cilj je jednostavnost: aplikaciju mora znati koristiti i starija osoba bez uputa.**

## 1. Tehnologija
- Čisti **HTML + CSS + JavaScript (ES5/ES2015, bez frameworka i bez build koraka)**, jedna `index.html`, `styles.css`, `app.js`, `parser.js`, `scan.js`, `sw.js`, `manifest.json`. Poslužuje se kao statička stranica.
- Podaci se spremaju **lokalno u IndexedDB** (baza `moji-racuni`, store `receipts`, `keyPath: id`). Slike se spremaju kao `Blob` (JPEG), ne kao base64.
- **PWA:** `manifest.json` (standalone, tema `#1d6b4f`, ikone 192 i 512 px, SVG ikona), service worker za rad **bez interneta** (mreža pa cache za vlastite datoteke; velike datoteke iz `vendor/` spremi u cache nakon prvog preuzimanja).
- Biblioteke **spremi lokalno u `vendor/`** (ne učitavaj ih s CDN-a, mora raditi i offline):
  - **Tesseract.js 5.1.1** (`tesseract.min.js`, `worker.min.js`, `tesseract-core-lstm.wasm.js`, `tesseract-core-simd-lstm.wasm.js`) i hrvatski model `hrv.traineddata.gz` (`4.0.0_best_int`), putem npm paketa `tesseract.js`, `tesseract.js-core`, `@tesseract.js-data/hrv`.
  - **jsQR** (`vendor/jsQR.js`) za čitanje QR koda.
- Nema servera ni prijave u prvoj verziji. Sve radi u pregledniku. Servis mora raditi preko HTTPS-a (kamera).

## 2. Zasloni i ponašanje

### Početni zaslon (popis)
- Zeleno zaglavlje s nazivom i izbornikom ⋮ (postavke).
- **Tri velika gumba:** `📷 Slikaj račun` (input `type=file accept=image/* capture=environment`, najveći), `🖼️ Iz galerije`, `✍️ Upiši ručno`. Gumbi minimalne visine 56 px, glavni 84 px.
- **Upozorenje** na vrhu (žuta kartica) ako garancija nekog računa ističe u sljedećih 30 dana: „⚠️ Garancija za *Mobitel* uskoro ističe. Ako nešto ne radi, sad je vrijeme za reklamaciju.”
- **Pretraga** („🔍 Traži (npr. televizor, Konzum…)”) po nazivu, trgovini, bilješci, kategoriji, datumu i tekstu s računa.
- **Filteri (čipovi):** Svi · ✅ Garancija vrijedi · ⚠️ Uskoro ističe · Isteklo.
- **Kartice računa** sortirane po datumu silazno: sličica slike (ili 🧾), naziv (proizvod, a ako ga nema trgovina), trgovina · datum, cijena desno, **značka garancije:** zelena „Vrijedi još 3 mjeseca”, žuta „Ističe za 20 dana”, crvena „Garancija istekla”, siva „Bez garancije”.
- **Prazno stanje:** velika 🧾, „Još nemate spremljenih računa”, kratko objašnjenje i napomena „Svi računi se spremaju samo na vašem mobitelu.”

### Zaslon novog računa / uređivanja
Redoslijed odozgo:
1. Pregled slike računa. Dok se čita: traka s kružnim indikatorom i napretkom („Čitam račun… 45%”).
2. Gumb za prebacivanje „✂️ Račun izrezan s pozadine · Prikaži original” (vraća neizrezanu sliku i obrnuto).
3. Poruka rezultata: zelena „✅ QR kod pročitan: datum i iznos su točni. Provjerite ostalo.” ili „✅ Račun pročitan. Provjerite podatke i ispravite ako treba.”, ili žuta „Nisam uspio pročitati račun. Upišite podatke ručno — slika je svejedno spremljena.”
4. Polja (velika, 54 px visine): **Što ste kupili?** (npr. Perilica rublja), **Trgovina**, **Datum kupnje** (`type=date`, obavezno) i **Cijena (€)** (tekst, `inputmode=decimal`, prihvaća `129,99`, `1.299,99`, `129.99`, `€`).
5. **Garancija** kao čipovi: *Bez garancije · 1 godina · 2 godine (zadano) · 3 godine · 5 godina · Drugo…* (Drugo otvara polje „Garancija vrijedi do” s datumom). Ispod prikaži izračun: „🛡️ Garancija vrijedi do 14. 3. 2027.” (ažurira se pri promjeni datuma kupnje ili čipa).
6. **Kategorija** (select): 📺 Elektronika, 🏠 Kućanski aparati, 🛋️ Namještaj, 👕 Odjeća i obuća, 🔧 Alati, 🚗 Auto, 🛒 Namirnice, 💊 Zdravlje, 📦 Ostalo.
7. **Bilješka** (nije obavezno), sklopivo „Prikaži prepoznati tekst” (sirovi OCR).
8. Veliki gumb **💾 Spremi račun**.

### Zaslon detalja
Slika računa (klik otvara preko cijelog zaslona), naziv, **velika kartica garancije** u boji (zelena/žuta/crvena/siva) s tekstom „🛡️ Vrijedi još 3 mjeseca”, „Garancija vrijedi do 14. 3. 2027.” i trakom napretka preostalog vremena. Ispod tablica: Trgovina, Datum kupnje, Cijena, Kategorija, Bilješka. Gumbi: `📤 Pošalji račun (za reklamaciju)` (Web Share API s datotekom slike i tekstom; ako nije podržan, preuzmi sliku), `✏️ Uredi`, `🗑️ Obriši račun` (uz potvrdu).

### Izbornik ⋮
- `⬇️ Spremi sigurnosnu kopiju` (JSON sa svim računima, slike kao data URL; podijeli ili preuzmi kao `moji-racuni-GGGG-MM-DD.json`).
- `⬆️ Vrati iz sigurnosne kopije` (uvoz istog formata).
- `📲 Dodaj na početni zaslon` (samo ako preglednik javi `beforeinstallprompt`).
- Napomena: računi su samo na ovom uređaju, preporuči povremenu sigurnosnu kopiju.

### Navigacija
Povijest preglednika mora raditi: sistemski gumb „natrag” vraća s obrasca ili detalja na popis. Zaslon-gumb ← u zaglavlju radi isto. Nakon spremanja prikaži toast „Račun spremljen ✅”.

## 3. Obrada slike (redoslijed nakon odabira slike)
1. Učitaj sliku, smanji na **najviše 3000 px** (canvas).
2. **Izrezivanje računa s pozadine** (skener dokumenata, bez biblioteka, modul `scan.js`):
   - Smanji sliku na ~256 px, pretvori u sivu, zamuti (box blur 3×3 dvaput).
   - **Otsuov prag** → maska svijetlih piksela (papir je svjetliji od pozadine). Ako je svijetlih piksela < 8 % → nema računa.
   - Najveća povezana svijetla površina (BFS, 4-susjedstvo). Mora imati ≥ 8 % slike. Ako papir zauzima gotovo cijelu sliku (> 90 %), ne režemo.
   - **Četiri kuta** = ekstremi površine: tl = min(x+y), br = max(x+y), tr = max(x−y), bl = min(x−y). Odbaci ako površina površine / površina četverokuta < 0.6.
   - Kutove **pomakni 1.5 % prema van** (bolje malo pozadine nego odrezan tekst uz rub).
   - **Ispravi perspektivu i nagib**: homografija izlaznog pravokutnika u četverokut (Gaussova eliminacija 8×8), bilinearno uzorkovanje. Izlaz najviše 2600 px po dužoj strani. Dimenzije izlaza = prosjek suprotnih stranica.
   - Ako ništa ne uspije, koristi originalnu sliku (bez greške).
3. **QR kod** (fiskalni račun): najprije ugrađeni `BarcodeDetector({formats:['qr_code']})` ako postoji (Chrome Android), zatim **jsQR** s `inversionAttempts: 'attemptBoth'` na **više veličina: 1000, 800, 1400, 600, 1800 px** (dekoder često ne uspije na velikoj slici, a uspije na manjoj), prvo na izrezanoj pa na cijeloj slici. Svaki pokušaj u zasebnom `setTimeout` da se zaslon ne zamrzne. Prihvati samo QR koji izgleda kao fiskalni (vidi dolje).
4. **OCR (Tesseract.js, jezik `hrv`)** nad izrezanom slikom: crno-bijela slika s pojačanim kontrastom (`g = (g−128)·1.5+140`), najviše 2600 px. Koristi `workerPath/corePath/langPath` iz `vendor/`. Prikaži napredak.
5. Spremi **JPEG (kvaliteta 0.8, najviše 1600 px)** izrezane slike; original (isto 1600 px) čuvaj privremeno za gumb „Prikaži original”.
6. Podatke iz QR-a upiši u polja, a OCR popunjava **samo prazna polja** (ne prepisuje ono što je korisnik već upisao, niti QR podatke).

## 4. Prepoznavanje podataka (`parser.js`, čisti JS, mora raditi i u Node.js za testove)

### Fiskalni QR kod hrvatskog računa
Poveznica poput `https://porezna.gov.hr/rn/?jir=00000000-0000-0000-0000-000000000000&datv=20260817_1030&izn=375,00` (domena može biti `porezna-uprava.gov.hr` ili `porezna.gov.hr`). Prepoznaj ga ako sadrži `porezna-uprava` ili parametar `jir`/`zki`. Iz parametara: `datv` = `GGGGMMDD_HHMM` → datum `GGGG-MM-DD`; `izn` = iznos s decimalnim zarezom (podrži i `1.149,99`). Vrati `{date, total}` ili `null`.

### Datum iz teksta
- Formati `dd.mm.gggg`, `dd/mm/gggg`, `dd-mm-gggg`, `dd.mm.gg`, `gggg-mm-dd`, dopuštene razmake oko separatora.
- OCR često mijenja nulu slovom O i brojevima 8/6/9: zamijeni `O→0` uz znamenke; za dan, mjesec i godinu **popravi nevaljane vrijednosti zamjenom 8/6/9 nulom** uz najmanji broj izmjena (npr. `2826 → 2026`, `17.88.2026 → 17.08.2026`). Godina valjana 2000 do (tekuća+1).
- Odbaci datume u budućnosti (npr. „garancija do”), ako postoji bar jedan u prošlosti.

### Ukupan iznos
- Prvo retci s ključnim riječima: `za platiti, za plaćanje, sveukupno, ukupno, ukupan iznos, iznos računa, total, suma, za uplatu`, ali **ignoriraj retke** koji sadrže `pdv, porez, osnovica, popust, povrat, ostatak, vraćeno, kusur` ili riječ `bez` („Ukupno bez poreza”). Ako iznos nije u istom retku, uzmi iz sljedećeg. Od kandidata uzmi najveći.
- **Prije traženja iznosa ukloni datume i vremena** iz retka (da se `17.08.2026. 10:30` ne pročita kao `2026,10`).
- Regex iznosa dopušta tisućice i jednu višak znamenku (OCR „375,096” → 375,09).
- Ako nema ključnih riječi: potraži **iznos koji je zbroj dva druga iznosa** (osnovica + porez = ukupno), uzmi najveći takav. Zadnja rezerva: najveći iznos na računu (bez redaka „povrat” itd.).
- `parseAmount`: `1.234,56`, `1,234.56`, `12,99`, `12.99` → broj.

### Trgovina
Prvih ~8 neslučajnih redaka (≥ 3 slova); prednost retku koji sadrži `d.o.o.`, `d.d.`, `j.d.o.o.` ili `obrt`; očisti znakove `|_*#~=<>`, najviše 60 znakova.

### Garancija
`addMonths(iso, mjeseci)`; ako dan ne postoji u ciljanom mjesecu, uzmi zadnji dan (31. 1. + 1 mj. = 29. 2.). Stanje garancije: `none` (bez), `ok`, `soon` (≤ 30 dana), `expired`. Tekst: „Vrijedi još X”, gdje X je „N dana” do 60 dana, inače mjeseci ili godine, s ispravnim hrvatskim množinama (1 dan, 2 dana, 5 dana; 1 mjesec, 2 mjeseca, 5 mjeseci; 2 godine, 5 godina).

## 5. Dizajn i pristupačnost
- Mobile-first, `max-width: 640px`, font sustava 18 px, sve dodirne površine ≥ 48 px, razmaci veliki, **bez sitnog teksta i bez skrivenih gesta**.
- Boje: primarna `#1d6b4f`; zelena/žuta/crvena stanja uz **tekst** (ne samo boja). **Svijetla i tamna tema** (`prefers-color-scheme`).
- Poštuj `env(safe-area-inset-*)`. Toast poruke 2.8 s. Sve poruke na hrvatskom, prijateljskim tonom, bez tehničkog žargona.
- Sva korisnička unošena slova ispisuj s escapeanjem HTML-a.
- Odaberi `navigator.storage.persist()` da preglednik ne briše podatke.

## 6. Testovi (Node.js, bez frameworka, `node tests/parser.test.js` i `node tests/scan.test.js`)
**parser:** trgovina s d.o.o.; datum `dd.mm.gggg`; ukupno ignorira PDV i povrat (račun s „Gotovina 20,00, Povrat 6,53, Ukupno 13,47” mora dati 13,47); `1.149,99 €` u idućem retku; budući datum se preskače; datum s `O5.O1.2025`; kratka godina `5.6.24`; `parseAmount`; `addMonths`; prazan tekst; **fiskalni QR** (`datv=20250314_1742&izn=1.149,99` → `2025-03-14`, 1149.99); QR koji nije račun → `null`; **stvarni pokvareni OCR** (`Datum i vrijeme: 17.08.2826. 10:38`, `Ukupno: 375,096`) → datum `2026-08-17`, ukupno ≈ 375; datum se ne čita kao iznos; zbroj osnovica + porez.
**scan:** umjetna fotografija (tamna pozadina, račun nagnut 12°) → izrezani račun približnih dimenzija i bez pozadine na 5 % visine od ruba; račun bez nagiba; slika bez pozadine → `null`; potpuno tamna slika → `null`; homografija preslikava kutove.

## 7. Kriteriji prihvaćanja
- Slikanje računa s fiskalnim QR kodom popunjava **točan datum i iznos** (iz QR-a), a naziv trgovine iz teksta.
- Račun snimljen pod kutom na tamnom stolu prikazuje se **ravno i bez pozadine**, tekst uz desni i lijevi rub nije odrezan.
- Radi **bez interneta** nakon prvog učitavanja i može se dodati na početni zaslon.
- Spremanje, uređivanje, brisanje, pretraga, filteri, upozorenje o isteku, dijeljenje i sigurnosna kopija rade; podaci ostaju nakon osvježavanja stranice.
- Nema grešaka u konzoli; svi testovi prolaze.

## 8. Faza 2 (NE radi sada, samo ostavi arhitekturu spremnu)
Spremanje u oblak uz prijavu e-mailom (Supabase, EU regija), sinkronizacija na više uređaja, obiteljski račun, podsjetnici push obavijestima i e-mailom, PDF za reklamaciju, izvoz za knjigovođu, **Premium pretplata** (Stripe). Podaci ostaju lokalni dok korisnik ne uključi oblak; **ne prodaji podatke i ne prikazuj reklame.**
