package com.tvremote.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputType;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.view.Gravity;
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

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.Socket;
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

    private View setupScreen, mainScreen;
    private EditText ipField;
    private TextView banner, hostLabel;
    private Dot dot;
    private final View[] tabs = new View[4];
    private final TabItem[] tabItems = new TabItem[4];
    private int currentTab;

    private EditText kbField, searchField;
    private TextView pendingChip;
    private String prevText = "";
    private boolean suppress, autoKeyboard;

    private List<Apps.App> apps = new ArrayList<>();
    private Apps.App searchApp;
    private final List<TextView> chips = new ArrayList<>();
    private LinearLayout appsGrid, chipRow;

    /** Query waiting to be typed as soon as the TV puts a text field in focus. */
    private volatile String pendingQuery;
    private volatile long pendingAt;

    private String lastTapKey = ""; private long lastTapAt; private int lastTapIdx;

    // ======================================================================
    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setBackgroundDrawable(new ColorDrawable(Ui.BG));
        getWindow().setStatusBarColor(Ui.BG);
        getWindow().setNavigationBarColor(0xFF111113);
        prefs = getSharedPreferences("tv", MODE_PRIVATE);
        tv = new Tv(getFilesDir());
        tv.listener = this;
        tv.binder = this::bindToWifi;
        tv.setIme(prefs.getBoolean("ime", true));
        autoKeyboard = prefs.getBoolean("autokb", true);
        loadApps();
        searchApp = apps.get(0);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Ui.BG);
        mainScreen = buildMain();
        setupScreen = buildSetup();
        root.addView(mainScreen);
        root.addView(setupScreen);
        setContentView(root);

        String ip = prefs.getString("ip", "");
        ipField.setText(ip);
        if (!ip.isEmpty() && prefs.getBoolean("paired:" + ip, false)) showMain(ip);
        else showSetup();
        ui.postDelayed(statusTick, 1000);
    }

    @Override protected void onStart() {
        super.onStart();
        if (mainScreen.getVisibility() == View.VISIBLE) connectQuietly();
    }

    @Override protected void onStop() { super.onStop(); io.execute(tv::close); }

    @Override public void onBackPressed() {
        if (mainScreen.getVisibility() == View.VISIBLE && currentTab != 0) selectTab(0);
        else super.onBackPressed();
    }

    /** Keeps the connection dot honest. */
    private final Runnable statusTick = new Runnable() {
        public void run() {
            if (dot != null) dot.set(tv.isReady() ? (tv.isOn() ? Ui.GREEN : 0xFFFF9F0A) : 0xFF48484A);
            ui.postDelayed(this, 1000);
        }
    };

    // ======================================================================
    // Tv.Listener: the TV put a text field in focus and wants a keyboard
    @Override public void textFieldFocused() {
        final String q = pendingQuery;
        if (q != null && System.currentTimeMillis() - pendingAt < 120_000) {
            pendingQuery = null;
            run(() -> tv.text(q), null);
            ui.post(() -> {
                suppress = true; kbField.setText(q); kbField.setSelection(q.length()); prevText = q; suppress = false;
                updatePendingChip();
                selectTab(2);
                say("Upisano na TV: „" + q + "“ — pritisni Traži ako treba", false);
            });
            return;
        }
        ui.post(() -> {
            if (!autoKeyboard || mainScreen.getVisibility() != View.VISIBLE) return;
            suppress = true; kbField.setText(""); prevText = ""; suppress = false;
            selectTab(2);
            showKeyboard();
        });
    }

    // ======================================================================
    // small helpers
    private int dp(float v) { return Ui.dp(this, v); }

    private TextView text(String s, float sp, int color, Typeface tf) {
        TextView t = new TextView(this);
        t.setText(s); t.setTextSize(sp); t.setTextColor(color); t.setTypeface(tf);
        return t;
    }

    private TextView title(String s) {
        TextView t = text(s, 32, Ui.WHITE, Typeface.create("sans-serif", Typeface.BOLD));
        t.setPadding(dp(4), dp(4), 0, dp(14));
        return t;
    }

    private GradientDrawable round(int color, float radiusDp) {
        GradientDrawable g = new GradientDrawable(); g.setColor(color); g.setCornerRadius(dp(radiusDp));
        return g;
    }

    private EditText field(String hint) {
        EditText e = new EditText(this);
        e.setHint(hint); e.setHintTextColor(0xFF636366); e.setTextColor(Color.WHITE); e.setTextSize(17);
        e.setSingleLine(true);
        e.setBackground(round(Ui.CARD, 14));
        e.setPadding(dp(16), dp(14), dp(16), dp(14));
        return e;
    }

    private LinearLayout.LayoutParams matchWrap(int topDp) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(topDp);
        return lp;
    }

    /** Row of equally wide cells; each child is centred in its cell. */
    private LinearLayout row(int heightDp, int topDp, View... views) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                heightDp > 0 ? dp(heightDp) : ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(topDp);
        r.setLayoutParams(lp);
        for (View v : views) {
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0,
                    heightDp > 0 ? ViewGroup.LayoutParams.MATCH_PARENT : ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            p.leftMargin = dp(5); p.rightMargin = dp(5);
            r.addView(v, p);
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
        sv.setOverScrollMode(View.OVER_SCROLL_NEVER);
        content.setPadding(dp(18), dp(6), dp(18), dp(28));
        sv.addView(content);
        return sv;
    }

    // ======================================================================
    // setup screen
    private View buildSetup() {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setPadding(dp(24), dp(72), dp(24), dp(24));
        Ui.IconView logo = new Ui.IconView(this, Ui.REMOTE);
        logo.color = Ui.BLUE;
        c.addView(logo, new LinearLayout.LayoutParams(dp(64), dp(64)));
        TextView t = text("TV daljinski", 34, Ui.WHITE, Typeface.create("sans-serif", Typeface.BOLD));
        t.setPadding(0, dp(16), 0, 0);
        c.addView(t);
        TextView sub = text("Upravljaj televizorom s mobitela. Upiši IP adresu TV-a "
                + "(na TV-u: Postavke → Mreža i internet → tvoja mreža) i upari ga kodom koji se prikaže na ekranu.",
                16, Ui.LABEL, Typeface.DEFAULT);
        sub.setLineSpacing(0, 1.15f);
        sub.setPadding(0, dp(10), 0, dp(28));
        c.addView(sub);
        ipField = field("192.168.0.177");
        ipField.setInputType(InputType.TYPE_CLASS_PHONE);
        ipField.setImeOptions(EditorInfo.IME_ACTION_GO);
        ipField.setOnEditorActionListener((v, a, e) -> { startConnect(); return true; });
        c.addView(ipField);
        Ui.Btn go = new Ui.Btn(this, Ui.NONE, "Poveži", Ui.BLUE, true, this::startConnect);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52));
        lp.topMargin = dp(14);
        c.addView(go, lp);
        TextView note = text("Mobitel mora biti na istoj Wi-Fi mreži kao TV.", 13, 0xFF636366, Typeface.DEFAULT);
        note.setGravity(Gravity.CENTER); note.setPadding(0, dp(14), 0, 0);
        c.addView(note);
        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(Ui.BG);
        sv.addView(c);
        return sv;
    }

    private void showSetup() {
        hideKeyboard();
        setupScreen.setVisibility(View.VISIBLE);
        mainScreen.setVisibility(View.GONE);
    }

    // ======================================================================
    // main screen
    private View buildMain() {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setBackgroundColor(Ui.BG);

        // header: connection dot + name, power on the right
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(22), dp(12), dp(16), dp(6));
        dot = new Dot(this);
        header.addView(dot, new LinearLayout.LayoutParams(dp(10), dp(10)));
        LinearLayout names = new LinearLayout(this);
        names.setOrientation(LinearLayout.VERTICAL);
        names.setPadding(dp(10), 0, 0, 0);
        names.addView(text("Televizor", 17, Ui.WHITE, Ui.MEDIUM));
        hostLabel = text("", 12.5f, Ui.LABEL, Typeface.DEFAULT);
        names.addView(hostLabel);
        header.addView(names, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        Ui.Btn power = new Ui.Btn(this, Ui.POWER, null, Ui.CARD, false, this::powerTapped);
        power.fg = Ui.RED; power.maxDiameterDp = 44;
        power.longAction = this::askMac;
        header.addView(power, new LinearLayout.LayoutParams(dp(44), dp(44)));
        col.addView(header);

        // transient message banner
        banner = text("", 13.5f, Ui.WHITE, Ui.MEDIUM);
        banner.setBackground(round(Ui.CARD2, 12));
        banner.setPadding(dp(14), dp(10), dp(14), dp(10));
        banner.setMaxLines(2);
        banner.setEllipsize(TextUtils.TruncateAt.END);
        banner.setVisibility(View.GONE);
        banner.setElevation(dp(6));

        FrameLayout body = new FrameLayout(this);
        tabs[0] = buildRemoteTab();
        tabs[1] = buildAppsTab();
        tabs[2] = buildKeyboardTab();
        tabs[3] = buildSettingsTab();
        for (View t : tabs) body.addView(t);
        FrameLayout.LayoutParams bl = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP);
        bl.leftMargin = bl.rightMargin = dp(14); bl.topMargin = dp(2);
        body.addView(banner, bl);
        banner.setOnClickListener(v -> banner.setVisibility(View.GONE));
        col.addView(body, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        View sep = new View(this);
        sep.setBackgroundColor(0xFF2C2C2E);
        col.addView(sep, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1));
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setBackgroundColor(0xFF111113);
        String[] names2 = {"Daljinski", "Aplikacije", "Tipkovnica", "Postavke"};
        int[] icons = {Ui.REMOTE, Ui.APPS, Ui.KEYB, Ui.SLIDERS};
        for (int i = 0; i < tabs.length; i++) {
            final int idx = i;
            tabItems[i] = new TabItem(this, icons[i], names2[i]);
            tabItems[i].setOnClickListener(v -> { selectTab(idx); if (idx == 2) showKeyboard(); });
            bar.addView(tabItems[i], new LinearLayout.LayoutParams(0, dp(60), 1f));
        }
        col.addView(bar);
        selectTab(0);
        return col;
    }

    private void selectTab(int i) {
        currentTab = i;
        for (int k = 0; k < tabs.length; k++) {
            tabs[k].setVisibility(k == i ? View.VISIBLE : View.GONE);
            tabItems[k].setSelectedTab(k == i);
        }
        if (i != 2) hideKeyboard();
    }

    private final class TabItem extends View {
        private final int icon; private final String name; private boolean sel;
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        TabItem(Context c, int icon, String name) { super(c); this.icon = icon; this.name = name; setClickable(true); }
        void setSelectedTab(boolean s) { sel = s; invalidate(); }
        @Override protected void onDraw(Canvas c) {
            int col = sel ? Ui.BLUE : 0xFF8E8E93;
            Ui.icon(c, icon, getWidth() / 2f, getHeight() * .38f, dp(7.5f), col);
            p.setColor(col); p.setTextAlign(Paint.Align.CENTER); p.setTypeface(Ui.MEDIUM);
            p.setTextSize(10.5f * getResources().getDisplayMetrics().scaledDensity);
            c.drawText(name, getWidth() / 2f, getHeight() * .84f, p);
        }
    }

    /** Connection indicator. */
    private static final class Dot extends View {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private int color = 0xFF48484A;
        Dot(Context c) { super(c); }
        void set(int c) { if (c != color) { color = c; invalidate(); } }
        @Override protected void onDraw(Canvas c) { p.setColor(color); c.drawCircle(getWidth() / 2f, getHeight() / 2f, getWidth() / 2f, p); }
    }

    // ----------------------------------------------------------------------
    // remote tab
    private View buildRemoteTab() {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.addView(row(0, 6, circle(Ui.BACK, BACK, false), circle(Ui.HOME, HOME, false),
                circle(Ui.INPUT, INPUT, false), circle(Ui.GEAR, SETTINGS, false)));
        Ui.ClickPad pad = new Ui.ClickPad(this);
        pad.key = this::press;
        c.addView(pad, matchWrap(20));
        c.addView(row(0, 20, circle(Ui.REW, REW, false), circle(Ui.PLAY, PLAY, false), circle(Ui.FF, FF, false)));
        Ui.Btn kb = new Ui.Btn(this, Ui.KEYB, null, Ui.CARD, false, () -> { selectTab(2); showKeyboard(); });
        c.addView(row(0, 14, circle(Ui.MUTE, MUTE, false), circle(Ui.MINUS, VOL_DOWN, true),
                circle(Ui.PLUS, VOL_UP, true), kb));
        ScrollView sv = scroll(c);
        sv.setFillViewport(true);
        c.setGravity(Gravity.CENTER_VERTICAL);
        return sv;
    }

    // ----------------------------------------------------------------------
    // apps tab
    private View buildAppsTab() {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.addView(title("Aplikacije"));

        // iOS-style search bar
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackground(round(Ui.CARD, 12));
        bar.setPadding(dp(10), 0, dp(6), 0);
        bar.addView(new Ui.IconView(this, Ui.SEARCH), new LinearLayout.LayoutParams(dp(26), dp(26)));
        searchField = new EditText(this);
        searchField.setHint("Pretraži");
        searchField.setHintTextColor(0xFF636366);
        searchField.setTextColor(Color.WHITE);
        searchField.setTextSize(17);
        searchField.setSingleLine(true);
        searchField.setBackground(null);
        searchField.setPadding(dp(8), dp(12), dp(8), dp(12));
        searchField.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        searchField.setOnEditorActionListener((v, a, e) -> { doSearch(); return true; });
        bar.addView(searchField, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        c.addView(bar);

        HorizontalScrollView hs = new HorizontalScrollView(this);
        hs.setHorizontalScrollBarEnabled(false);
        chipRow = new LinearLayout(this);
        chipRow.setOrientation(LinearLayout.HORIZONTAL);
        hs.addView(chipRow);
        c.addView(hs, matchWrap(12));

        TextView how = text("", 13, Ui.LABEL, Typeface.DEFAULT);
        how.setTag("searchHint");
        how.setPadding(dp(4), dp(10), dp(4), 0);
        how.setLineSpacing(0, 1.15f);
        c.addView(how);

        TextView h = text("Sve aplikacije", 20, Ui.WHITE, Typeface.create("sans-serif", Typeface.BOLD));
        h.setPadding(dp(4), dp(26), 0, dp(2));
        c.addView(h);
        appsGrid = new LinearLayout(this);
        appsGrid.setOrientation(LinearLayout.VERTICAL);
        c.addView(appsGrid);
        TextView tip = text("Dugo drži pločicu koju si sam dodao da je ukloniš.", 12.5f, 0xFF636366, Typeface.DEFAULT);
        tip.setPadding(dp(4), dp(14), 0, 0);
        c.addView(tip);
        renderApps();
        return scroll(c);
    }

    private void renderApps() {
        appsGrid.removeAllViews();
        chipRow.removeAllViews();
        chips.clear();
        int n = apps.size() + 1;
        LinearLayout r = null;
        for (int i = 0; i < n; i++) {
            if (i % 4 == 0) {
                r = new LinearLayout(this);
                r.setOrientation(LinearLayout.HORIZONTAL);
                appsGrid.addView(r, matchWrap(14));
            }
            View t;
            if (i == apps.size()) {
                t = new Ui.Tile(this, "Dodaj", "+", Ui.CARD2, this::addApp);
            } else {
                final Apps.App a = apps.get(i);
                Ui.Tile tile = new Ui.Tile(this, a.name, a.mark, a.color, () -> openApp(a));
                if (isCustom(a)) tile.longAction = () -> removeApp(a);
                t = tile;
            }
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            p.leftMargin = p.rightMargin = dp(5);
            r.addView(t, p);
        }
        while (r != null && r.getChildCount() < 4) r.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1f));

        for (final Apps.App a : apps) {
            final TextView chip = text(a.name, 14, Ui.WHITE, Ui.MEDIUM);
            chip.setPadding(dp(14), dp(8), dp(14), dp(8));
            chip.setTag(a);
            chip.setOnClickListener(v -> { searchApp = a; styleChips(); });
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            p.rightMargin = dp(8);
            chipRow.addView(chip, p);
            chips.add(chip);
        }
        if (!apps.contains(searchApp)) searchApp = apps.get(0);
        styleChips();
    }

    private void styleChips() {
        for (TextView c : chips) {
            boolean sel = c.getTag() == searchApp;
            c.setBackground(round(sel ? Ui.BLUE : Ui.CARD, 18));
            c.setTextColor(sel ? Color.WHITE : 0xFFD1D1D6);
        }
        View hint = tabs[1] == null ? null : tabs[1].findViewWithTag("searchHint");
        if (hint == null && appsGrid != null) hint = ((View) appsGrid.getParent()).findViewWithTag("searchHint");
        if (hint instanceof TextView) {
            ((TextView) hint).setText(searchApp.search.length > 0
                    ? "Rezultati za " + searchApp.name + " otvaraju se izravno na TV-u."
                    : searchApp.name + " se otvori na TV-u. Na TV-u odaberi pretragu (povećalo) — "
                    + "tekst se upiše sam čim se otvori polje za unos.");
        }
    }

    // ----------------------------------------------------------------------
    // keyboard tab
    private View buildKeyboardTab() {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.addView(title("Tipkovnica"));
        TextView d = text("Što upišeš ovdje, odmah se upisuje u odabrano polje na TV-u.", 15, Ui.LABEL, Typeface.DEFAULT);
        d.setPadding(dp(4), 0, 0, dp(14));
        c.addView(d);
        kbField = field("Piši ovdje…");
        kbField.setTextSize(20);
        kbField.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        kbField.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
                | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);
        kbField.setTypeface(Typeface.DEFAULT);
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

        pendingChip = text("", 14, Ui.WHITE, Ui.MEDIUM);
        pendingChip.setBackground(round(0xFF1F3A5F, 12));
        pendingChip.setPadding(dp(14), dp(10), dp(14), dp(10));
        pendingChip.setVisibility(View.GONE);
        pendingChip.setOnClickListener(v -> {
            final String q = pendingQuery;
            if (q == null) return;
            pendingQuery = null;
            suppress = true; kbField.setText(q); kbField.setSelection(q.length()); suppress = false;
            String old = prevText; prevText = q;
            syncText(old, q);
            updatePendingChip();
        });
        c.addView(pendingChip, matchWrap(12));

        Ui.Btn back = new Ui.Btn(this, Ui.BACK, null, Ui.CARD, true, () -> press(BACK));
        Ui.Btn del = new Ui.Btn(this, Ui.NONE, "⌫", Ui.CARD, true, () -> press(DEL));
        del.repeat().textSize(20);
        Ui.Btn enter = new Ui.Btn(this, Ui.SEARCH, "Traži", Ui.BLUE, true, () -> press(ENTER));
        enter.textSize(16);
        LinearLayout r = row(50, 14, back, del, enter);
        ((LinearLayout.LayoutParams) enter.getLayoutParams()).weight = 2f;
        c.addView(r);
        TextView clear = text("Obriši sve", 15, Ui.BLUE, Ui.MEDIUM);
        clear.setPadding(dp(4), dp(16), dp(4), dp(8));
        clear.setOnClickListener(v -> clearAll());
        c.addView(clear);
        return scroll(c);
    }

    private void updatePendingChip() {
        String q = pendingQuery;
        if (q == null) { pendingChip.setVisibility(View.GONE); return; }
        pendingChip.setText("Upiši na TV:  „" + q + "“");
        pendingChip.setVisibility(View.VISIBLE);
    }

    /** Mirrors edits in the phone field onto the TV: appended text, deletions, or a full retype. */
    private void syncText(final String old, final String now) {
        if (now.startsWith(old)) {
            final String add = now.substring(old.length());
            if (!add.isEmpty()) run(() -> tv.text(add), null);
        } else if (old.startsWith(now)) {
            final int n = old.length() - now.length();
            run(() -> { for (int i = 0; i < n; i++) tv.key(DEL); }, null);
        } else {
            final int n = old.length();
            run(() -> { for (int i = 0; i < n; i++) tv.key(DEL); if (!now.isEmpty()) tv.text(now); }, null);
        }
    }

    private void clearAll() {
        final int n = prevText.length();
        suppress = true; kbField.setText(""); prevText = ""; suppress = false;
        if (n > 0) run(() -> { for (int i = 0; i < n; i++) tv.key(DEL); }, null);
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

    // ----------------------------------------------------------------------
    // settings tab
    private View buildSettingsTab() {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.addView(title("Postavke"));

        LinearLayout g1 = group(c, "TIPKOVNICA");
        Switch auto = toggle("Otvori tipkovnicu kad TV traži unos", autoKeyboard, on -> {
            autoKeyboard = on; prefs.edit().putBoolean("autokb", on).apply();
        });
        g1.addView(auto);
        divider(g1);
        Switch ime = toggle("Tipkovnica s mobitela", prefs.getBoolean("ime", true), on -> {
            prefs.edit().putBoolean("ime", on).apply(); tv.setIme(on);
            io.execute(tv::close); connectQuietly();
        });
        g1.addView(ime);
        note(c, "Isključi drugu opciju ako TV zbog nje prikazuje poruku o tipkovnici na mobitelu umjesto svoje tipkovnice.");

        LinearLayout g2 = group(c, "PALJENJE");
        g2.addView(link("MAC adresa TV-a za paljenje", () -> askMac()));
        note(c, "Ugašen TV može se probuditi preko mreže samo ako to podržava. Inače ga upali daljinskim ili preko soundbara (HDMI-CEC).");

        LinearLayout g3 = group(c, "TELEVIZOR");
        g3.addView(link("Ponovno upari", () -> {
            String ip = prefs.getString("ip", "");
            prefs.edit().putBoolean("paired:" + ip, false).apply();
            io.execute(tv::close);
            showSetup();
        }));
        divider(g3);
        g3.addView(link("Promijeni TV", () -> {
            io.execute(tv::close);
            showSetup();
        }));
        TextView ver = text("TV daljinski " + versionName(), 12.5f, 0xFF636366, Typeface.DEFAULT);
        ver.setGravity(Gravity.CENTER);
        ver.setPadding(0, dp(28), 0, 0);
        c.addView(ver);
        return scroll(c);
    }

    private String versionName() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; }
        catch (Exception e) { return ""; }
    }

    private LinearLayout group(LinearLayout parent, String header) {
        TextView h = text(header, 12.5f, Ui.LABEL, Typeface.DEFAULT);
        h.setPadding(dp(16), dp(18), 0, dp(6));
        parent.addView(h);
        LinearLayout g = new LinearLayout(this);
        g.setOrientation(LinearLayout.VERTICAL);
        g.setBackground(round(Ui.CARD, 12));
        parent.addView(g, matchWrap(0));
        return g;
    }

    private void note(LinearLayout parent, String s) {
        TextView t = text(s, 12.5f, Ui.LABEL, Typeface.DEFAULT);
        t.setPadding(dp(16), dp(6), dp(16), 0);
        t.setLineSpacing(0, 1.1f);
        parent.addView(t);
    }

    private void divider(LinearLayout g) {
        View v = new View(this);
        v.setBackgroundColor(0xFF38383A);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1);
        lp.leftMargin = dp(16);
        g.addView(v, lp);
    }

    private interface OnToggle { void set(boolean on); }

    private Switch toggle(String label, boolean value, OnToggle cb) {
        Switch s = new Switch(this);
        s.setText(label);
        s.setTextColor(Ui.WHITE);
        s.setTextSize(16);
        s.setChecked(value);
        s.setPadding(dp(16), dp(14), dp(14), dp(14));
        int[][] states = {{android.R.attr.state_checked}, {}};
        s.setThumbTintList(new android.content.res.ColorStateList(states, new int[]{Color.WHITE, 0xFFE5E5EA}));
        s.setTrackTintList(new android.content.res.ColorStateList(states, new int[]{Ui.GREEN, 0xFF48484A}));
        s.setOnCheckedChangeListener((b, on) -> cb.set(on));
        return s;
    }

    private TextView link(String label, Runnable r) {
        TextView t = text(label, 16, Ui.BLUE, Typeface.DEFAULT);
        t.setPadding(dp(16), dp(15), dp(16), dp(15));
        t.setOnClickListener(v -> r.run());
        return t;
    }

    // ======================================================================
    // messages
    private final Runnable hideBanner = () -> banner.setVisibility(View.GONE);

    private void say(final String s, final boolean error) {
        ui.post(() -> {
            banner.setText(s);
            banner.setTextColor(error ? 0xFFFF6961 : Ui.WHITE);
            banner.setVisibility(View.VISIBLE);
            ui.removeCallbacks(hideBanner);
            ui.postDelayed(hideBanner, error ? 6000 : 3500);
        });
    }

    private static String err(Exception e) {
        Throwable t = e;
        String m = t.getMessage();
        if (m == null || m.isEmpty()) m = t.toString();
        return m;
    }

    // ======================================================================
    // actions
    private interface Job { void run() throws Exception; }

    /** Runs on the I/O thread in order; shows an error if one happens, else the optional success text. */
    private void run(final Job j, final String ok) {
        io.execute(() -> {
            try { j.run(); if (ok != null) say(ok, false); }
            catch (Exception e) { say(err(e), true); }
        });
    }

    private void press(final int code) { run(() -> tv.key(code), null); }

    private void connectQuietly() {
        io.execute(() -> { try { if (!tv.isReady()) tv.connect(prefs.getString("ip", "")); } catch (Exception e) { say(err(e), true); } });
    }

    private void powerTapped() {
        if (tv.isOn()) { run(() -> tv.key(SLEEP), "Gasim TV"); return; }
        wakeUp();
    }

    private void openApp(Apps.App a) {
        List<String> c = new ArrayList<>();
        for (String s : a.launch) c.add(s);
        launch("open:" + a.name, c, "Otvaram " + a.name);
    }

    private void doSearch() {
        final String q = searchField.getText().toString().trim();
        if (q.isEmpty()) { say("Upiši što tražiš", true); return; }
        hideKeyboard();
        final Apps.App a = searchApp;
        List<String> c = new ArrayList<>();
        String enc;
        try { enc = URLEncoder.encode(q, "UTF-8").replace("+", "%20"); } catch (Exception e) { enc = q; }
        for (String t : a.search) c.add(t.replace("%s", enc));
        if (c.isEmpty()) {
            // No search link for this app: open it and type the query when the TV search field opens.
            pendingQuery = q;
            pendingAt = System.currentTimeMillis();
            updatePendingChip();
            for (String s : a.launch) c.add(s);
            launch("open:" + a.name, c, a.name + ": na TV-u otvori pretragu, „" + q + "“ se upiše samo");
        } else {
            launch("search:" + a.name + ":" + q, c, "Tražim „" + q + "“ u " + a.name);
        }
    }

    /**
     * Sends the candidates in order; if the TV reports an error, moves on to the next one.
     * Tapping the same thing again within 10 s starts from the next candidate.
     */
    private void launch(final String key, final List<String> cands, final String msg) {
        launcher.execute(() -> {
            int idx = 0;
            long now = System.currentTimeMillis();
            if (key.equals(lastTapKey) && now - lastTapAt < 10_000) idx = (lastTapIdx + 1) % cands.size();
            for (int tries = 0; tries < cands.size(); tries++) {
                long sent = System.currentTimeMillis();
                try { tv.link(cands.get(idx)); }
                catch (Exception e) { say(err(e), true); return; }
                try { Thread.sleep(1200); } catch (InterruptedException ignored) {}
                if (tv.lastErrorAt <= sent) break;
                idx = (idx + 1) % cands.size();
            }
            lastTapKey = key; lastTapAt = System.currentTimeMillis(); lastTapIdx = idx;
            say(msg, false);
        });
    }

    // ======================================================================
    // network
    /** Home addresses go over Wi-Fi even when Android prefers mobile data; Tailscale (100.x) is left alone. */
    private void bindToWifi(Socket s, String host) throws IOException {
        if (!isLan(host)) return;
        Network n = wifi();
        if (n == null) throw new IOException("Mobitel nije spojen na Wi-Fi. Spoji se na kućnu mrežu (istu kao TV).");
        n.bindSocket(s);
    }

    private Network wifi() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (cm == null) return null;
        for (Network n : cm.getAllNetworks()) {
            NetworkCapabilities c = cm.getNetworkCapabilities(n);
            if (c != null && (c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
                    || c.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET))) return n;
        }
        return null;
    }

    private static boolean isLan(String h) {
        return h.startsWith("192.168.") || h.startsWith("10.") || h.matches("172\\.(1[6-9]|2\\d|3[01])\\..*");
    }

    // ----------------------------------------------------------------------
    // waking a TV that is off
    private void wakeUp() {
        final String mac = prefs.getString("mac", "");
        say("Palim TV…", false);
        launcher.execute(() -> {
            int attempts = mac.isEmpty() ? 1 : 5;
            for (int i = 0; i < attempts; i++) {
                if (!mac.isEmpty()) { try { sendWol(mac); } catch (Exception ignored) {} }
                try { tv.key(WAKE); say("TV je upaljen", false); return; }
                catch (Exception e) {
                    if (i + 1 < attempts) { try { Thread.sleep(2500); } catch (InterruptedException ignored) {} }
                }
            }
            if (mac.isEmpty()) ui.post(this::askMac);
            else say("TV se ne pali preko mreže. Upali ga daljinskim ili preko soundbara (HDMI-CEC).", true);
        });
    }

    private void sendWol(String mac) throws Exception {
        String[] hex = mac.split(":");
        byte[] m = new byte[6];
        for (int i = 0; i < 6; i++) m[i] = (byte) Integer.parseInt(hex[i], 16);
        byte[] pkt = new byte[102];
        for (int i = 0; i < 6; i++) pkt[i] = (byte) 0xFF;
        for (int i = 6; i < 102; i += 6) System.arraycopy(m, 0, pkt, i, 6);
        String ip = prefs.getString("ip", "");
        List<String> targets = new ArrayList<>();
        targets.add("255.255.255.255");
        int dot = ip.lastIndexOf('.');
        if (isLan(ip) && dot > 0) { targets.add(ip.substring(0, dot) + ".255"); targets.add(ip); }
        try (DatagramSocket ds = new DatagramSocket()) {
            ds.setBroadcast(true);
            Network n = wifi();
            if (n != null) n.bindSocket(ds);
            for (String t : targets) for (int port : new int[]{9, 7}) {
                try { ds.send(new DatagramPacket(pkt, pkt.length, InetAddress.getByName(t), port)); }
                catch (IOException ignored) {}
            }
        }
    }

    private void askMac() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(dp(22), dp(8), dp(22), 0);
        final EditText mac = new EditText(this);
        mac.setHint("A1:B2:C3:D4:E5:F6");
        mac.setSingleLine(true);
        mac.setText(prefs.getString("mac", ""));
        mac.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        TextView h = text("Ugašen TV pali se preko mreže samo ako to podržava i ako je ta opcija uključena "
                + "(Postavke → Sustav → Napajanje i energija). Upiši MAC adresu Wi-Fi veze TV-a:\n\n"
                + "• na laptopu: adb shell ip link show wlan0 (iza link/ether)\n"
                + "• ili na TV-u: Postavke → Sustav → O uređaju → Status", 13.5f, 0xFFAEAEB2, Typeface.DEFAULT);
        h.setLineSpacing(0, 1.1f);
        h.setPadding(0, 0, 0, dp(8));
        l.addView(h);
        l.addView(mac);
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Paljenje preko mreže")
                .setView(l)
                .setNegativeButton("Odustani", null)
                .setPositiveButton("Spremi", (d, w) -> {
                    String v = mac.getText().toString().trim().toUpperCase().replace('-', ':');
                    if (v.isEmpty()) { prefs.edit().remove("mac").apply(); return; }
                    if (!v.matches("([0-9A-F]{2}:){5}[0-9A-F]{2}")) { say("Neispravna MAC adresa", true); return; }
                    prefs.edit().putString("mac", v).apply();
                    say("MAC spremljen", false);
                }).show();
    }

    // ======================================================================
    // custom apps
    private static boolean isCustom(Apps.App a) { return a.mark.equals("★"); }

    private void loadApps() {
        apps = Apps.presets();
        for (String line : prefs.getString("custom", "").split("\n")) {
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

    private void addApp() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(dp(22), dp(8), dp(22), 0);
        final EditText name = new EditText(this);
        name.setHint("Naziv");
        name.setSingleLine(true);
        final EditText link = new EditText(this);
        link.setHint("ID paketa ili poveznica");
        link.setSingleLine(true);
        link.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        TextView h = text("ID paketa je u adresi aplikacije na Google Playu (…?id=com.primjer.app).", 13, 0xFFAEAEB2, Typeface.DEFAULT);
        h.setPadding(0, dp(8), 0, 0);
        l.addView(name); l.addView(link); l.addView(h);
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Dodaj aplikaciju").setView(l)
                .setNegativeButton("Odustani", null)
                .setPositiveButton("Dodaj", (d, w) -> {
                    String n = name.getText().toString().trim().replace("|", " ");
                    String k = link.getText().toString().trim();
                    if (n.isEmpty() || k.isEmpty()) return;
                    apps.add(new Apps.App(n, "★", 0xFF636366, new String[]{k}, new String[]{}));
                    saveCustom(); renderApps();
                }).show();
    }

    private void removeApp(final Apps.App a) {
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Ukloniti " + a.name + "?")
                .setNegativeButton("Ne", null)
                .setPositiveButton("Ukloni", (d, w) -> { apps.remove(a); saveCustom(); renderApps(); })
                .show();
    }

    // ======================================================================
    // connect / pair
    private void showMain(String ip) {
        tv.setHost(ip);
        hostLabel.setText(ip);
        setupScreen.setVisibility(View.GONE);
        mainScreen.setVisibility(View.VISIBLE);
        selectTab(0);
        connectQuietly();
    }

    private void startConnect() {
        final String ip = ipField.getText().toString().trim();
        if (!ip.matches("[0-9a-zA-Z.\\-]+")) { toast("Upiši ispravnu IP adresu"); return; }
        hideKeyboard();
        prefs.edit().putString("ip", ip).apply();
        tv.setHost(ip);
        toast("Spajam se…");
        io.execute(() -> {
            if (prefs.getBoolean("paired:" + ip, false)) {
                try { tv.connect(ip); ui.post(() -> showMain(ip)); return; } catch (Exception ignored) {}
            }
            try { tv.pairStart(ip); }
            catch (Exception e) { ui.post(() -> toast(err(e))); return; }
            ui.post(() -> askCode(ip));
        });
    }

    private void toast(String s) { android.widget.Toast.makeText(this, s, android.widget.Toast.LENGTH_LONG).show(); }

    private void askCode(final String ip) {
        final EditText code = new EditText(this);
        code.setHint("A1B2C3");
        code.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        code.setSingleLine(true);
        code.setTextSize(26);
        code.setGravity(Gravity.CENTER);
        code.setLetterSpacing(.15f);
        FrameLayout wrap = new FrameLayout(this);
        wrap.setPadding(dp(22), dp(4), dp(22), 0);
        wrap.addView(code);
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Kod s TV-a")
                .setMessage("Upiši kod od 6 znakova koji se prikazuje na TV-u.")
                .setView(wrap).setCancelable(false)
                .setNegativeButton("Odustani", (d, w) -> io.execute(tv::closePair))
                .setPositiveButton("Upari", (d, w) -> {
                    final String c = code.getText().toString();
                    io.execute(() -> {
                        try {
                            tv.pairFinish(c);
                            prefs.edit().putBoolean("paired:" + ip, true).apply();
                            ui.post(() -> showMain(ip));
                        } catch (Exception e) {
                            ui.post(() -> toast(err(e) + " — pokušaj ponovno"));
                        }
                    });
                }).show();
        code.requestFocus();
    }
}
