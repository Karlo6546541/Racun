import Link from "next/link";

export default function NotFound() {
  return (
    <html lang="hr">
      <body style={{ fontFamily: "system-ui", textAlign: "center", padding: 60 }}>
        <h1>404</h1>
        <p>
          <Link href="/">AIlingo</Link>
        </p>
      </body>
    </html>
  );
}
