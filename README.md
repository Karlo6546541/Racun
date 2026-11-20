# 🧾 Moji Računi

Jednostavna aplikacija za čuvanje računa i garancija.

**Slikaš račun → aplikacija sama pročita trgovinu, datum i iznos → odabereš koliko traje garancija → spremljeno.**

## Što zna

- 📷 **Slikaj račun** kamerom ili ga odaberi iz galerije
- 🤖 **Automatsko čitanje računa** (trgovina, datum kupnje, ukupan iznos), na hrvatskom jeziku
- 🛡️ **Garancija** jednim dodirom: 1, 2, 3 ili 5 godina, ili upiši točan datum. Aplikacija sama izračuna do kada vrijedi.
- ⚠️ **Upozorenje** kad garancija ističe u sljedećih 30 dana
- 🔍 **Pretraga** po nazivu, trgovini, bilješci, pa i po tekstu s računa
- 📤 **Pošalji račun** (WhatsApp, e-mail…) kad ideš na reklamaciju
- 💾 **Sigurnosna kopija**: spremanje i vraćanje svih računa
- 📴 **Radi bez interneta** i sve ostaje **samo na vašem mobitelu** (ništa se ne šalje na server)

## Kako pokrenuti

To je web-aplikacija (PWA) bez instalacije i bez build koraka. Dovoljno je poslužiti mapu preko HTTPS-a, npr. besplatno na **GitHub Pages**, Netlify ili Vercel.

Lokalno:

```bash
python3 -m http.server 8000
# otvori http://localhost:8000
```

Na mobitelu otvorite adresu u Chromeu ili Safariju i odaberite **„Dodaj na početni zaslon”**. Aplikacija se tada otvara kao obična aplikacija.

> Kamera i spremanje rade samo preko `https://` ili `localhost`.

## Struktura

| Datoteka | Opis |
|---|---|
| `index.html` | Zasloni aplikacije |
| `styles.css` | Izgled (veliki gumbi, svijetla i tamna tema) |
| `app.js` | Logika: kamera, čitanje računa, baza, garancije |
| `parser.js` | Prepoznavanje datuma, iznosa i trgovine iz teksta računa |
| `sw.js` | Rad bez interneta |
| `vendor/tesseract/` | Tesseract.js (OCR) i hrvatski jezični model (Apache 2.0) |
| `tests/` | Testovi za prepoznavanje računa |

## Testovi

```bash
node tests/parser.test.js
```
