package com.tvremote.app;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x509.BasicConstraints;
import org.bouncycastle.asn1.x509.Extension;
import org.bouncycastle.asn1.x509.GeneralName;
import org.bouncycastle.asn1.x509.GeneralNames;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigInteger;
import java.net.InetSocketAddress;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPublicKey;
import java.util.Arrays;
import java.util.Date;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * Android TV Remote protocol v2 client (the one used by the Google TV phone app).
 * Pairing on port 6467 (6-digit hex code shown on the TV), remote on port 6466.
 */
final class Tv {
    static final int REMOTE_PORT = 6466, PAIR_PORT = 6467;
    private static final char[] PW = "tvremote".toCharArray();
    // PING | KEY | POWER | VOLUME | APP_LINK  (+ IME = 4 when phone keyboard is wanted)
    private static final int BASE_FEATURES = 1 | 2 | 32 | 64 | 512;
    private static final int IME_FEATURE = 4;

    interface Listener { void textFieldFocused(); }
    /** Lets the app route the socket over Wi-Fi (Android may otherwise pick mobile data). */
    interface Binder { void bind(java.net.Socket s, String host) throws IOException; }
    volatile Binder binder;
    volatile Listener listener;
    volatile long lastErrorAt;
    volatile String lastError = "";
    private volatile boolean ime = true;
    private volatile int imeCounter, imeFieldCounter;
    private volatile boolean hasImeCounter, hasImeFieldCounter;
    void setIme(boolean on) { ime = on; }
    static final int DIRECTION_SHORT = 3;

    private final File p12;
    private SSLContext ctx;
    private X509Certificate clientCert;

    private SSLSocket pairSock;

    private SSLSocket sock;
    private volatile OutputStream out;
    private volatile boolean ready;
    private volatile int active;
    private CountDownLatch started;
    private String host;

    Tv(File dir) { this.p12 = new File(dir, "client.p12"); }

    // ---------- identity ----------
    private synchronized void identity() throws Exception {
        if (ctx != null) return;
        KeyStore ks = KeyStore.getInstance("PKCS12");
        if (p12.exists()) {
            try (FileInputStream in = new FileInputStream(p12)) { ks.load(in, PW); }
        } else {
            KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
            kpg.initialize(2048);
            KeyPair kp = kpg.generateKeyPair();
            X500Name name = new X500Name("CN=tvremote-app");
            Date nb = new Date(System.currentTimeMillis() - 86400000L);
            Date na = new Date(nb.getTime() + 3650L * 86400000L);
            JcaX509v3CertificateBuilder b = new JcaX509v3CertificateBuilder(
                    name, BigInteger.valueOf(1000), nb, na, name, kp.getPublic());
            b.addExtension(Extension.basicConstraints, false, new BasicConstraints(0));
            b.addExtension(Extension.subjectAlternativeName, false,
                    new GeneralNames(new GeneralName(GeneralName.dNSName, "tvremote-app")));
            ContentSigner signer = new JcaContentSignerBuilder("SHA256withRSA").build(kp.getPrivate());
            X509Certificate cert = new JcaX509CertificateConverter().getCertificate(b.build(signer));
            ks.load(null, null);
            ks.setKeyEntry("tv", kp.getPrivate(), PW, new Certificate[]{cert});
            try (FileOutputStream o = new FileOutputStream(p12)) { ks.store(o, PW); }
        }
        clientCert = (X509Certificate) ks.getCertificate("tv");
        KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        kmf.init(ks, PW);
        TrustManager trustAll = new X509TrustManager() {
            public void checkClientTrusted(X509Certificate[] c, String a) {}
            public void checkServerTrusted(X509Certificate[] c, String a) {}
            public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
        };
        SSLContext c = SSLContext.getInstance("TLS");
        c.init(kmf.getKeyManagers(), new TrustManager[]{trustAll}, null);
        ctx = c;
    }

    private SSLSocket open(String host, int port) throws Exception {
        identity();
        java.net.Socket plain = new java.net.Socket();
        Binder b = binder;
        if (b != null) b.bind(plain, host);
        try {
            plain.connect(new InetSocketAddress(host, port), 6000);
        } catch (IOException e) {
            try { plain.close(); } catch (IOException ignored) {}
            throw new IOException("TV (" + host + ") se ne javlja na portu " + port
                    + ". Je li mobitel na istoj Wi-Fi mreži i je li TV upaljen?", e);
        }
        SSLSocket s = (SSLSocket) ctx.getSocketFactory().createSocket(plain, host, port, true);
        s.setSoTimeout(10000);
        s.startHandshake();
        return s;
    }

