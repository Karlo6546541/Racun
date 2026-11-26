package com.tvremote.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.net.URLEncoder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    // Android key codes
    static final int UP = 19, DOWN = 20, LEFT = 21, RIGHT = 22, OK = 23, BACK = 4, HOME = 3, MENU = 82,
            VOL_UP = 24, VOL_DOWN = 25, MUTE = 164, PLAY = 85, NEXT = 87, PREV = 88, FF = 90, REW = 89,
            POWER = 26, WAKE = 224, SLEEP = 223, INPUT = 178, SETTINGS = 176, DEL = 67;

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler ui = new Handler(Looper.getMainLooper());
    private Tv tv;
    private SharedPreferences prefs;
    private TextView status;
    private LinearLayout setupPanel, remotePanel;
    private EditText ipField;
    private final int BG = Color.BLACK, BTN = 0xFF1C1C1E, BTN_ON = 0xFF2C5CFF;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        tv = new Tv(getFilesDir());
        prefs = getSharedPreferences("tv", MODE_PRIVATE);
        buildUi();
        String ip = prefs.getString("ip", "");
        ipField.setText(ip);
        if (!ip.isEmpty() && prefs.getBoolean("paired:" + ip, false)) showRemote(ip, false);
    }

    @Override protected void onStop() { super.onStop(); io.execute(tv::close); }

    // ---------- UI ----------
    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density); }

    private Button btn(String label, boolean accent) {
        Button x = new Button(this);
        x.setText(label); x.setAllCaps(false); x.setTextColor(Color.WHITE); x.setTextSize(17);
        GradientDrawable g = new GradientDrawable();
        g.setColor(accent ? BTN_ON : BTN); g.setCornerRadius(dp(14));
        x.setBackground(g);
        x.setPadding(0, dp(14), 0, dp(14));
        return x;
    }

    private LinearLayout row(View... views) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(8);
        r.setLayoutParams(lp);
        for (View v : views) {
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            p.leftMargin = dp(4); p.rightMargin = dp(4);
            v.setLayoutParams(p);
            r.addView(v);
        }
        return r;
    }

    private TextView label(String s) {
        TextView t = new TextView(this);
        t.setText(s); t.setTextColor(0xFF888888); t.setTextSize(13);
        t.setPadding(dp(4), dp(16), 0, 0);
        return t;
    }

    private EditText input(String hint) {
        EditText e = new EditText(this);
        e.setHint(hint); e.setHintTextColor(0xFF666666); e.setTextColor(Color.WHITE);
        e.setSingleLine(true);
        GradientDrawable g = new GradientDrawable();
        g.setColor(BTN); g.setCornerRadius(dp(12));
        e.setBackground(g);
        e.setPadding(dp(14), dp(12), dp(14), dp(12));
        return e;
    }

    private View keyBtn(String label, final int code, boolean repeat, boolean accent) {
        final Button x = btn(label, accent);
        if (!repeat) { x.setOnClickListener(v -> press(code, v)); return x; }
        final Runnable[] loop = new Runnable[1];
        loop[0] = () -> { press(code, x); ui.postDelayed(loop[0], 150); };
        x.setOnTouchListener((v, e) -> {
            switch (e.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    press(code, v); ui.postDelayed(loop[0], 450); v.setPressed(true); return true;
                case MotionEvent.ACTION_UP: case MotionEvent.ACTION_CANCEL:
                    ui.removeCallbacks(loop[0]); v.setPressed(false); return true;
            }
            return true;
        });
        return x;
    }

    private void buildUi() {
        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(BG);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(14), dp(24), dp(14), dp(40));
        sv.addView(root);

        status = new TextView(this);
        status.setTextColor(0xFF888888); status.setTextSize(13); status.setGravity(Gravity.CENTER);
        root.addView(status);

        // setup
        setupPanel = new LinearLayout(this);
        setupPanel.setOrientation(LinearLayout.VERTICAL);
        TextView title = new TextView(this);
        title.setText("TV daljinski"); title.setTextColor(Color.WHITE); title.setTextSize(26);
        title.setTypeface(Typeface.DEFAULT_BOLD); title.setPadding(0, dp(24), 0, dp(8));
        setupPanel.addView(title);
        TextView help = new TextView(this);
        help.setText("Upiši IP adresu TV-a (Postavke → Mreža, npr. 192.168.0.177) i pritisni Poveži. "
                + "Na TV-u će se pojaviti kod od 6 znakova koji upišeš ovdje. "
                + "Mobitel mora biti na istoj Wi-Fi mreži kao TV (ili spojen preko Tailscalea).");
        help.setTextColor(0xFFAAAAAA); help.setPadding(0, 0, 0, dp(12));
        setupPanel.addView(help);
        ipField = input("IP adresa TV-a");
        ipField.setInputType(InputType.TYPE_CLASS_PHONE);
        setupPanel.addView(ipField);
        Button connect = btn("Poveži i upari", true);
        connect.setOnClickListener(v -> startConnect());
        setupPanel.addView(row(connect));
        root.addView(setupPanel);

        // remote
        remotePanel = new LinearLayout(this);
        remotePanel.setOrientation(LinearLayout.VERTICAL);
        remotePanel.setVisibility(View.GONE);

        remotePanel.addView(row(keyBtn("⏻ Upali", WAKE, false, true), keyBtn("Ugasi", SLEEP, false, false), keyBtn("⏻", POWER, false, false)));
        remotePanel.addView(row(linkBtn("YouTube", "https://www.youtube.com"), linkBtn("YT Music", "https://music.youtube.com"),
                linkBtn("Netflix", "https://www.netflix.com"), linkBtn("Prime", "https://app.primevideo.com")));
        remotePanel.addView(label("YouTube pretraga"));
        final EditText yq = input("npr. ime pjesme");
        yq.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        Button yb = btn("Traži", true);
        Runnable doSearch = () -> {
            String q = yq.getText().toString().trim();
            if (q.isEmpty()) return;
            try { run(() -> tv.link("https://www.youtube.com/results?search_query=" + URLEncoder.encode(q, "UTF-8"))); }
            catch (Exception ignored) {}
        };
        yb.setOnClickListener(v -> doSearch.run());
        yq.setOnEditorActionListener((v, a, e) -> { doSearch.run(); return true; });
        LinearLayout sr = new LinearLayout(this);
        sr.setOrientation(LinearLayout.HORIZONTAL);
        sr.addView(yq, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(dp(90), ViewGroup.LayoutParams.WRAP_CONTENT);
        bp.leftMargin = dp(8);
        sr.addView(yb, bp);
        remotePanel.addView(sr);

        remotePanel.addView(touchpad());
        remotePanel.addView(row(new View(this), keyBtn("▲", UP, true, false), new View(this)));
        remotePanel.addView(row(keyBtn("◀", LEFT, true, false), keyBtn("OK", OK, false, true), keyBtn("▶", RIGHT, true, false)));
        remotePanel.addView(row(new View(this), keyBtn("▼", DOWN, true, false), new View(this)));
        remotePanel.addView(row(keyBtn("⮌ Natrag", BACK, false, false), keyBtn("⌂ Home", HOME, false, false), keyBtn("☰", MENU, false, false)));
        remotePanel.addView(row(keyBtn("⏪", REW, false, false), keyBtn("⏯", PLAY, false, false), keyBtn("⏩", FF, false, false), keyBtn("🔇", MUTE, false, false)));
        remotePanel.addView(row(keyBtn("Vol −", VOL_DOWN, true, false), keyBtn("Vol +", VOL_UP, true, false), keyBtn("⏮", PREV, false, false), keyBtn("⏭", NEXT, false, false)));
        remotePanel.addView(row(keyBtn("Input", INPUT, false, false), keyBtn("⚙", SETTINGS, false, false)));

        remotePanel.addView(label("Tipkovnica na TV-u"));
        final EditText tx = input("upiši tekst u polje na TV-u");
        Button tb = btn("Šalji", false), del = btn("⌫", false);
        tb.setOnClickListener(v -> {
            final String s = tx.getText().toString();
            if (s.isEmpty()) return;
            run(() -> tv.text(s));
            tx.setText("");
        });
        del.setOnClickListener(v -> press(DEL, v));
        LinearLayout tr = new LinearLayout(this);
        tr.setOrientation(LinearLayout.HORIZONTAL);
        tr.addView(tx, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        LinearLayout.LayoutParams p1 = new LinearLayout.LayoutParams(dp(80), ViewGroup.LayoutParams.WRAP_CONTENT); p1.leftMargin = dp(6);
        LinearLayout.LayoutParams p2 = new LinearLayout.LayoutParams(dp(60), ViewGroup.LayoutParams.WRAP_CONTENT); p2.leftMargin = dp(6);
        tr.addView(tb, p1); tr.addView(del, p2);
        remotePanel.addView(tr);

        Button change = btn("Promijeni TV / ponovno upari", false);
        change.setOnClickListener(v -> { io.execute(tv::close); remotePanel.setVisibility(View.GONE); setupPanel.setVisibility(View.VISIBLE); });
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cp.topMargin = dp(24);
        remotePanel.addView(change, cp);
        root.addView(remotePanel);
        setContentView(sv);
    }

    private View linkBtn(String label, final String url) {
        Button x = btn(label, false);
        x.setTextSize(14);
        x.setOnClickListener(v -> { v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP); run(() -> tv.link(url)); });
        return x;
    }

    private View touchpad() {
        TextView pad = new TextView(this);
        pad.setText("povuci prstom · dodir = OK");
        pad.setTextColor(0xFF555555); pad.setGravity(Gravity.CENTER);
        GradientDrawable g = new GradientDrawable();
        g.setColor(0xFF111111); g.setCornerRadius(dp(24));
        pad.setBackground(g);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(200));
        lp.topMargin = dp(12);
        pad.setLayoutParams(lp);
        final float[] s = new float[3]; // startX, startY, moved
        pad.setOnTouchListener((v, e) -> {
            switch (e.getAction()) {
                case MotionEvent.ACTION_DOWN: s[0] = e.getX(); s[1] = e.getY(); s[2] = 0; return true;
                case MotionEvent.ACTION_MOVE: {
                    float dx = e.getX() - s[0], dy = e.getY() - s[1];
                    if (Math.hypot(dx, dy) > dp(36)) {
                        s[2] = 1;
                        press(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : (dy > 0 ? DOWN : UP), v);
                        s[0] = e.getX(); s[1] = e.getY();
                    }
                    return true;
                }
                case MotionEvent.ACTION_UP: if (s[2] == 0) press(OK, v); return true;
            }
            return true;
        });
        return pad;
    }

    // ---------- actions ----------
    private interface Job { void run() throws Exception; }

    private void setStatus(final String s) { ui.post(() -> status.setText(s)); }

    private void run(final Job j) {
        io.execute(() -> {
            try { j.run(); setStatus("✓"); }
            catch (Exception e) { setStatus("✗ " + (e.getMessage() == null ? e.toString() : e.getMessage())); }
        });
    }

    private void press(final int code, View v) {
        if (v != null) v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
        run(() -> tv.key(code));
    }

    private void showRemote(String ip, boolean connectNow) {
        tv.setHost(ip);
        setupPanel.setVisibility(View.GONE);
        remotePanel.setVisibility(View.VISIBLE);
        setStatus("TV: " + ip);
        if (connectNow) run(() -> tv.connect(ip));
    }

    private void startConnect() {
        final String ip = ipField.getText().toString().trim();
        if (!ip.matches("[0-9a-zA-Z.\\-]+")) { setStatus("✗ upiši ispravnu IP adresu"); return; }
        prefs.edit().putString("ip", ip).apply();
        setStatus("Spajam se na " + ip + " …");
        io.execute(() -> {
            try {
                tv.pairStart(ip);
            } catch (Exception e) {
                setStatus("✗ " + (e.getMessage() == null ? e.toString() : e.getMessage()));
                return;
            }
            ui.post(() -> askCode(ip));
        });
    }

    private void askCode(final String ip) {
        final EditText code = new EditText(this);
        code.setHint("npr. 1A2B3C");
        code.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);
        new AlertDialog.Builder(this)
                .setTitle("Kod s TV-a")
                .setMessage("Upiši kod od 6 znakova koji se prikazuje na TV-u.")
                .setView(code)
                .setCancelable(false)
                .setNegativeButton("Odustani", (d, w) -> io.execute(tv::closePair))
                .setPositiveButton("Potvrdi", (d, w) -> {
                    final String c = code.getText().toString();
                    setStatus("Uparujem …");
                    io.execute(() -> {
                        try {
                            tv.pairFinish(c);
                            tv.connect(ip);
                            prefs.edit().putBoolean("paired:" + ip, true).apply();
                            ui.post(() -> showRemote(ip, false));
                        } catch (Exception e) {
                            setStatus("✗ " + (e.getMessage() == null ? e.toString() : e.getMessage()));
                        }
                    });
                }).show();
    }
}
