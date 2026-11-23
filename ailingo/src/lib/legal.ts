type S = { h: [string, string]; p: [string, string] };

/** Templates only. Have a lawyer review before publishing. */
export const LEGAL: Record<"terms" | "privacy" | "cookies", S[]> = {
  terms: [
    { h: ["Usluga", "The service"], p: ["AIlingo je obrazovna aplikacija. Besplatni plan uključuje ograničeno dnevno vrijeme učenja; Premium uklanja ograničenje.", "AIlingo is an educational app. The free plan includes limited daily learning time; Premium removes the limit."] },
    { h: ["Pretplata i otkazivanje", "Subscription and cancellation"], p: ["Pretplata se automatski obnavlja dok je ne otkažeš. Otkazati možeš u bilo kojem trenutku putem upravljanja pretplatom; pristup traje do kraja plaćenog razdoblja.", "The subscription renews automatically until you cancel. You can cancel any time through subscription management; access lasts until the end of the paid period."] },
    { h: ["Pravo na odustanak", "Right of withdrawal"], p: ["Potrošači u EU imaju pravo na odustanak u roku od 14 dana. Ako izričito zatražiš početak usluge u tom roku, iznos se može razmjerno umanjiti.", "EU consumers have a 14-day right of withdrawal. If you expressly ask for the service to start within that period, the amount may be reduced proportionally."] },
    { h: ["Sadržaj", "Content"], p: ["Sadržaj lekcija služi edukaciji. Mogućnosti AI alata brzo se mijenjaju; provjeri aktualnu službenu dokumentaciju.", "Lesson content is for education. AI tool capabilities change quickly; check current official documentation."] },
  ],
  privacy: [
    { h: ["Voditelj obrade", "Controller"], p: ["[Naziv tvrtke, adresa, OIB, kontakt]", "[Company name, address, registration number, contact]"] },
    { h: ["Koje podatke obrađujemo", "What we process"], p: ["Račun (email, ime, slika s Googlea), napredak u učenju, vrijeme učenja po danu, pretplatu (preko Stripea). Ne koristimo trackere trećih strana; analitika je samo zbirna.", "Account (email, name, Google picture), learning progress, learning time per day, subscription (via Stripe). We use no third-party trackers; analytics are aggregated only."] },
    { h: ["Svrha i pravna osnova", "Purpose and legal basis"], p: ["Izvršenje ugovora (pružanje usluge), legitimni interes (sigurnost, sprječavanje zlouporabe), privola (podsjetnici).", "Performance of contract (providing the service), legitimate interest (security, abuse prevention), consent (reminders)."] },
    { h: ["Tvoja prava", "Your rights"], p: ["Pristup, ispravak, brisanje, prenosivost i prigovor. Izvoz i trajno brisanje dostupni su u Postavkama. Pritužbu možeš podnijeti AZOP-u.", "Access, rectification, erasure, portability and objection. Export and permanent deletion are in Settings. You can complain to your data protection authority (AZOP in Croatia)."] },
    { h: ["Izvršitelji obrade", "Processors"], p: ["Hosting i baza podataka, Stripe (plaćanja), Google (prijava), pružatelj e-pošte.", "Hosting and database, Stripe (payments), Google (sign-in), email provider."] },
  ],
  cookies: [
    { h: ["Nužni kolačići", "Necessary cookies"], p: ["Kolačić sesije prijave i kolačić gost računa (httpOnly). Bez njih aplikacija ne radi, pa ne traže privolu.", "The sign-in session cookie and the guest account cookie (httpOnly). The app cannot work without them, so they need no consent."] },
    { h: ["Analitika i oglasi", "Analytics and ads"], p: ["Ne koristimo analitičke ni oglasne kolačiće.", "We use no analytics or advertising cookies."] },
  ],
};
