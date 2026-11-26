package com.tvremote.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;

import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity implements Tv.Listener {
    static final int UP = 19, DOWN = 20, LEFT = 21, RIGHT = 22, OK = 23, BACK = 4, HOME = 3,
            VOL_UP = 24, VOL_DOWN = 25, MUTE = 164, PLAY = 85, FF = 90, REW = 89,
            POWER = 26, WAKE = 224, SLEEP = 223, INPUT = 178, SETTINGS = 176, DEL = 67, ENTER = 66;

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final ExecutorService launcher = Executors.newSingleThreadExecutor();
    private final Handler ui = new Handler(Looper.getMainLooper());
    private Tv tv;
    private SharedPreferences prefs;

    private TextView status;
    private View setupScreen, mainScreen;
    private EditText ipField;
    private final View[] tabs = new View[3];
    private TabItem[] tabItems = new TabItem[3];
    private EditText kbField;
    private String prevText = "";
    private boolean suppress;
    private boolean autoKeyboard = true;
    private List<Apps.App> apps = new ArrayList<>();
    private Apps.App searchApp;
    private final List<TextView> chips = new ArrayList<>();
    private LinearLayout appsGrid;
    private EditText searchField;

    private String lastTapKey = ""; private long lastTapAt; private int lastTapIdx;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(Ui.BG));
        tv = new Tv(getFilesDir());
        tv.listener = this;
        tv.binder = this::bindToWifi;
        prefs = getSharedPreferences("tv", MODE_PRIVATE);
        tv.setIme(prefs.getBoolean("ime", true));
        autoKeyboard = prefs.getBoolean("autokb", true);
        loadApps();
        searchApp = apps.get(0);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Ui.BG);
        setupScreen = buildSetup();
        mainScreen = buildMain();
        root.addView(mainScreen); root.addView(setupScreen);
        setContentView(root);
        String ip = prefs.getString("ip", "");
        ipField.setText(ip);
        if (!ip.isEmpty() && prefs.getBoolean("paired:" + ip, false)) showMain(ip);
        else { setupScreen.setVisibility(View.VISIBLE); mainScreen.setVisibility(View.GONE); }
    }

    @Override protected void onStop() { super.onStop(); io.execute(tv::close); }

    /** Home addresses go over Wi-Fi even when Android prefers mobile data; Tailscale (100.x) is left alone. */
    private void bindToWifi(java.net.Socket s, String host) throws java.io.IOException {
        if (!isLan(host)) return;
        android.net.ConnectivityManager cm = (android.net.ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (cm == null) return;
        for (android.net.Network n : cm.getAllNetworks()) {
            android.net.NetworkCapabilities c = cm.getNetworkCapabilities(n);
            if (c != null && (c.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI)
                    || c.hasTransport(android.net.NetworkCapabilities.TRANSPORT_ETHERNET))) {
                n.bindSocket(s);
                return;
            }
        }
        throw new java.io.IOException("Mobitel nije spojen na Wi-Fi. Uključi Wi-Fi i spoji se na kućnu mrežu (ista kao TV).");
    }

    private static boolean isLan(String h) {
        return h.startsWith("192.168.") || h.startsWith("10.") || h.matches("172\\.(1[6-9]|2\\d|3[01])\\..*");
    }

    // text field on the TV got focus -> bring up the phone keyboard
    @Override public void textFieldFocused() {
        ui.post(() -> {
            if (!autoKeyboard || mainScreen.getVisibility() != View.VISIBLE) return;
            suppress = true; kbField.setText(""); prevText = ""; suppress = false;
            selectTab(2); showKeyboard();
            setStatus("TV traži unos teksta");
        });
    }

    // ---------- helpers ----------
    private int dp(float v) { return Ui.dp(this, v); }

    private TextView text(String s, float sp, int color, Typeface tf) {
        TextView t = new TextView(this);
        t.setText(s); t.setTextSize(sp); t.setTextColor(color); t.setTypeface(tf);
        return t;
    }

    private EditText field(String hint) {
        EditText e = new EditText(this);
        e.setHint(hint); e.setHintTextColor(Ui.LABEL); e.setTextColor(Color.WHITE); e.setTextSize(17);
        e.setSingleLine(true);
        GradientDrawable g = new GradientDrawable(); g.setColor(Ui.CARD); g.setCornerRadius(dp(14));
        e.setBackground(g); e.setPadding(dp(16), dp(14), dp(16), dp(14));
        return e;
    }

    private LinearLayout row(int heightDp, View... views) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                heightDp > 0 ? dp(heightDp) : ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(14);
        r.setLayoutParams(lp);
        for (View v : views) {
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0,
                    heightDp > 0 ? ViewGroup.LayoutParams.MATCH_PARENT : ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            p.leftMargin = dp(6); p.rightMargin = dp(6);
            v.setLayoutParams(p); r.addView(v);
        }
        return r;
    }

    private Ui.Btn circle(int icon, final int key, boolean repeat) {
        Ui.Btn b = new Ui.Btn(this, icon, null, Ui.CARD, false, () -> press(key));
        return repeat ? b.repeat() : b;
    }

    private ScrollView scroll(LinearLayout content) {
        ScrollView sv = new ScrollView(this);
        sv.setVerticalScrollBarEnabled(false);
        content.setPadding(dp(18), dp(8), dp(18), dp(24));
        sv.addView(content);
        return sv;
    }

    // ---------- setup screen ----------
    private View buildSetup() {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setPadding(dp(24), dp(64), dp(24), dp(24));
        c.addView(text("TV daljinski", 34, Ui.WHITE, Ui.LIGHT));
        TextView sub = text("Upiši IP adresu TV-a (Postavke → Mreža) i upari ga kodom koji se prikaže na ekranu. "
                + "Mobitel mora biti na istoj Wi-Fi mreži kao TV.", 15, Ui.LABEL, Typeface.DEFAULT);
        sub.setPadding(0, dp(10), 0, dp(24));
        c.addView(sub);
        ipField = field("IP adresa, npr. 192.168.0.177");
        ipField.setInputType(InputType.TYPE_CLASS_PHONE);
        c.addView(ipField);
        Ui.Btn go = new Ui.Btn(this, Ui.NONE, "Poveži i upari", Ui.BLUE, true, this::startConnect);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52));
        lp.topMargin = dp(16); go.setLayoutParams(lp);
        c.addView(go);
        ScrollView sv = new ScrollView(this); sv.setBackgroundColor(Ui.BG); sv.addView(c);
        return sv;
    }

    // ---------- main screen ----------
    private View buildMain() {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setBackgroundColor(Ui.BG);
        status = text("", 12.5f, Ui.LABEL, Ui.MEDIUM);
        status.setGravity(Gravity.CENTER); status.setPadding(dp(12), dp(14), dp(12), dp(4));
        status.setSingleLine(true);
        col.addView(status);

        FrameLayout body = new FrameLayout(this);
        tabs[0] = buildRemoteTab(); tabs[1] = buildAppsTab(); tabs[2] = buildKeyboardTab();
        for (View t : tabs) body.addView(t);
        col.addView(body, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setBackgroundColor(0xFF111113);
        String[] names = {"Daljinski", "Aplikacije", "Tipkovnica"};
        int[] icons = {Ui.REMOTE, Ui.APPS, Ui.KEYB};
        for (int i = 0; i < 3; i++) {
            final int idx = i;
            tabItems[i] = new TabItem(this, icons[i], names[i]);
            tabItems[i].setOnClickListener(v -> { selectTab(idx); if (idx == 2) showKeyboard(); });
            bar.addView(tabItems[i], new LinearLayout.LayoutParams(0, dp(62), 1f));
        }
        col.addView(bar);
        selectTab(0);
        return col;
    }

    private void selectTab(int i) {
        for (int k = 0; k < 3; k++) { tabs[k].setVisibility(k == i ? View.VISIBLE : View.GONE); tabItems[k].setSelectedTab(k == i); }
        if (i != 2) hideKeyboard();
    }

    private final class TabItem extends View {
        private final int icon; private final String name; private boolean sel;
        private final android.graphics.Paint p = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
        TabItem(Context c, int icon, String name) { super(c); this.icon = icon; this.name = name; setClickable(true); }
        void setSelectedTab(boolean s) { sel = s; invalidate(); }
        @Override protected void onDraw(android.graphics.Canvas c) {
            int col = sel ? Ui.BLUE : Ui.LABEL;
            Ui.icon(c, icon, getWidth() / 2f, getHeight() * .38f, dp(8.5f), col);
            p.setColor(col); p.setTextAlign(android.graphics.Paint.Align.CENTER); p.setTypeface(Ui.MEDIUM);
            p.setTextSize(10.5f * getResources().getDisplayMetrics().scaledDensity);
            c.drawText(name, getWidth() / 2f, getHeight() * .84f, p);
        }
    }

    // ----- remote tab -----
    private View buildRemoteTab() {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        Ui.Btn on = new Ui.Btn(this, Ui.POWER, "  Upali", Ui.BLUE, true, this::wakeUp); on.textSize(15);
        on.longAction = this::askMac;
        Ui.Btn off = new Ui.Btn(this, Ui.NONE, "Ugasi", Ui.CARD, true, () -> press(SLEEP)); off.textSize(15);
        Ui.Btn pwr = new Ui.Btn(this, Ui.POWER, null, Ui.CARD, true, () -> press(POWER)); pwr.fg = Ui.RED;
        c.addView(row(46, on, off, pwr));
        c.addView(row(0, circle(Ui.BACK, BACK, false), circle(Ui.HOME, HOME, false), circle(Ui.INPUT, INPUT, false), circle(Ui.GEAR, SETTINGS, false)));
        Ui.ClickPad pad = new Ui.ClickPad(this);
        pad.key = this::press;
        LinearLayout.LayoutParams pl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        pl.topMargin = dp(18); pl.bottomMargin = dp(4);
        c.addView(pad, pl);
        c.addView(row(0, circle(Ui.REW, REW, false), circle(Ui.PLAY, PLAY, false), circle(Ui.FF, FF, false)));
        Ui.Btn kb = new Ui.Btn(this, Ui.KEYB, null, Ui.CARD, false, () -> { selectTab(2); showKeyboard(); });
        c.addView(row(0, circle(Ui.MUTE, MUTE, false), circle(Ui.MINUS, VOL_DOWN, true), circle(Ui.PLUS, VOL_UP, true), kb));
        return scroll(c);
    }

    // ----- apps tab -----
    private View buildAppsTab() {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.addView(text("Aplikacije", 30, Ui.WHITE, Ui.LIGHT));
        appsGrid = new LinearLayout(this);
        appsGrid.setOrientation(LinearLayout.VERTICAL);
        c.addView(appsGrid);

        TextView h = text("Pretraga", 22, Ui.WHITE, Ui.LIGHT);
        h.setPadding(0, dp(26), 0, dp(10));
        c.addView(h);
        searchField = field("Što tražiš?");
        searchField.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        searchField.setOnEditorActionListener((v, a, e) -> { doSearch(); return true; });
        c.addView(searchField);

        HorizontalScrollView hs = new HorizontalScrollView(this);
        hs.setHorizontalScrollBarEnabled(false);
        LinearLayout chipRow = new LinearLayout(this);
        chipRow.setOrientation(LinearLayout.HORIZONTAL);
        chipRow.setTag("chips");
        hs.addView(chipRow);
        LinearLayout.LayoutParams hp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        hp.topMargin = dp(12);
        c.addView(hs, hp);

        Ui.Btn go = new Ui.Btn(this, Ui.SEARCH, "  Traži", Ui.BLUE, true, this::doSearch);
        LinearLayout.LayoutParams gp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(50));
        gp.topMargin = dp(14); c.addView(go, gp);
        TextView hint = text("Ako aplikacija ne otvori pretragu sama: otvori je, na TV-u dođi do polja za pretragu "
                + "i upiši tekst na kartici Tipkovnica. Tipkovnica se otvori automatski kad TV traži unos.", 13, Ui.LABEL, Typeface.DEFAULT);
        hint.setPadding(dp(4), dp(12), dp(4), 0);
        c.addView(hint);
        renderApps(chipRow);
        return scroll(c);
    }

    private void renderApps(LinearLayout chipRow) {
        appsGrid.removeAllViews(); chipRow.removeAllViews(); chips.clear();
        List<Object[]> items = new ArrayList<>();
        for (Apps.App a : apps) items.add(new Object[]{a});
        items.add(new Object[]{null});
        LinearLayout r = null;
        for (int i = 0; i < items.size(); i++) {
            if (i % 4 == 0) {
                r = new LinearLayout(this); r.setOrientation(LinearLayout.HORIZONTAL);
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                lp.topMargin = dp(14); appsGrid.addView(r, lp);
            }
            final Apps.App a = (Apps.App) items.get(i)[0];
            View t = a == null
                    ? new Ui.Tile(this, "Dodaj", "+", Ui.CARD2, this::addApp)
                    : new Ui.Tile(this, a.name, a.mark, a.color, () -> openApp(a));
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            p.leftMargin = p.rightMargin = dp(4);
            r.addView(t, p);
            if (a != null) {
                t.setOnLongClickListener(v -> { if (isCustom(a)) removeApp(a); return true; });
            }
        }
        while (r != null && r.getChildCount() < 4) {
            View sp = new View(this);
            r.addView(sp, new LinearLayout.LayoutParams(0, 1, 1f));
        }
        for (final Apps.App a : apps) {
            final TextView chip = text(a.name, 14, Ui.WHITE, Ui.MEDIUM);
            chip.setPadding(dp(14), dp(8), dp(14), dp(8));
            chip.setOnClickListener(v -> { searchApp = a; styleChips(); });
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            p.rightMargin = dp(8);
            chipRow.addView(chip, p); chips.add(chip); chip.setTag(a);
        }
        styleChips();
    }

    private void styleChips() {
        for (TextView c : chips) {
            boolean sel = c.getTag() == searchApp;
            GradientDrawable g = new GradientDrawable(); g.setCornerRadius(dp(20));
            g.setColor(sel ? Ui.BLUE : Ui.CARD);
            c.setBackground(g); c.setTextColor(sel ? Color.WHITE : 0xFFD1D1D6);
        }
    }

    // ----- keyboard tab -----
    private View buildKeyboardTab() {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.addView(text("Tipkovnica", 30, Ui.WHITE, Ui.LIGHT));
        TextView d = text("Sve što upišeš ovdje odmah se upisuje u polje na TV-u. Prvo na TV-u odaberi polje za pretragu.", 14, Ui.LABEL, Typeface.DEFAULT);
        d.setPadding(0, dp(8), 0, dp(14));
        c.addView(d);
        kbField = field("Piši ovdje…");
        kbField.setTextSize(20);
        kbField.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        kbField.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);
        kbField.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int a, int b, int c2) {}
            public void onTextChanged(CharSequence s, int a, int b, int c2) {}
            public void afterTextChanged(Editable e) {
                if (suppress) return;
                String now = e.toString(), old = prevText;
                prevText = now;
                syncText(old, now);
            }
        });
        kbField.setOnEditorActionListener((v, a, e) -> { press(ENTER); return true; });
        c.addView(kbField);

        Ui.Btn clear = new Ui.Btn(this, Ui.NONE, "Obriši sve", Ui.CARD, true, this::clearAll); clear.textSize(15);
        Ui.Btn enter = new Ui.Btn(this, Ui.SEARCH, "  Traži / Enter", Ui.BLUE, true, () -> press(ENTER)); enter.textSize(15);
        c.addView(row(48, clear, enter));
        Ui.Btn back = new Ui.Btn(this, Ui.BACK, null, Ui.CARD, true, () -> press(BACK));
        Ui.Btn del = new Ui.Btn(this, Ui.NONE, "⌫", Ui.CARD, true, () -> press(DEL)); del.repeat().textSize(20);
        Ui.Btn ok = new Ui.Btn(this, Ui.NONE, "OK", Ui.CARD, true, () -> press(OK)); ok.textSize(15);
        c.addView(row(48, back, del, ok));

        final Switch auto = new Switch(this);
        auto.setText("Automatski otvori tipkovnicu kad TV traži unos");
        auto.setTextColor(0xFFD1D1D6); auto.setChecked(autoKeyboard);
        auto.setOnCheckedChangeListener((b, on) -> { autoKeyboard = on; prefs.edit().putBoolean("autokb", on).apply(); });
        auto.setPadding(0, dp(22), 0, dp(6));
        c.addView(auto);
        final Switch ime = new Switch(this);
        ime.setText("Tipkovnica s mobitela (isključi ako TV zbog toga pokazuje čudan ekran)");
        ime.setTextColor(0xFFD1D1D6); ime.setChecked(prefs.getBoolean("ime", true));
        ime.setOnCheckedChangeListener((b, on) -> {
            prefs.edit().putBoolean("ime", on).apply(); tv.setIme(on); io.execute(tv::close);
            setStatus("Spajam se ponovno pri sljedećoj tipki");
        });
        ime.setPadding(0, dp(10), 0, 0);
        c.addView(ime);
        return scroll(c);
    }

    private void syncText(final String old, final String now) {
        if (now.startsWith(old)) {
            final String add = now.substring(old.length());
            if (!add.isEmpty()) run(() -> tv.text(add));
        } else if (old.startsWith(now)) {
            final int n = old.length() - now.length();
            run(() -> { for (int i = 0; i < n; i++) tv.key(DEL); });
        } else {
            final int n = old.length();
            run(() -> { for (int i = 0; i < n; i++) tv.key(DEL); tv.text(now); });
        }
    }

    private void clearAll() {
        final int n = prevText.length();
        suppress = true; kbField.setText(""); prevText = ""; suppress = false;
        if (n > 0) run(() -> { for (int i = 0; i < n; i++) tv.key(DEL); });
    }

    private void showKeyboard() {
        kbField.requestFocus();
        ui.postDelayed(() -> {
            InputMethodManager m = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
            if (m != null) m.showSoftInput(kbField, InputMethodManager.SHOW_IMPLICIT);
        }, 150);
    }

    private void hideKeyboard() {
        InputMethodManager m = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        View f = getCurrentFocus();
        if (m != null && f != null) m.hideSoftInputFromWindow(f.getWindowToken(), 0);
    }

    // ---------- actions ----------
    private interface Job { void run() throws Exception; }

    private void setStatus(final String s) { ui.post(() -> status.setText(s)); }

    private String err(Exception e) { return "✗ " + (e.getMessage() == null ? e.toString() : e.getMessage()); }

    private void run(final Job j) {
        io.execute(() -> {
            try { j.run(); setStatus("✓ " + prefs.getString("ip", "")); }
            catch (Exception e) { setStatus(err(e)); }
        });
    }

    private void press(final int code) { run(() -> tv.key(code)); }

    private void openApp(Apps.App a) {
        List<String> cands = new ArrayList<>();
        for (String s : a.launch) cands.add(s);
        launch("open:" + a.name, cands, "Otvaram " + a.name);
    }

    private void doSearch() {
        final String q = searchField.getText().toString().trim();
        if (q.isEmpty()) { setStatus("Upiši što tražiš"); return; }
        hideKeyboard();
        List<String> cands = new ArrayList<>();
        String enc;
        try { enc = URLEncoder.encode(q, "UTF-8").replace("+", "%20"); } catch (Exception e) { enc = q; }
        for (String t : searchApp.search) cands.add(t.replace("%s", enc));
        boolean hasSearch = !cands.isEmpty();
        for (String s : searchApp.launch) cands.add(s);
        launch("search:" + searchApp.name + ":" + q, cands, "Tražim u " + searchApp.name);
        if (!hasSearch) {
            setStatus(searchApp.name + " nema izravnu pretragu: dođi do pretrage na TV-u i tipkaj ovdje");
            suppress = true; kbField.setText(""); prevText = ""; suppress = false;
            selectTab(2); showKeyboard();
        }
    }

    /**
     * Tries the candidates in order; if the TV reports an error, goes to the next.
     * Tapping the same thing again within 10 s starts from the next candidate.
     */
    private void launch(final String key, final List<String> cands, final String msg) {
        launcher.execute(() -> {
            int idx = 0;
            long now = System.currentTimeMillis();
            if (key.equals(lastTapKey) && now - lastTapAt < 10000) idx = (lastTapIdx + 1) % cands.size();
            for (int tries = 0; tries < cands.size(); tries++) {
                String link = cands.get(idx);
                long sent = System.currentTimeMillis();
                try { tv.link(link); }
                catch (Exception e) { setStatus(err(e)); return; }
                setStatus(msg + " (" + (idx + 1) + "/" + cands.size() + ")");
                try { Thread.sleep(1300); } catch (InterruptedException ignored) {}
                if (tv.lastErrorAt <= sent) break;
                idx = (idx + 1) % cands.size();
            }
            lastTapKey = key; lastTapAt = System.currentTimeMillis(); lastTapIdx = idx;
            setStatus(msg + " ✓ — ako se ništa ne dogodi, dodirni ponovo za drugu metodu");
        });
    }

    // ---------- waking a TV that is off ----------
    /** Wake-on-LAN magic packet, then keep trying to reach the remote service while the TV boots. */
    private void wakeUp() {
        final String mac = prefs.getString("mac", "");
        if (mac.isEmpty()) { askMac(); return; }
        setStatus("Budim TV …");
        launcher.execute(() -> {
            for (int i = 0; i < 5; i++) {
                try { sendWol(mac); } catch (Exception e) { setStatus(err(e)); return; }
                try { tv.key(WAKE); setStatus("✓ TV je budan"); return; }
                catch (Exception e) {
                    setStatus("Budim TV … (" + (i + 1) + "/5)");
                    try { Thread.sleep(2500); } catch (InterruptedException ignored) {}
                }
            }
            setStatus("TV se ne budi preko mreže: dugo drži Upali za upute");
        });
    }

    private void sendWol(String mac) throws Exception {
        String[] hex = mac.split("[:-]");
        byte[] m = new byte[6];
        for (int i = 0; i < 6; i++) m[i] = (byte) Integer.parseInt(hex[i], 16);
        byte[] pkt = new byte[102];
        for (int i = 0; i < 6; i++) pkt[i] = (byte) 0xFF;
        for (int i = 6; i < 102; i += 6) System.arraycopy(m, 0, pkt, i, 6);
        String ip = prefs.getString("ip", "");
        java.util.List<String> targets = new java.util.ArrayList<>();
        targets.add("255.255.255.255");
        int dot = ip.lastIndexOf('.');
        if (isLan(ip) && dot > 0) { targets.add(ip.substring(0, dot) + ".255"); targets.add(ip); }
        try (java.net.DatagramSocket ds = new java.net.DatagramSocket()) {
            ds.setBroadcast(true);
            android.net.ConnectivityManager cm = (android.net.ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (cm != null) for (android.net.Network n : cm.getAllNetworks()) {
                android.net.NetworkCapabilities c = cm.getNetworkCapabilities(n);
                if (c != null && c.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI)) { n.bindSocket(ds); break; }
            }
            for (String t : targets) for (int port : new int[]{9, 7}) {
                try { ds.send(new java.net.DatagramPacket(pkt, pkt.length, java.net.InetAddress.getByName(t), port)); }
                catch (java.io.IOException ignored) {}
            }
        }
    }

    private void askMac() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL); l.setPadding(dp(20), dp(8), dp(20), 0);
        final EditText mac = new EditText(this);
        mac.setHint("npr. A1:B2:C3:D4:E5:F6"); mac.setSingleLine(true);
        mac.setText(prefs.getString("mac", ""));
        mac.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        TextView h = text("Za paljenje ugašenog TV-a treba MAC adresa njegove Wi-Fi veze.\n\n"
                + "Na laptopu: adb shell ip link show wlan0 (redak link/ether).\n"
                + "Ili na TV-u: Postavke → Sustav → O uređaju → Status.\n\n"
                + "Na TV-u u Postavke → Sustav → Napajanje i energija uključi buđenje preko mreže "
                + "(Wake on LAN / Wi-Fi, mrežni standby) ako postoji, i isključi način niske potrošnje.\n\n"
                + "Ako TV to ne podržava, upali ga daljinskim ili preko soundbara (HDMI-CEC).", 13, Ui.LABEL, Typeface.DEFAULT);
        h.setPadding(0, dp(10), 0, 0);
        l.addView(mac); l.addView(h);
        ScrollView sv = new ScrollView(this); sv.addView(l);
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Paljenje preko mreže").setView(sv)
                .setNegativeButton("Odustani", null)
                .setPositiveButton("Spremi", (d, w) -> {
                    String v = mac.getText().toString().trim().toUpperCase().replace('-', ':');
                    if (!v.matches("([0-9A-F]{2}:){5}[0-9A-F]{2}")) { Toast("Neispravna MAC adresa"); return; }
                    prefs.edit().putString("mac", v).apply();
                    wakeUp();
                }).show();
    }

    // ---------- custom apps ----------
    private boolean isCustom(Apps.App a) { return a.mark.equals("★"); }

    private void loadApps() {
        apps = Apps.presets();
        String saved = prefs.getString("custom", "");
        for (String line : saved.split("\n")) {
            String[] p = line.split("\\|", 2);
            if (p.length == 2 && !p[0].isEmpty() && !p[1].isEmpty())
                apps.add(new Apps.App(p[0], "★", 0xFF636366, new String[]{p[1]}, new String[]{}));
        }
    }

    private void saveCustom() {
        StringBuilder sb = new StringBuilder();
        for (Apps.App a : apps) if (isCustom(a)) sb.append(a.name).append('|').append(a.launch[0]).append('\n');
        prefs.edit().putString("custom", sb.toString()).apply();
    }

    private void refreshApps() {
        LinearLayout chipRow = (LinearLayout) findTag(tabs[1], "chips");
        renderApps(chipRow);
    }

    private View findTag(View v, Object tag) {
        if (tag.equals(v.getTag())) return v;
        if (v instanceof ViewGroup) {
            ViewGroup g = (ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) { View f = findTag(g.getChildAt(i), tag); if (f != null) return f; }
        }
        return null;
    }

    private void addApp() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL); l.setPadding(dp(20), dp(8), dp(20), 0);
        final EditText name = new EditText(this); name.setHint("Naziv (npr. IB Player)");
        final EditText link = new EditText(this); link.setHint("ID paketa ili poveznica");
        link.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        TextView h = text("ID paketa je u adresi aplikacije na Google Playu (…?id=com.primjer.app). Na TV-u: Postavke → Aplikacije.", 12, Ui.LABEL, Typeface.DEFAULT);
        l.addView(name); l.addView(link); l.addView(h);
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Nova aplikacija").setView(l)
                .setNegativeButton("Odustani", null)
                .setPositiveButton("Dodaj", (d, w) -> {
                    String n = name.getText().toString().trim().replace("|", " ").replace("\n", " ");
                    String k = link.getText().toString().trim().replace("\n", "");
                    if (n.isEmpty() || k.isEmpty()) return;
                    apps.add(new Apps.App(n, "★", 0xFF636366, new String[]{k}, new String[]{}));
                    saveCustom(); refreshApps();
                }).show();
    }

    private void removeApp(final Apps.App a) {
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Ukloniti " + a.name + "?")
                .setNegativeButton("Ne", null)
                .setPositiveButton("Ukloni", (d, w) -> {
                    apps.remove(a); if (searchApp == a) searchApp = apps.get(0);
                    saveCustom(); refreshApps();
                }).show();
    }

    // ---------- connect / pair ----------
    private void showMain(String ip) {
        tv.setHost(ip);
        setupScreen.setVisibility(View.GONE);
        mainScreen.setVisibility(View.VISIBLE);
        setStatus("TV: " + ip);
        io.execute(() -> { try { tv.connect(ip); setStatus("● Spojeno: " + ip); } catch (Exception e) { setStatus(err(e)); } });
    }

    private void startConnect() {
        final String ip = ipField.getText().toString().trim();
        if (!ip.matches("[0-9a-zA-Z.\\-]+")) { Toast("Upiši ispravnu IP adresu"); return; }
        prefs.edit().putString("ip", ip).apply();
        Toast("Spajam se na " + ip + " …");
        io.execute(() -> {
            try { tv.pairStart(ip); }
            catch (Exception e) { ui.post(() -> Toast(err(e))); return; }
            ui.post(() -> askCode(ip));
        });
    }

    private void Toast(String s) { android.widget.Toast.makeText(this, s, android.widget.Toast.LENGTH_LONG).show(); }

    private void askCode(final String ip) {
        final EditText code = new EditText(this);
        code.setHint("npr. 1A2B3C");
        code.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);
        code.setSingleLine(true); code.setTextSize(24); code.setGravity(Gravity.CENTER);
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Kod s TV-a")
                .setMessage("Upiši kod od 6 znakova koji se prikazuje na TV-u.")
                .setView(code).setCancelable(false)
                .setNegativeButton("Odustani", (d, w) -> io.execute(tv::closePair))
                .setPositiveButton("Potvrdi", (d, w) -> {
                    final String c = code.getText().toString();
                    io.execute(() -> {
                        try {
                            tv.pairFinish(c);
                            prefs.edit().putBoolean("paired:" + ip, true).apply();
                            ui.post(() -> showMain(ip));
                        } catch (Exception e) { ui.post(() -> Toast(err(e))); }
                    });
                }).show();
    }

    @Override public void onBackPressed() {
        if (mainScreen.getVisibility() == View.VISIBLE && tabs[0].getVisibility() != View.VISIBLE) selectTab(0);
        else super.onBackPressed();
    }
}
