/**
 * Digital Asset Links: proves the Android app (Trusted Web Activity) and this site belong together,
 * so the app opens full screen without a browser bar. ANDROID_CERT_SHA256 = comma-separated SHA-256
 * fingerprints (the Play App Signing certificate, plus the upload or debug key if you test with it).
 */
export function GET() {
  const pkg = process.env.ANDROID_PACKAGE || "hr.ailingo.app";
  const fingerprints = (process.env.ANDROID_CERT_SHA256 || "").split(",").map((s) => s.trim()).filter(Boolean);
  const body = fingerprints.length ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: fingerprints } }] : [];
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
