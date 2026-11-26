package com.tvremote.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
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
import android.util.Base64;
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

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.Socket;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity implements Tv.Listener {
    static final int UP = 19, DOWN = 20, LEFT = 21, RIGHT = 22, OK = 23, BACK = 4, HOME = 3,
            VOL_UP = 24, VOL_DOWN = 25, MUTE = 164, PLAY = 85, FF = 90, REW = 89,
            POWER = 26, WAKE = 224, SLEEP = 223, INPUT = 178, SETTINGS = 176, DEL = 67, ENTER = 66;
    static final int TAB_REMOTE = 0, TAB_APPS = 1, TAB_KEYBOARD = 2, TAB_SHORTCUTS = 3, TAB_SETTINGS = 4;

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final ExecutorService launcher = Executors.newSingleThreadExecutor();
    private final Handler ui = new Handler(Looper.getMainLooper());
    private Tv tv;
    private SharedPreferences prefs;

    private View setupScreen, mainScreen;
    private EditText ipField;
    private TextView banner, hostLabel;
    private Dot dot;
    private final View[] tabs = new View[5];
    private final TabItem[] tabItems = new TabItem[5];
    private int currentTab;

    // keyboard
    private EditText kbField;
    private TextView pendingChip, modeHelp;
    private final List<TextView> modeButtons = new ArrayList<>();
    private boolean suppress, autoKeyboard;
    private int kbMode;
    private final Typer liveTyper = new Typer();
    /** What we last wrote into the TV field; the next write replaces it completely. */
    private String sentText = "";
    private final Runnable pushText = this::pushTextNow;

    // apps & search
    private EditText searchField;
    private List<Apps.App> apps = new ArrayList<>();
    private Apps.App searchApp;
    private final List<TextView> chips = new ArrayList<>();
    private LinearLayout appsGrid, chipRow;
    private TextView searchHint;
    private volatile String pendingQuery;
    private volatile long pendingAt;

    // shortcuts: recorded steps replayed on the TV
    private static final class Shortcut {
        String name, app, steps;
        Shortcut(String name, String app, String steps) { this.name = name; this.app = app; this.steps = steps; }
    }
    private final List<Shortcut> shortcuts = new ArrayList<>();
    private LinearLayout shortcutList, searchRoutes;
    private String recName, recApp;
    private boolean recording;
    private final StringBuilder recSteps = new StringBuilder();
    private long lastRecordAt;
    private View recordBar;
    private TextView recordText;
    /** A shortcut is being replayed; a tap on the remote stops it. */
    private volatile boolean replaying, cancelReplay;

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
        kbMode = prefs.getInt("kbmode", Typer.AUTO);
        loadApps();
        loadShortcuts();
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
        if (mainScreen.getVisibility() == View.VISIBLE && currentTab != TAB_REMOTE) selectTab(TAB_REMOTE);
        else super.onBackPressed();
    }

    private final Runnable statusTick = new Runnable() {
        public void run() {
            if (dot != null) dot.set(tv.isReady() ? (tv.isOn() ? Ui.GREEN : 0xFFFF9F0A) : 0xFF48484A);
            ui.postDelayed(this, 1000);
        }
    };

    // ======================================================================
    // Tv.Listener: a system-keyboard text field got focus on the TV
    @Override public void textFieldFocused() {
        final String q = pendingQuery;
        if (q != null && System.currentTimeMillis() - pendingAt < 120_000) {
            pendingQuery = null;
            ui.post(() -> {
                resetField("");
                suppress = true; kbField.setText(q); kbField.setSelection(q.length()); suppress = false;
                pushTextNow();
                updatePendingChip();
                say("Upisano na TV: „" + q + "“", false);
            });
            return;
        }
        ui.post(() -> {
            if (mainScreen.getVisibility() != View.VISIBLE) return;
            resetField(tv.fieldText);
            if (!autoKeyboard || recording || replaying) return;
            selectTab(TAB_KEYBOARD);
            showKeyboard();
        });
    }

    // ======================================================================
    // view helpers
    private int dp(float v) { return Ui.dp(this, v); }

    private TextView text(String s, float sp, int color, Typeface tf) {
        TextView t = new TextView(this);
        t.setText(s); t.setTextSize(sp); t.setTextColor(color); t.setTypeface(tf);
        return t;
    }

    private TextView title(String s) {
        TextView t = text(s, 32, Ui.WHITE, Typeface.create("sans-serif", Typeface.BOLD));
        t.setPadding(dp(4), dp(4), 0, dp(10));
        return t;
    }

    private TextView caption(String s) {
        TextView t = text(s, 14.5f, Ui.LABEL, Typeface.DEFAULT);
        t.setPadding(dp(4), 0, dp(4), dp(14));
        t.setLineSpacing(0, 1.12f);
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

    private interface OnPick { void pick(int index); }

    /** iOS-like segmented control. */
    private LinearLayout segmented(String[] labels, int selected, final List<TextView> out, final OnPick onPick) {
        LinearLayout seg = new LinearLayout(this);
        seg.setOrientation(LinearLayout.HORIZONTAL);
        seg.setBackground(round(Ui.CARD, 10));
        seg.setPadding(dp(3), dp(3), dp(3), dp(3));
        out.clear();
        for (int i = 0; i < labels.length; i++) {
            final int idx = i;
            TextView t = text(labels[i], 14, Ui.WHITE, Ui.MEDIUM);
            t.setGravity(Gravity.CENTER);
            t.setPadding(0, dp(8), 0, dp(8));
            t.setOnClickListener(v -> { styleSegmented(out, idx); onPick.pick(idx); });
            seg.addView(t, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            out.add(t);
        }
        styleSegmented(out, selected);
        return seg;
    }

    private void styleSegmented(List<TextView> items, int selected) {
        for (int i = 0; i < items.size(); i++) {
            items.get(i).setBackground(i == selected ? round(0xFF636366, 8) : null);
            items.get(i).setTextColor(i == selected ? Color.WHITE : 0xFFAEAEB2);
        }
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

        FrameLayout body = new FrameLayout(this);
        tabs[TAB_REMOTE] = buildRemoteTab();
        tabs[TAB_APPS] = buildAppsTab();
        tabs[TAB_KEYBOARD] = buildKeyboardTab();
        tabs[TAB_SHORTCUTS] = buildShortcutsTab();
        tabs[TAB_SETTINGS] = buildSettingsTab();
        for (View t : tabs) body.addView(t);

        banner = text("", 13.5f, Ui.WHITE, Ui.MEDIUM);
        banner.setBackground(round(Ui.CARD2, 12));
        banner.setPadding(dp(14), dp(10), dp(14), dp(10));
        banner.setMaxLines(3);
        banner.setEllipsize(TextUtils.TruncateAt.END);
        banner.setVisibility(View.GONE);
        banner.setElevation(dp(6));
        banner.setOnClickListener(v -> banner.setVisibility(View.GONE));
        FrameLayout.LayoutParams bl = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP);
        bl.leftMargin = bl.rightMargin = dp(14); bl.topMargin = dp(2);
        body.addView(banner, bl);

        recordBar = buildRecordBar();
        FrameLayout.LayoutParams rl = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        rl.leftMargin = rl.rightMargin = dp(12); rl.bottomMargin = dp(10);
        body.addView(recordBar, rl);
        col.addView(body, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        View sep = new View(this);
        sep.setBackgroundColor(0xFF2C2C2E);
        col.addView(sep, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1));
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setBackgroundColor(0xFF111113);
        String[] names2 = {"Daljinski", "Aplikacije", "Tipkovnica", "Nauči", "Postavke"};
        int[] icons = {Ui.REMOTE, Ui.APPS, Ui.KEYB, Ui.BOLT, Ui.SLIDERS};
        for (int i = 0; i < tabs.length; i++) {
            final int idx = i;
            tabItems[i] = new TabItem(this, icons[i], names2[i]);
            tabItems[i].setOnClickListener(v -> { selectTab(idx); if (idx == TAB_KEYBOARD) showKeyboard(); });
            bar.addView(tabItems[i], new LinearLayout.LayoutParams(0, dp(60), 1f));
        }
        col.addView(bar);
        selectTab(TAB_REMOTE);
        return col;
    }

    private void selectTab(int i) {
        currentTab = i;
        for (int k = 0; k < tabs.length; k++) {
            tabs[k].setVisibility(k == i ? View.VISIBLE : View.GONE);
            tabItems[k].setSelectedTab(k == i);
        }
        if (i != TAB_KEYBOARD) hideKeyboard();
    }

    private final class TabItem extends View {
        private final int icon; private final String name; private boolean sel;
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        TabItem(Context c, int icon, String name) { super(c); this.icon = icon; this.name = name; setClickable(true); }
        void setSelectedTab(boolean s) { sel = s; invalidate(); }
        @Override protected void onDraw(Canvas c) {
            int col = sel ? Ui.BLUE : 0xFF8E8E93;
            Ui.icon(c, icon, getWidth() / 2f, getHeight() * .38f, dp(7f), col);
            p.setColor(col); p.setTextAlign(Paint.Align.CENTER); p.setTypeface(Ui.MEDIUM);
            p.setTextSize(10f * getResources().getDisplayMetrics().scaledDensity);
            c.drawText(name, getWidth() / 2f, getHeight() * .84f, p);
        }
    }

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
        Ui.Btn kb = new Ui.Btn(this, Ui.KEYB, null, Ui.CARD, false, () -> { selectTab(TAB_KEYBOARD); showKeyboard(); });
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

        searchHint = text("", 13, Ui.LABEL, Typeface.DEFAULT);
        searchHint.setPadding(dp(4), dp(10), dp(4), 0);
        searchHint.setLineSpacing(0, 1.15f);
        c.addView(searchHint);

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

    private static String routeName(Apps.App a) { return a.name + " – do pretrage"; }

    private int typingFor(Apps.App a) { return a.typing; }

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
        if (searchHint == null) return;
        boolean direct = searchApp.search.length > 0;
        if (direct) {
            searchHint.setText("Rezultati za " + searchApp.name + " otvaraju se izravno na TV-u.");
            return;
        }
        Shortcut route = findShortcut(routeName(searchApp));
        searchHint.setText(route != null
                ? "Otvori " + searchApp.name + ", ponovi naučene korake do pretrage i upiše tekst."
                : "Za automatsku pretragu u " + searchApp.name + " jednom pokaži put na kartici Nauči.");
    }

    // ----------------------------------------------------------------------
    // keyboard tab
    private static final String[] MODE_HELP = {
            "Auto: ako TV otvori svoju tipkovnicu (YouTube i većina aplikacija), tekst ide izravno; inače slovo po slovo.",
            "Tekst: za polja koja koriste tipkovnicu televizora (YouTube, Google, Disney+…).",
            "Tipke: šalje svako slovo kao tipku s tipkovnice. Probaj ako Tekst ne radi.",
            "Netflix: sam se kreće po Netflixovoj tipkovnici na ekranu (a–z, 0–9 u 6 stupaca) i pritišće OK. "
                    + "Prije pisanja na TV-u treba biti označeno slovo A."
    };

    private View buildKeyboardTab() {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.addView(title("Tipkovnica"));
        c.addView(caption("Što upišeš ovdje, odmah se upisuje u odabrano polje na TV-u."));
        c.addView(segmented(Typer.NAMES, kbMode, modeButtons, idx -> {
            kbMode = idx;
            prefs.edit().putInt("kbmode", idx).apply();
            liveTyper.resetGrid();
            modeHelp.setText(MODE_HELP[idx]);
        }));
        modeHelp = text(MODE_HELP[kbMode], 13, Ui.LABEL, Typeface.DEFAULT);
        modeHelp.setPadding(dp(4), dp(8), dp(4), dp(12));
        modeHelp.setLineSpacing(0, 1.12f);
        c.addView(modeHelp);

        kbField = field("Piši ovdje…");
        kbField.setTextSize(20);
        kbField.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        kbField.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
                | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);
        kbField.setTypeface(Typeface.DEFAULT);
        kbField.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int a, int b, int c2) {}
            public void onTextChanged(CharSequence s, int a, int b, int c2) {}
            public void afterTextChanged(Editable e) { if (!suppress) textChanged(); }
        });
        kbField.setOnEditorActionListener((v, a, e) -> { pushTextNow(); press(ENTER); return true; });
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
            pushTextNow();
            updatePendingChip();
        });
        c.addView(pendingChip, matchWrap(12));

        Ui.Btn back = new Ui.Btn(this, Ui.BACK, null, Ui.CARD, true, () -> press(BACK));
        Ui.Btn del = new Ui.Btn(this, Ui.NONE, "⌫", Ui.CARD, true, this::deleteOne);
        del.textSize(20);
        Ui.Btn enter = new Ui.Btn(this, Ui.SEARCH, "Traži", Ui.BLUE, true, () -> { pushTextNow(); press(ENTER); });
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

    private Typer.Sink sink() {
        return new Typer.Sink() {
            public void key(int code) throws Exception { if (replaying && cancelReplay) throw new InterruptedException("stopped"); tv.key(code); }
            public void text(String s) throws Exception { tv.text(s); }
            public void pause(long ms) throws Exception { if (replaying) nap(ms); else Thread.sleep(ms); }
        };
    }

    /** Called while typing: after a short pause the TV field is replaced with the phone text. */
    private void textChanged() {
        ui.removeCallbacks(pushText);
        ui.postDelayed(pushText, kbMode == Typer.GRID ? 800 : 450);
    }

    private void pushTextNow() {
        final String target = kbField.getText().toString();
        if (target.equals(sentText)) return;
        final int mode = Typer.resolve(kbMode, tv.lastImeAt);
        final int onTv = Math.max(sentText.length(), mode == Typer.TEXT ? tv.fieldText.length() : 0);
        sentText = target;
        record("t" + mode + ":" + b64(target));
        run(() -> liveTyper.replace(mode, onTv, target, sink()), null);
    }

    private void deleteOne() {
        String now = kbField.getText().toString();
        if (now.isEmpty()) { press(DEL); return; }
        kbField.setText(now.substring(0, now.length() - 1));
        kbField.setSelection(kbField.length());
    }

    private void clearAll() {
        suppress = true; kbField.setText(""); suppress = false;
        pushTextNow();
        liveTyper.resetGrid();
    }

    /** Starts a fresh field (the TV opened a new one): nothing of ours is in it yet. */
    private void resetField(String text) {
        ui.removeCallbacks(pushText);
        suppress = true; kbField.setText(text); kbField.setSelection(text.length()); suppress = false;
        sentText = text;
        liveTyper.resetGrid();
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
    // shortcuts tab
    private View buildShortcutsTab() {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.addView(title("Nauči"));
        c.addView(caption("Jednom pokaži korake na TV-u, a mobitel ih poslije ponavlja sam."));

        TextView h1 = text("PRETRAGA U APLIKACIJI", 12.5f, Ui.LABEL, Typeface.DEFAULT);
        h1.setPadding(dp(16), dp(6), 0, dp(6));
        c.addView(h1);
        searchRoutes = new LinearLayout(this);
        searchRoutes.setOrientation(LinearLayout.VERTICAL);
        c.addView(searchRoutes);
        note(c, "Nauči: otvori se aplikacija, ti na kartici Daljinski odabereš profil i dođeš do pretrage, pa Gotovo. "
                + "Poslije na kartici Aplikacije samo upišeš što tražiš.");

        TextView h2 = text("MOJI KORACI", 12.5f, Ui.LABEL, Typeface.DEFAULT);
        h2.setPadding(dp(16), dp(22), 0, dp(6));
        c.addView(h2);
        shortcutList = new LinearLayout(this);
        shortcutList.setOrientation(LinearLayout.VERTICAL);
        c.addView(shortcutList);
        Ui.Btn add = new Ui.Btn(this, Ui.PLUS, "Nauči nove korake", Ui.BLUE, true, this::newShortcut);
        add.textSize(16);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(50));
        lp.topMargin = dp(12);
        c.addView(add, lp);
        note(c, "Npr. PIN za Disney+ ili odabir profila. Dodir pokreće, dugi pritisak: nauči ponovno ili obriši.");
        renderShortcuts();
        return scroll(c);
    }

    private void renderShortcuts() {
        if (shortcutList == null) return;
        renderSearchRoutes();
        shortcutList.removeAllViews();
        List<Shortcut> own = new ArrayList<>();
        for (Shortcut x : shortcuts) if (!x.name.endsWith(" – do pretrage")) own.add(x);
        if (own.isEmpty()) {
            TextView e = text("Još ništa naučeno.", 15, 0xFF636366, Typeface.DEFAULT);
            e.setGravity(Gravity.CENTER);
            e.setPadding(0, dp(24), 0, dp(24));
            e.setBackground(round(Ui.CARD, 12));
            shortcutList.addView(e, matchWrap(0));
            return;
        }
        LinearLayout g = new LinearLayout(this);
        g.setOrientation(LinearLayout.VERTICAL);
        g.setBackground(round(Ui.CARD, 12));
        for (int i = 0; i < own.size(); i++) {
            final Shortcut s = own.get(i);
            if (i > 0) {
                View d = new View(this);
                d.setBackgroundColor(0xFF38383A);
                LinearLayout.LayoutParams dl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1);
                dl.leftMargin = dp(16);
                g.addView(d, dl);
            }
            LinearLayout rowV = new LinearLayout(this);
            rowV.setOrientation(LinearLayout.HORIZONTAL);
            rowV.setGravity(Gravity.CENTER_VERTICAL);
            rowV.setPadding(dp(16), dp(10), dp(10), dp(10));
            LinearLayout txt = new LinearLayout(this);
            txt.setOrientation(LinearLayout.VERTICAL);
            txt.addView(text(s.name, 16, Ui.WHITE, Typeface.DEFAULT));
            txt.addView(text((s.app != null ? "Otvori " + s.app + " · " : "") + countSteps(s.steps) + " koraka",
                    12.5f, Ui.LABEL, Typeface.DEFAULT));
            rowV.addView(txt, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            Ui.Btn play = new Ui.Btn(this, Ui.PLAY, null, Ui.CARD2, false, () -> runShortcut(s, null));
            play.maxDiameterDp = 40;
            rowV.addView(play, new LinearLayout.LayoutParams(dp(40), dp(40)));
            rowV.setOnClickListener(v -> runShortcut(s, null));
            rowV.setOnLongClickListener(v -> { shortcutMenu(s); return true; });
            g.addView(rowV);
        }
        shortcutList.addView(g, matchWrap(0));
    }

    /** One row per app without a direct search link: learned or not, with Nauči / Obriši. */
    private void renderSearchRoutes() {
        searchRoutes.removeAllViews();
        LinearLayout g = new LinearLayout(this);
        g.setOrientation(LinearLayout.VERTICAL);
        g.setBackground(round(Ui.CARD, 12));
        boolean firstRow = true;
        for (final Apps.App a : apps) {
            if (a.search.length > 0) continue;
            if (!firstRow) {
                View d = new View(this);
                d.setBackgroundColor(0xFF38383A);
                LinearLayout.LayoutParams dl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1);
                dl.leftMargin = dp(16);
                g.addView(d, dl);
            }
            firstRow = false;
            final Shortcut route = findShortcut(routeName(a));
            LinearLayout r = new LinearLayout(this);
            r.setOrientation(LinearLayout.HORIZONTAL);
            r.setGravity(Gravity.CENTER_VERTICAL);
            r.setPadding(dp(16), dp(8), dp(8), dp(8));
            LinearLayout txt = new LinearLayout(this);
            txt.setOrientation(LinearLayout.VERTICAL);
            txt.addView(text(a.name, 16, Ui.WHITE, Typeface.DEFAULT));
            txt.addView(text(route != null ? "Naučeno ✓" : "Nije naučeno", 12.5f, route != null ? Ui.GREEN : Ui.LABEL, Typeface.DEFAULT));
            r.addView(txt, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            if (route != null) {
                TextView del = text("Obriši", 15, Ui.RED, Typeface.DEFAULT);
                del.setPadding(dp(10), dp(10), dp(12), dp(10));
                del.setOnClickListener(v -> { shortcuts.remove(route); saveShortcuts(); renderShortcuts(); styleChips(); });
                r.addView(del);
            }
            Ui.Btn learn = new Ui.Btn(this, Ui.NONE, route != null ? "Ponovno" : "Nauči", route != null ? Ui.CARD2 : Ui.BLUE, true,
                    () -> startRecording(routeName(a), a.name, true));
            learn.textSize(14);
            r.addView(learn, new LinearLayout.LayoutParams(dp(92), dp(38)));
            g.addView(r);
        }
        searchRoutes.addView(g, matchWrap(0));
    }

    private void shortcutMenu(final Shortcut s) {
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(s.name)
                .setItems(new String[]{"Pokreni", "Nauči ponovno", "Obriši"}, (d, w) -> {
                    if (w == 0) runShortcut(s, null);
                    else if (w == 1) startRecording(s.name, s.app, s.name.endsWith(" – do pretrage"));
                    else { shortcuts.remove(s); saveShortcuts(); renderShortcuts(); styleChips(); }
                }).show();
    }

    private void newShortcut() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(dp(22), dp(8), dp(22), 0);
        final EditText name = new EditText(this);
        name.setHint("Ime, npr. Disney+ PIN");
        name.setSingleLine(true);
        l.addView(name);
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Nauči nove korake").setView(l)
                .setNegativeButton("Odustani", null)
                .setPositiveButton("Dalje", (d, w) -> {
                    final String n = name.getText().toString().trim();
                    if (n.isEmpty()) return;
                    final String[] items = new String[apps.size() + 1];
                    items[0] = "Ne otvaraj aplikaciju";
                    for (int i = 0; i < apps.size(); i++) items[i + 1] = "Otvori " + apps.get(i).name;
                    new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                            .setTitle("Na početku")
                            .setItems(items, (d2, w2) -> startRecording(n, w2 == 0 ? null : apps.get(w2 - 1).name, false))
                            .show();
                }).show();
    }

    private static int countSteps(String steps) {
        int n = 0;
        for (String t : steps.trim().split("\\s+")) if (!t.isEmpty() && t.charAt(0) != 'w') n++;
        return n;
    }

    private Shortcut findShortcut(String name) {
        for (Shortcut s : shortcuts) if (s.name.equals(name)) return s;
        return null;
    }

    // recording
    private View buildRecordBar() {
        LinearLayout b = new LinearLayout(this);
        b.setOrientation(LinearLayout.VERTICAL);
        b.setBackground(round(0xFF3A1D1D, 16));
        b.setPadding(dp(16), dp(12), dp(16), dp(12));
        b.setElevation(dp(8));
        recordText = text("", 14, Ui.WHITE, Ui.MEDIUM);
        recordText.setLineSpacing(0, 1.1f);
        b.addView(recordText);
        Ui.Btn cancel = new Ui.Btn(this, Ui.NONE, "Odustani", Ui.CARD2, true, () -> stopRecording(false));
        cancel.textSize(15);
        Ui.Btn done = new Ui.Btn(this, Ui.NONE, "Gotovo", Ui.BLUE, true, () -> stopRecording(true));
        done.textSize(15);
        b.addView(row(42, 10, cancel, done));
        b.setVisibility(View.GONE);
        return b;
    }

    private void startRecording(String name, String app, boolean route) {
        recName = name;
        recApp = app;
        recording = true;
        recSteps.setLength(0);
        resetField("");
        recordText.setText("● Učim „" + name + "“. "
                + (route ? "Pričekaj da se aplikacija otvori, pa ovdje odaberi profil i dođi do polja za pretragu (tekst ne upisuj, pločicu aplikacije ne diraj). "
                : "Napravi korake na kartici Daljinski ili Tipkovnica. ")
                + "Zatim pritisni Gotovo.");
        recordBar.setVisibility(View.VISIBLE);
        padTabsForBar(true);
        selectTab(TAB_REMOTE);
        lastRecordAt = System.currentTimeMillis();
        final Apps.App a = appByName(app);
        if (a != null) launcher.execute(() -> {
            try { tv.key(HOME); Thread.sleep(1500); } catch (Exception ignored) {}
            if (openSync(a)) ui.post(() -> lastRecordAt = System.currentTimeMillis());
        });
    }

    private void stopRecording(boolean save) {
        recording = false;
        recordBar.setVisibility(View.GONE);
        padTabsForBar(false);
        if (save && recSteps.length() > 0) {
            Shortcut old = findShortcut(recName);
            String steps = recSteps.toString().trim() + " w1200";
            if (old != null) { old.steps = steps; old.app = recApp; }
            else shortcuts.add(new Shortcut(recName, recApp, steps));
            saveShortcuts();
            renderShortcuts();
            say("Naučeno: „" + recName + "“", false);
        } else if (save) {
            say("Nije snimljen nijedan korak", true);
        }
        styleChips();
    }

    private void padTabsForBar(boolean on) {
        for (View t : tabs) {
            View c = ((ScrollView) t).getChildAt(0);
            c.setPadding(c.getPaddingLeft(), c.getPaddingTop(), c.getPaddingRight(), dp(on ? 190 : 28));
        }
    }

    /** Appends one step with the pause before it. */
    private void record(String token) {
        if (!recording) return;
        long now = System.currentTimeMillis();
        long gap = Math.max(250, Math.min(15_000, now - lastRecordAt));
        recSteps.append('w').append(gap).append(' ').append(token).append(' ');
        lastRecordAt = now;
    }

    private static String b64(String s) {
        return Base64.encodeToString(s.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP | Base64.URL_SAFE);
    }

    private static String unb64(String s) {
        return new String(Base64.decode(s, Base64.NO_WRAP | Base64.URL_SAFE), StandardCharsets.UTF_8);
    }

    /**
     * Replays a shortcut: opens its app, then its steps. With a query, types it afterwards
     * in the app's typing mode (used by search).
     */
    private void runShortcut(final Shortcut s, final String query) {
        if (recording) { say("Prvo završi učenje (Gotovo)", true); return; }
        if (replaying) { say("Već radim — dodirni bilo koju tipku daljinskog da zaustaviš", true); return; }
        replaying = true;
        cancelReplay = false;
        pendingQuery = null;
        updatePendingChip();
        say("Ponavljam „" + s.name + "“ … dodir na daljinski zaustavlja", false);
        final float speed = replaySpeed();
        launcher.execute(() -> {
            try {
                Apps.App a = appByName(s.app);
                if (a != null) {
                    tv.key(HOME);              // same starting point as when it was learned
                    nap((long) (1500 * speed));
                    if (!openSync(a)) return;
                }
                Typer typer = new Typer();
                final int[] lastTyped = {0};
                for (String t : s.steps.trim().split("\\s+")) {
                    if (t.isEmpty()) continue;
                    if (cancelReplay) throw new InterruptedException("stopped");
                    char k = t.charAt(0);
                    String rest = t.substring(1);
                    if (k == 'w') nap((long) (Long.parseLong(rest) * speed));
                    else if (k == 'k') { tv.key(Integer.parseInt(rest)); nap(150); }
                    else if (k == 'a') { int c = rest.indexOf(':'); typer.append(Integer.parseInt(rest.substring(0, c)), unb64(rest.substring(c + 1)), sink()); }
                    else if (k == 'd') { int c = rest.indexOf(':'); typer.delete(Integer.parseInt(rest.substring(0, c)), Integer.parseInt(rest.substring(c + 1)), sink()); }
                    else if (k == 'o') { Apps.App o = appByName(unb64(rest)); if (o != null) openSync(o); }
                    else if (k == 't') {
                        int c = rest.indexOf(':');
                        String txt = unb64(rest.substring(c + 1));
                        typer.replace(Integer.parseInt(rest.substring(0, c)), lastTyped[0], txt, sink());
                        lastTyped[0] = txt.length();
                    }
                }
                if (query != null) {
                    Apps.App app = a != null ? a : searchApp;
                    int mode = Typer.resolve(typingFor(app), tv.lastImeAt);
                    int onTv = mode == Typer.TEXT ? tv.fieldText.length() : 0;
                    typer.replace(mode, onTv, query, sink());
                    if (mode == Typer.TEXT) tv.key(ENTER);
                    say("Upisano „" + query + "“ u " + app.name, false);
                } else {
                    say("Gotovo: „" + s.name + "“", false);
                }
            } catch (InterruptedException e) {
                say("Zaustavljeno", true);
            } catch (Exception e) {
                say(err(e), true);
            } finally {
                replaying = false;
                cancelReplay = false;
            }
        });
    }

    // ----------------------------------------------------------------------
    // settings tab
    private View buildSettingsTab() {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.addView(title("Postavke"));

        LinearLayout g1 = group(c, "TIPKOVNICA");
        g1.addView(toggle("Otvori tipkovnicu kad TV traži unos", autoKeyboard, on -> {
            autoKeyboard = on; prefs.edit().putBoolean("autokb", on).apply();
        }));
        divider(g1);
        g1.addView(toggle("Tipkovnica s mobitela", prefs.getBoolean("ime", true), on -> {
            prefs.edit().putBoolean("ime", on).apply(); tv.setIme(on);
            io.execute(tv::close); connectQuietly();
        }));
        note(c, "Isključi drugu opciju ako TV zbog nje prikazuje poruku o tipkovnici na mobitelu umjesto svoje tipkovnice.");

        LinearLayout gs = group(c, "NAUČI");
        TextView sl = text("Brzina ponavljanja", 16, Ui.WHITE, Typeface.DEFAULT);
        sl.setPadding(dp(16), dp(14), dp(16), dp(8));
        gs.addView(sl);
        final float[] speeds = {1f, 1.5f, 2f};
        int cur = 0;
        for (int i = 0; i < speeds.length; i++) if (Math.abs(speeds[i] - replaySpeed()) < .01f) cur = i;
        LinearLayout seg = segmented(new String[]{"Normalno", "Sporije", "Najsporije"}, cur, new ArrayList<>(),
                idx -> prefs.edit().putFloat("replaySpeed", speeds[idx]).apply());
        LinearLayout.LayoutParams sp = matchWrap(0);
        sp.leftMargin = sp.rightMargin = dp(12); sp.bottomMargin = dp(12);
        gs.addView(seg, sp);
        note(c, "Ako naučeni koraci odu krivim putem jer se aplikacija na TV-u sporo otvara, odaberi Sporije.");

        LinearLayout g2 = group(c, "PALJENJE");
        g2.addView(link("MAC adresa TV-a za paljenje", this::askMac));
        note(c, "Ugašen TV može se probuditi preko mreže samo ako to podržava. Inače ga upali daljinskim ili preko soundbara (HDMI-CEC).");

        LinearLayout g3 = group(c, "TELEVIZOR");
        g3.addView(link("Ponovno upari", () -> {
            String ip = prefs.getString("ip", "");
            prefs.edit().putBoolean("paired:" + ip, false).apply();
            io.execute(tv::close);
            showSetup();
        }));
        divider(g3);
        g3.addView(link("Promijeni TV", () -> { io.execute(tv::close); showSetup(); }));
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
        s.setThumbTintList(new ColorStateList(states, new int[]{Color.WHITE, 0xFFE5E5EA}));
        s.setTrackTintList(new ColorStateList(states, new int[]{Ui.GREEN, 0xFF48484A}));
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
            ui.postDelayed(hideBanner, error ? 6000 : 4500);
        });
    }

    private static String err(Exception e) {
        String m = e.getMessage();
        return m == null || m.isEmpty() ? e.toString() : m;
    }

    // ======================================================================
    // actions
    private interface Job { void run() throws Exception; }

    private void run(final Job j, final String ok) {
        io.execute(() -> {
            try { j.run(); if (ok != null) say(ok, false); }
            catch (Exception e) { say(err(e), true); }
        });
    }

    private void press(final int code) {
        if (replaying) { cancelReplay = true; say("Zaustavljeno", true); return; }
        record("k" + code);
        run(() -> tv.key(code), null);
    }

    /** Sleeps in small steps so a replay can be stopped; waits are stretched by the speed setting. */
    private void nap(long ms) throws InterruptedException {
        long end = System.currentTimeMillis() + ms;
        while (System.currentTimeMillis() < end) {
            if (cancelReplay) throw new InterruptedException("stopped");
            Thread.sleep(Math.min(100, Math.max(1, end - System.currentTimeMillis())));
        }
    }

    private float replaySpeed() { return prefs.getFloat("replaySpeed", 1f); }

    private void connectQuietly() {
        io.execute(() -> { try { if (!tv.isReady()) tv.connect(prefs.getString("ip", "")); } catch (Exception e) { say(err(e), true); } });
    }

    private void powerTapped() {
        if (tv.isOn()) { run(() -> tv.key(SLEEP), "Gasim TV"); return; }
        wakeUp();
    }

    private void openApp(final Apps.App a) {
        if (recording && a.name.equals(recApp)) { say(a.name + " je već otvoren za snimanje", false); return; }
        record("o" + b64(a.name));
        say("Otvaram " + a.name, false);
        launcher.execute(() -> openSync(a));
    }

    private void doSearch() {
        final String q = searchField.getText().toString().trim();
        if (q.isEmpty()) { say("Upiši što tražiš", true); return; }
        hideKeyboard();
        final Apps.App a = searchApp;
        if (a.search.length > 0) {
            String enc;
            try { enc = URLEncoder.encode(q, "UTF-8").replace("+", "%20"); } catch (Exception e) { enc = q; }
            List<String> c = new ArrayList<>();
            for (String t : a.search) c.add(t.replace("%s", enc));
            launch(c, "Tražim „" + q + "“ u " + a.name);
            return;
        }
        Shortcut route = findShortcut(routeName(a));
        if (route != null) {
            runShortcut(new Shortcut(route.name, route.app != null ? route.app : a.name, route.steps), q);
            return;
        }
        // Not learned yet: open the app and type as soon as a system-keyboard field gets focus.
        pendingQuery = q;
        pendingAt = System.currentTimeMillis();
        updatePendingChip();
        say(a.name + " je otvoren. Pritisni Nauči da pretraga ide sama do kraja.", false);
        launcher.execute(() -> openSync(a));
    }

    /** Opens the app; returns false if every way of opening it failed. */
    private boolean openSync(Apps.App a) {
        int first = Math.max(0, Math.min(a.launch.length - 1, prefs.getInt("link:" + a.name, 0)));
        for (int i = 0; i < a.launch.length; i++) {
            int idx = (first + i) % a.launch.length;
            long sent = System.currentTimeMillis();
            try { tv.link(a.launch[idx]); } catch (Exception e) { say(err(e), true); return false; }
            try { Thread.sleep(1200); } catch (InterruptedException ignored) {}
            if (tv.lastErrorAt <= sent) {
                if (idx != first) prefs.edit().putInt("link:" + a.name, idx).apply();
                return true;
            }
        }
        say(a.name + " se ne otvara. Je li instaliran na TV-u?", true);
        return false;
    }

    /** Sends links in order until the TV accepts one. */
    private void launch(final List<String> cands, final String msg) {
        launcher.execute(() -> {
            for (String link : cands) {
                long sent = System.currentTimeMillis();
                try { tv.link(link); }
                catch (Exception e) { say(err(e), true); return; }
                try { Thread.sleep(1200); } catch (InterruptedException ignored) {}
                if (tv.lastErrorAt <= sent) { say(msg, false); return; }
            }
            say("TV nije prihvatio poveznicu", true);
        });
    }

    // ======================================================================
    // network
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
    // persistence
    private static boolean isCustom(Apps.App a) { return a.mark.equals("★"); }

    private Apps.App appByName(String name) {
        if (name == null) return null;
        for (Apps.App a : apps) if (a.name.equals(name)) return a;
        return null;
    }

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

    private void loadShortcuts() {
        shortcuts.clear();
        try {
            JSONArray arr = new JSONArray(prefs.getString("shortcuts", "[]"));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                String app = o.isNull("app") ? null : o.getString("app");
                shortcuts.add(new Shortcut(o.getString("name"), app, o.getString("steps")));
            }
        } catch (Exception ignored) {}
    }

    private void saveShortcuts() {
        JSONArray arr = new JSONArray();
        try {
            for (Shortcut s : shortcuts) {
                JSONObject o = new JSONObject();
                o.put("name", s.name);
                o.put("app", s.app == null ? JSONObject.NULL : s.app);
                o.put("steps", s.steps);
                arr.put(o);
            }
        } catch (Exception ignored) {}
        prefs.edit().putString("shortcuts", arr.toString()).apply();
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
                    if (n.isEmpty() || k.isEmpty() || appByName(n) != null) return;
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
        selectTab(TAB_REMOTE);
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