    // ---------- framing ----------
    private static byte[] readFrame(InputStream in) throws IOException {
        long len = 0; int shift = 0;
        while (true) {
            int b = in.read();
            if (b < 0) throw new IOException("Veza zatvorena");
            len |= (long) (b & 0x7F) << shift;
            if ((b & 0x80) == 0) break;
            shift += 7;
        }
        if (len < 0 || len > (1 << 20)) throw new IOException("Neispravna poruka");
        byte[] buf = new byte[(int) len];
        int off = 0;
        while (off < buf.length) {
            int n = in.read(buf, off, buf.length - off);
            if (n < 0) throw new IOException("Veza zatvorena");
            off += n;
        }
        return buf;
    }

    // ---------- pairing ----------
    private static Pb outer() { return new Pb().i(1, 2).i(2, 200); }

    /** Step 1: TV shows a 6-character code on screen after this returns. */
    synchronized void pairStart(String host) throws Exception {
        closePair();
        pairSock = open(host, PAIR_PORT);
        InputStream in = pairSock.getInputStream();
        OutputStream o = pairSock.getOutputStream();
        o.write(outer().m(10, new Pb().s(1, "atvremote").s(2, "Mobitel")).framed()); o.flush();
        while (true) {
            Pb.Msg m = Pb.parse(readFrame(in));
            if (m.i(2, 200) != 200) throw new IOException("TV je odbio uparivanje (status " + m.i(2, 0) + ")");
            if (m.has(11)) {
                Pb enc = new Pb().i(1, 3).i(2, 6);
                o.write(outer().m(20, new Pb().m(1, enc).i(3, 1)).framed());
            } else if (m.has(20)) {
                Pb enc = new Pb().i(1, 3).i(2, 6);
                o.write(outer().m(30, new Pb().m(1, enc).i(2, 1)).framed());
            } else if (m.has(31)) {
                return;
            } else throw new IOException("Neočekivana poruka pri uparivanju");
            o.flush();
        }
    }

    private static byte[] unsigned(BigInteger v) {
        byte[] b = v.toByteArray();
        return (b.length > 1 && b[0] == 0) ? Arrays.copyOfRange(b, 1, b.length) : b;
    }

    /** Step 2: send the code that is shown on the TV. */
    synchronized void pairFinish(String code) throws Exception {
        if (pairSock == null) throw new IOException("Uparivanje nije pokrenuto");
        code = code.trim();
        if (!code.matches("[0-9a-fA-F]{6}")) throw new IOException("Kod mora imati 6 znakova (0-9, A-F)");
        RSAPublicKey cpk = (RSAPublicKey) clientCert.getPublicKey();
        RSAPublicKey spk = (RSAPublicKey) pairSock.getSession().getPeerCertificates()[0].getPublicKey();
        MessageDigest h = MessageDigest.getInstance("SHA-256");
        h.update(unsigned(cpk.getModulus())); h.update(unsigned(cpk.getPublicExponent()));
        h.update(unsigned(spk.getModulus())); h.update(unsigned(spk.getPublicExponent()));
        byte[] tail = new byte[2];
        for (int i = 0; i < 2; i++) tail[i] = (byte) Integer.parseInt(code.substring(2 + 2 * i, 4 + 2 * i), 16);
        h.update(tail);
        byte[] hash = h.digest();
        if ((hash[0] & 0xFF) != Integer.parseInt(code.substring(0, 2), 16)) throw new IOException("Krivi kod");
        OutputStream o = pairSock.getOutputStream();
        o.write(outer().m(40, new Pb().b(1, hash)).framed()); o.flush();
        InputStream in = pairSock.getInputStream();
        Pb.Msg m = Pb.parse(readFrame(in));
        closePair();
        if (m.i(2, 200) != 200 || !m.has(41)) throw new IOException("Uparivanje nije uspjelo");
    }

    synchronized void closePair() {
        if (pairSock != null) { try { pairSock.close(); } catch (IOException ignored) {} pairSock = null; }
    }

