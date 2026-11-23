# AIlingo za Android

Android aplikacija je **Trusted Web Activity (TWA)**: otvara objavljenu web aplikaciju (`https://ailingo-ecru.vercel.app`) preko cijelog zaslona, bez trake preglednika. Sav kod ostaje u web aplikaciji, pa se Android aplikacija ne mora ponovno objavljivati za svaku promjenu sadržaja.

Premium se u Android aplikaciji naplaćuje isključivo preko **Google Play Billinga** (Digital Goods API), kako traže pravila Google Playa. Na webu ostaje Stripe. Server priznaje obje pretplate.

## Build

Treba: JDK 17+ i Android SDK (platforma 36, build-tools 36).

```bash
cd ailingo/android
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew assembleDebug                    # app/build/outputs/apk/debug/app-debug.apk (za isprobavanje)
./gradlew bundleRelease                    # app/build/outputs/bundle/release/app-release.aab (za Google Play)
./gradlew assembleDebug -PtwaHost=moja-domena.hr   # druga domena
```

### Ključ za potpisivanje (upload key)

Jednom napravi ključ i **sačuvaj ga na sigurnom** (bez njega ne možeš objaviti nadogradnje bez zahtjeva Googleu):

```bash
keytool -genkeypair -v -keystore ailingo-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
export AILINGO_KEYSTORE=$PWD/ailingo-upload.jks AILINGO_KEYSTORE_PASSWORD=... AILINGO_KEY_PASSWORD=...
./gradlew bundleRelease -PversionCode=2 -PversionName=1.0.1
```

Ključ (`*.jks`) se nikad ne commita (u `.gitignore` je).

## Povezivanje s domenom (Digital Asset Links)

Da bi se aplikacija otvarala bez trake preglednika, web mora objaviti `/.well-known/assetlinks.json` s otiskom certifikata. Aplikacija ga generira iz varijabli:

- `ANDROID_PACKAGE` = `hr.ailingo.app`
- `ANDROID_CERT_SHA256` = SHA-256 otisak(ci), odvojeni zarezom. Za Play: **Play Console → Test and release → App integrity → App signing key certificate**. Za lokalni debug build: `keytool -list -v -keystore ~/.android/debug.keystore -storepass android`.

## Google Play Billing

1. Play Console → **Monetize → Subscriptions**: napravi `ailingo_premium_monthly` i `ailingo_premium_yearly` (ili promijeni `PLAY_PRODUCT_MONTHLY/YEARLY`).
2. Google Cloud: service account s pristupom **Google Play Android Developer API**, dodaj ga u Play Console (Users and permissions → financijski podaci i upravljanje narudžbama). JSON ključ stavi u `GOOGLE_PLAY_SERVICE_ACCOUNT` na Vercelu.
3. Real-time Developer Notifications: Pub/Sub tema u Play Console, push pretplata na `https://<domena>/api/billing/play/rtdn?token=<PLAY_RTDN_TOKEN>`.

Server svaku kupnju provjerava kod Googlea, potvrđuje je (acknowledge) i tek tada uključuje Premium. Brisanje računa otkazuje i Play pretplatu.