    // ---------- remote ----------
    synchronized void connect(String host) throws Exception {
        close();
        this.host = host;
        sock = open(host, REMOTE_PORT);
        out = sock.getOutputStream();
        started = new CountDownLatch(1);
        ready = false;
        final SSLSocket s = sock;
        final InputStream in = s.getInputStream();
        s.setSoTimeout(0);
        Thread t = new Thread(() -> {
            try {
                while (true) handle(Pb.parse(readFrame(in)));
            } catch (Exception e) {
                ready = false;
                try { s.close(); } catch (IOException ignored) {}
            }
        }, "tv-reader");
        t.setDaemon(true);
        t.start();
        if (!started.await(8, TimeUnit.SECONDS)) {
            close();
            throw new IOException("TV ne odgovara. Je li upareno i je li TV upaljen?");
        }
    }

    private final Object wlock = new Object();

    private void write(byte[] b) throws IOException {
        // Separate lock: connect() holds the Tv monitor while waiting for the TV,
        // and the reader thread must be able to answer meanwhile.
        synchronized (wlock) {
            OutputStream o = out;
            if (o == null) throw new IOException("Nema veze");
            o.write(b); o.flush();
        }
    }

    private void handle(Pb.Msg m) throws IOException {
        if (m.has(1)) { // remote_configure
            Pb.Msg cfg = m.m(1);
            int wanted = BASE_FEATURES | (ime ? IME_FEATURE : 0);
            int supported = (int) cfg.i(1, wanted);
            active = wanted & supported;
            write(new Pb().m(1, new Pb().i(1, active)
                    .m(2, new Pb().i(3, 1).s(4, "1").s(5, "atvremote").s(6, "1.0.0"))).framed());
        } else if (m.has(2)) { // remote_set_active
            write(new Pb().m(2, new Pb().i(1, active)).framed());
        } else if (m.has(8)) { // ping request
            long v = m.m(8).i(1, 0);
            write(new Pb().m(9, new Pb().i(1, v)).framed());
        } else if (m.has(20)) { // ime_key_inject: a text field has focus on the TV
            Pb.Msg inj = m.m(20), app = inj.m(1), tf = inj.m(2);
            imeCounter = app == null ? 0 : (int) app.i(1, 0);
            imeFieldCounter = tf == null ? 0 : (int) tf.i(1, 0);
            hasImeCounter = imeCounter != 0;
            hasImeFieldCounter = imeFieldCounter != 0;
        } else if (m.has(22)) { // ime_show_request: TV wants a keyboard
            Pb.Msg sr = m.m(22), tf = sr == null ? null : sr.m(2);
            if (tf != null) { imeFieldCounter = (int) tf.i(1, 0); hasImeFieldCounter = true; }
            Listener l = listener;
            if (l != null) l.textFieldFocused();
        } else if (m.has(21)) { // ime_batch_edit echoed by the TV
            Pb.Msg be = m.m(21);
            if (!hasImeCounter) imeCounter = (int) be.i(1, 0);
            if (!hasImeFieldCounter) imeFieldCounter = (int) be.i(2, 0);
        } else if (m.has(3)) { // remote_error
            Pb.Msg e = m.m(3);
            byte[] msg = e == null ? null : e.b(2);
            lastError = msg == null ? "" : new String(msg, java.nio.charset.StandardCharsets.UTF_8);
            lastErrorAt = System.currentTimeMillis();
        } else if (m.has(40)) { // remote_start (also sent when the TV turns on/off)
            Pb.Msg st = m.m(40);
            on = st == null || st.i(1, 0) != 0;
            ready = true;
            started.countDown();
        }
    }

    boolean isReady() { return ready; }
    private volatile boolean on = true;
    /** Whether the TV said it is on (only meaningful while connected). */
    boolean isOn() { return ready && on; }

    synchronized void close() {
        ready = false;
        if (sock != null) { try { sock.close(); } catch (IOException ignored) {} sock = null; out = null; }
    }

    /** Send a message, reconnecting once if the connection has dropped. */
    private void send(byte[] framed) throws Exception {
        if (!ready) connect(host);
        try { write(framed); }
        catch (IOException e) { connect(host); write(framed); }
    }

    void key(int keyCode) throws Exception {
        send(new Pb().m(10, new Pb().i(1, keyCode).i(2, DIRECTION_SHORT)).framed());
    }
    void link(String url) throws Exception {
        send(new Pb().m(90, new Pb().s(1, url)).framed());
    }
    void text(String s) throws Exception {
        Pb edit = new Pb().i(1, 1).m(2, new Pb().i(1, s.length()).i(2, s.length()).s(3, s));
        send(new Pb().m(21, new Pb().i(1, imeCounter).i(2, imeFieldCounter).m(3, edit)).framed());
    }
    void setHost(String h) { this.host = h; }
}
