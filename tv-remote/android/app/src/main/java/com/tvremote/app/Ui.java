package com.tvremote.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.os.Handler;
import android.os.Looper;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;

/** Apple-style palette and hand-drawn controls. */
final class Ui {
    static final int BG = 0xFF000000, CARD = 0xFF1C1C1E, CARD2 = 0xFF2C2C2E, CARD3 = 0xFF3A3A3C,
            LABEL = 0xFF8E8E93, WHITE = 0xFFFFFFFF, BLUE = 0xFF0A84FF, RED = 0xFFFF453A, GREEN = 0xFF30D158;
    static final Typeface MEDIUM = Typeface.create("sans-serif-medium", Typeface.NORMAL);
    static final Typeface LIGHT = Typeface.create("sans-serif-light", Typeface.NORMAL);

    static int dp(Context c, float v) { return Math.round(v * c.getResources().getDisplayMetrics().density); }

    // icon ids
    static final int NONE = 0, BACK = 1, HOME = 2, PLAY = 3, MUTE = 4, PLUS = 5, MINUS = 6, POWER = 7, INPUT = 8,
            GEAR = 9, FF = 10, REW = 11, SEARCH = 12, KEYB = 13, MENU = 14, REMOTE = 15, APPS = 16, SLIDERS = 17, BOLT = 18, MORE = 19, CLOSE = 20;

    static void icon(Canvas c, int type, float cx, float cy, float u, int color) {
        Paint st = new Paint(Paint.ANTI_ALIAS_FLAG);
        st.setStyle(Paint.Style.STROKE); st.setColor(color); st.setStrokeWidth(u * 0.26f);
        st.setStrokeCap(Paint.Cap.ROUND); st.setStrokeJoin(Paint.Join.ROUND);
        Paint fl = new Paint(Paint.ANTI_ALIAS_FLAG);
        fl.setStyle(Paint.Style.FILL); fl.setColor(color);
        Path p = new Path();
        switch (type) {
            case BACK:
                p.moveTo(cx + .5f * u, cy - u); p.lineTo(cx - .5f * u, cy); p.lineTo(cx + .5f * u, cy + u); c.drawPath(p, st); break;
            case HOME:
                p.moveTo(cx - 1.2f * u, cy - .1f * u); p.lineTo(cx, cy - 1.2f * u); p.lineTo(cx + 1.2f * u, cy - .1f * u);
                p.moveTo(cx - .85f * u, cy - .3f * u); p.lineTo(cx - .85f * u, cy + 1f * u); p.lineTo(cx + .85f * u, cy + 1f * u); p.lineTo(cx + .85f * u, cy - .3f * u);
                c.drawPath(p, st); break;
            case PLAY:
                p.moveTo(cx - 1.25f * u, cy - .95f * u); p.lineTo(cx - 1.25f * u, cy + .95f * u); p.lineTo(cx - .05f * u, cy); p.close(); c.drawPath(p, fl);
                c.drawRoundRect(new RectF(cx + .45f * u, cy - .95f * u, cx + .8f * u, cy + .95f * u), u * .1f, u * .1f, fl);
                c.drawRoundRect(new RectF(cx + 1.05f * u, cy - .95f * u, cx + 1.4f * u, cy + .95f * u), u * .1f, u * .1f, fl); break;
            case MUTE:
                p.moveTo(cx - 1.4f * u, cy - .5f * u); p.lineTo(cx - .7f * u, cy - .5f * u); p.lineTo(cx + .1f * u, cy - 1.1f * u);
                p.lineTo(cx + .1f * u, cy + 1.1f * u); p.lineTo(cx - .7f * u, cy + .5f * u); p.lineTo(cx - 1.4f * u, cy + .5f * u); p.close();
                c.drawPath(p, fl);
                c.drawLine(cx + .6f * u, cy - .5f * u, cx + 1.4f * u, cy + .5f * u, st);
                c.drawLine(cx + .6f * u, cy + .5f * u, cx + 1.4f * u, cy - .5f * u, st); break;
            case PLUS:
                c.drawLine(cx - u, cy, cx + u, cy, st); c.drawLine(cx, cy - u, cx, cy + u, st); break;
            case MINUS:
                c.drawLine(cx - u, cy, cx + u, cy, st); break;
            case POWER:
                c.drawArc(new RectF(cx - u, cy - u + .15f * u, cx + u, cy + u + .15f * u), -60, 300, false, st);
                c.drawLine(cx, cy - 1.25f * u, cx, cy - .15f * u, st); break;
            case INPUT:
                c.drawRoundRect(new RectF(cx - 1.3f * u, cy - 1f * u, cx + 1.3f * u, cy + 1f * u), u * .3f, u * .3f, st);
                c.drawLine(cx - .6f * u, cy, cx + .55f * u, cy, st);
                p.moveTo(cx, cy - .55f * u); p.lineTo(cx + .55f * u, cy); p.lineTo(cx, cy + .55f * u); c.drawPath(p, st); break;
            case GEAR: {
                // toothed gear with a hole
                int teeth = 8;
                float ro = 1.3f * u, ri = 1.0f * u;
                Path g = new Path();
                for (int i = 0; i < teeth * 4; i++) {
                    double a = i * Math.PI * 2 / (teeth * 4) - Math.PI / 2;
                    float r = (i % 4 == 0 || i % 4 == 1) ? ro : ri;
                    float x = cx + (float) Math.cos(a) * r, y = cy + (float) Math.sin(a) * r;
                    if (i == 0) g.moveTo(x, y); else g.lineTo(x, y);
                }
                g.close();
                g.addCircle(cx, cy, .42f * u, Path.Direction.CW);
                g.setFillType(Path.FillType.EVEN_ODD);
                c.drawPath(g, fl);
                break;
            }
            case CLOSE:
                c.drawLine(cx - .8f * u, cy - .8f * u, cx + .8f * u, cy + .8f * u, st);
                c.drawLine(cx - .8f * u, cy + .8f * u, cx + .8f * u, cy - .8f * u, st);
                break;
            case MORE:
                for (int i = -1; i <= 1; i++) c.drawCircle(cx + i * .75f * u, cy, u * .2f, fl);
                break;
            case BOLT:
                p.moveTo(cx + .25f * u, cy - 1.4f * u); p.lineTo(cx - .85f * u, cy + .15f * u); p.lineTo(cx - .05f * u, cy + .15f * u);
                p.lineTo(cx - .3f * u, cy + 1.4f * u); p.lineTo(cx + .85f * u, cy - .2f * u); p.lineTo(cx + .05f * u, cy - .2f * u); p.close();
                c.drawPath(p, st); break;
            case SLIDERS:
                for (int i = -1; i <= 1; i++) {
                    float y = cy + i * .75f * u, kx = cx + (i == 0 ? .5f : -.45f) * u;
                    c.drawLine(cx - 1.25f * u, y, cx + 1.25f * u, y, st);
                    Paint bgk = new Paint(Paint.ANTI_ALIAS_FLAG); bgk.setColor(color);
                    c.drawCircle(kx, y, .32f * u, bgk);
                }
                break;
            case FF:
            case REW: {
                float d = type == FF ? 1 : -1;
                for (int k = 0; k < 2; k++) {
                    float ox = cx + d * (k - .5f) * 1.3f * u;
                    Path t = new Path();
                    t.moveTo(ox - d * .65f * u, cy - .9f * u); t.lineTo(ox - d * .65f * u, cy + .9f * u); t.lineTo(ox + d * .65f * u, cy); t.close();
                    c.drawPath(t, fl);
                }
                break;
            }
            case SEARCH:
                c.drawCircle(cx - .2f * u, cy - .2f * u, .85f * u, st); c.drawLine(cx + .45f * u, cy + .45f * u, cx + 1.25f * u, cy + 1.25f * u, st); break;
            case KEYB: {
                c.drawRoundRect(new RectF(cx - 1.5f * u, cy - 1f * u, cx + 1.5f * u, cy + 1f * u), u * .3f, u * .3f, st);
                for (int r = 0; r < 2; r++) for (int k = 0; k < 4; k++)
                    c.drawCircle(cx - 1f * u + k * .66f * u, cy - .35f * u + r * .6f * u, u * .09f, fl);
                c.drawLine(cx - .7f * u, cy + .55f * u, cx + .7f * u, cy + .55f * u, st);
                break;
            }
            case MENU:
                for (int i = -1; i <= 1; i++) c.drawLine(cx - u, cy + i * .6f * u, cx + u, cy + i * .6f * u, st); break;
            case REMOTE:
                c.drawRoundRect(new RectF(cx - .75f * u, cy - 1.45f * u, cx + .75f * u, cy + 1.45f * u), u * .5f, u * .5f, st);
                c.drawCircle(cx, cy - .55f * u, u * .28f, st); c.drawLine(cx, cy + .3f * u, cx, cy + .9f * u, st); break;
            case APPS:
                for (int r = 0; r < 2; r++) for (int k = 0; k < 2; k++)
                    c.drawRoundRect(new RectF(cx - 1.1f * u + k * 1.2f * u, cy - 1.1f * u + r * 1.2f * u,
                            cx - .1f * u + k * 1.2f * u, cy - .1f * u + r * 1.2f * u), u * .25f, u * .25f, st);
                break;
            default: break;
        }
    }

    /** Round or pill button with a drawn icon or text, optional hold-to-repeat. */
    static class Btn extends View {
        int iconType, bg = CARD, fg = WHITE; String text; boolean pill, repeat; Runnable action, longAction; float textSp = 16;
        int maxDiameterDp = 60;
        private boolean longFired;
        private final Runnable longPress = new Runnable() { public void run() {
            if (down && longAction != null) { longFired = true; performHapticFeedback(HapticFeedbackConstants.LONG_PRESS); longAction.run(); } } };
        private final Paint bgp = new Paint(Paint.ANTI_ALIAS_FLAG), tp = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Handler h = new Handler(Looper.getMainLooper());
        private boolean down;
        private final Runnable loop = new Runnable() { public void run() { if (down && action != null) { action.run(); h.postDelayed(this, 140); } } };

        Btn(Context c, int icon, String text, int bg, boolean pill, Runnable a) {
            super(c); this.iconType = icon; this.text = text; this.bg = bg; this.pill = pill; this.action = a;
            tp.setTextAlign(Paint.Align.CENTER); tp.setTypeface(MEDIUM);
            setClickable(true);
        }
        Btn repeat() { repeat = true; return this; }
        Btn textSize(float sp) { textSp = sp; return this; }

        @Override protected void onMeasure(int w, int hh) {
            int width = MeasureSpec.getSize(w);
            int height = MeasureSpec.getMode(hh) == MeasureSpec.EXACTLY ? MeasureSpec.getSize(hh)
                    : (pill ? dp(getContext(), 52) : Math.min(width, dp(getContext(), maxDiameterDp)));
            setMeasuredDimension(width, height);
        }
        @Override protected void onDraw(Canvas c) {
            float w = getWidth(), hh = getHeight();
            bgp.setColor(down ? (bg == BLUE ? 0xFF3D9BFF : CARD3) : bg);
            if (pill) {
                c.drawRoundRect(new RectF(0, 0, w, hh), hh / 2f, hh / 2f, bgp);
            } else {
                c.drawCircle(w / 2f, hh / 2f, Math.min(w, hh) / 2f, bgp);
            }
            float iconX = w / 2f;
            if (iconType != NONE && text != null && pill) {
                tp.setTextSize(textSp * getResources().getDisplayMetrics().scaledDensity);
                iconX = w / 2f - tp.measureText(text) / 2f - hh * .12f;
            }
            if (iconType != NONE) icon(c, iconType, iconX, hh / 2f, Math.min(w, hh) * (pill ? .14f : .15f), fg);
            if (text != null) {
                tp.setColor(fg); tp.setTextSize(textSp * getResources().getDisplayMetrics().scaledDensity);
                float tx = iconType != NONE && pill ? w / 2f + hh * .22f : w / 2f;
                c.drawText(text, tx, hh / 2f - (tp.descent() + tp.ascent()) / 2f, tp);
            }
        }
        @Override public boolean onTouchEvent(MotionEvent e) {
            switch (e.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    down = true; invalidate(); animate().scaleX(.94f).scaleY(.94f).setDuration(70).start();
                    performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                    longFired = false;
                    if (repeat && action != null) { action.run(); h.postDelayed(loop, 450); }
                    if (longAction != null) h.postDelayed(longPress, 650);
                    return true;
                case MotionEvent.ACTION_UP:
                    boolean inside = e.getX() >= 0 && e.getX() <= getWidth() && e.getY() >= 0 && e.getY() <= getHeight();
                    down = false; invalidate(); animate().scaleX(1f).scaleY(1f).setDuration(90).start(); h.removeCallbacks(loop);
                    h.removeCallbacks(longPress);
                    if (!repeat && !longFired && inside && action != null) action.run();
                    return true;
                case MotionEvent.ACTION_CANCEL:
                    down = false; invalidate(); animate().scaleX(1f).scaleY(1f).setDuration(90).start(); h.removeCallbacks(loop);
                    h.removeCallbacks(longPress);
                    return true;
            }
            return true;
        }
    }

    /**
     * One-thumb touch surface. Drag = move (a flick adds steps), tap = OK.
     * Hold and release = play/pause; hold and slide up/down = volume, left/right = rewind/forward.
     * From the left edge = back, from the bottom edge up = home, from the right edge = keyboard.
     */
    static class TrackPad extends View {
        interface Key { void press(int code); }
        Key key;
        Runnable onEdgeRight;
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Handler h = new Handler(Looper.getMainLooper());
        private android.view.VelocityTracker vt;
        private float downX, downY, lastX, lastY, accX, accY, touchX = -1, touchY = -1;
        private long downT;
        private boolean moved, down, holding, holdUsed, edgeRight, edgeLeft, edgeBottom;
        private String label;
        private long labelAt;
        boolean hint = true;

        private final Runnable hold = new Runnable() {
            public void run() {
                if (!down || moved || edgeLeft || edgeRight || edgeBottom) return;
                holding = true; holdUsed = false; accX = accY = 0;
                performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
                show("↕ glasnoća   ↔ premotavanje");
            }
        };

        TrackPad(Context c) { super(c); setClickable(true); }

        private float d(float v) { return dp(getContext(), v); }

        private void show(String text) {
            label = text; labelAt = System.currentTimeMillis(); hint = false;
            invalidate();
            h.postDelayed(this::invalidate, 900);
        }

        private void fire(int code, String text) {
            if (key == null) return;
            performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            key.press(code);
            if (text != null) show(text);
            hint = false;
            invalidate();
        }

        /** Keep the system back gesture away from the middle of both side edges, where our edge swipes start. */
        @Override protected void onLayout(boolean changed, int l, int t, int r, int b) {
            super.onLayout(changed, l, t, r, b);
            if (android.os.Build.VERSION.SDK_INT >= 29) {
                int h2 = (b - t) / 2, half = (int) d(100);
                java.util.List<android.graphics.Rect> ex = new java.util.ArrayList<>();
                ex.add(new android.graphics.Rect(0, h2 - half, (int) d(40), h2 + half));
                ex.add(new android.graphics.Rect(r - l - (int) d(40), h2 - half, r - l, h2 + half));
                setSystemGestureExclusionRects(ex);
            }
        }

        @Override protected void onDraw(Canvas c) {
            float w = getWidth(), hh = getHeight(), r = d(30);
            p.setStyle(Paint.Style.FILL);
            p.setShader(new android.graphics.LinearGradient(0, 0, 0, hh, 0xFF1E1E21, 0xFF141416, android.graphics.Shader.TileMode.CLAMP));
            c.drawRoundRect(new RectF(0, 0, w, hh), r, r, p);
            p.setShader(null);
            // grips: left = back, right = keyboard, bottom = home
            p.setColor(0xFF3A3A3C);
            c.drawRoundRect(new RectF(w - d(6), hh / 2 - d(36), w - d(3), hh / 2 + d(36)), d(2), d(2), p);
            c.drawRoundRect(new RectF(d(3), hh / 2 - d(36), d(6), hh / 2 + d(36)), d(2), d(2), p);
            c.drawRoundRect(new RectF(w / 2 - d(36), hh - d(7), w / 2 + d(36), hh - d(4)), d(2), d(2), p);

            if (touchX >= 0) {
                int glow = holding ? 0x4A0A84FF : 0x2EFFFFFF;
                p.setShader(new android.graphics.RadialGradient(touchX, touchY, d(holding ? 110 : 80), glow, 0x00FFFFFF, android.graphics.Shader.TileMode.CLAMP));
                c.drawCircle(touchX, touchY, d(holding ? 110 : 80), p);
                p.setShader(null);
            }
            long age = System.currentTimeMillis() - labelAt;
            if (label != null && (age < 900 || holding)) {
                int a = holding ? 255 : (int) (255 * Math.min(1f, (900 - age) / 300f));
                p.setTypeface(MEDIUM); p.setTextAlign(Paint.Align.CENTER);
                p.setTextSize(17 * getResources().getDisplayMetrics().scaledDensity);
                float tw = p.measureText(label) + d(40);
                float y = d(64);
                p.setColor((Math.min(a, 230) << 24) | 0x3A3A3C);
                c.drawRoundRect(new RectF(w / 2 - tw / 2, y - d(24), w / 2 + tw / 2, y + d(24)), d(24), d(24), p);
                p.setColor((a << 24) | 0xFFFFFF);
                c.drawText(label, w / 2, y - (p.descent() + p.ascent()) / 2, p);
                if (!holding) invalidate();
            } else if (hint) {
                p.setTypeface(MEDIUM); p.setTextAlign(Paint.Align.CENTER);
                p.setColor(0xFF636366);
                p.setTextSize(15 * getResources().getDisplayMetrics().scaledDensity);
                c.drawText("Povuci za kretanje · dodir = OK", w / 2, hh / 2 - d(12), p);
                p.setColor(0xFF48484A);
                p.setTextSize(12.5f * getResources().getDisplayMetrics().scaledDensity);
                c.drawText("drži = play/pauza · drži i kliži = glasnoća", w / 2, hh / 2 + d(14), p);
                c.drawText("s lijevog ruba = natrag · odozdo gore = početni", w / 2, hh / 2 + d(34), p);
            }
        }

        @Override public boolean onTouchEvent(MotionEvent e) {
            if (e.getPointerCount() > 1) return true;   // one thumb only
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(true);
                    downX = lastX = touchX = e.getX(); downY = lastY = touchY = e.getY();
                    accX = accY = 0; moved = holding = holdUsed = false; down = true;
                    downT = System.currentTimeMillis();
                    edgeBottom = downY > getHeight() - d(34);
                    edgeRight = !edgeBottom && downX > getWidth() - d(30);
                    edgeLeft = !edgeBottom && downX < d(30);
                    vt = android.view.VelocityTracker.obtain(); vt.addMovement(e);
                    h.postDelayed(hold, 450);
                    invalidate();
                    return true;
                case MotionEvent.ACTION_MOVE: {
                    if (vt != null) vt.addMovement(e);
                    float x = e.getX(), y = e.getY();
                    touchX = x; touchY = y;
                    if (!down) return true;
                    if (holding) {
                        accX += x - lastX; accY += y - lastY; lastX = x; lastY = y;
                        float vs = d(24), hs = d(60);
                        while (Math.abs(accY) >= vs && Math.abs(accY) >= Math.abs(accX)) {
                            boolean up = accY < 0;
                            fire(up ? 24 : 25, up ? "Glasnoća +" : "Glasnoća −");
                            accY -= Math.signum(accY) * vs; accX = 0; holdUsed = true;
                        }
                        while (Math.abs(accX) >= hs && Math.abs(accX) > Math.abs(accY)) {
                            boolean fwd = accX > 0;
                            fire(fwd ? 90 : 89, fwd ? "Naprijed »" : "« Nazad");
                            accX -= Math.signum(accX) * hs; accY = 0; holdUsed = true;
                        }
                        invalidate();
                        return true;
                    }
                    if (edgeRight || edgeLeft || edgeBottom) {
                        if (Math.hypot(x - downX, y - downY) > d(10)) h.removeCallbacks(hold);
                        if (edgeBottom && downY - y > d(60)) { edgeBottom = false; down = false; fire(3, "Početni zaslon"); }
                        else if (edgeLeft && x - downX > d(60)) { edgeLeft = false; down = false; fire(4, "Natrag"); }
                        else if (edgeRight && downX - x > d(60)) {
                            edgeRight = false; down = false;
                            performHapticFeedback(HapticFeedbackConstants.LONG_PRESS); hint = false;
                            if (onEdgeRight != null) onEdgeRight.run();
                        }
                        else if ((edgeLeft || edgeRight) && Math.abs(y - downY) > d(40)) { edgeLeft = edgeRight = false; lastX = x; lastY = y; }
                        else if (edgeBottom && Math.abs(x - downX) > d(40)) { edgeBottom = false; lastX = x; lastY = y; }
                        invalidate();
                        return true;
                    }
                    accX += x - lastX; accY += y - lastY;
                    lastX = x; lastY = y;
                    if (Math.hypot(x - downX, y - downY) > d(10)) { moved = true; h.removeCallbacks(hold); }
                    float st = d(40);
                    while (Math.abs(accX) >= st || Math.abs(accY) >= st) {
                        if (Math.abs(accX) >= Math.abs(accY)) { fire(accX > 0 ? 22 : 21, null); accX -= Math.signum(accX) * st; accY = 0; }
                        else { fire(accY > 0 ? 20 : 19, null); accY -= Math.signum(accY) * st; accX = 0; }
                    }
                    invalidate();
                    return true;
                }
                case MotionEvent.ACTION_UP: {
                    h.removeCallbacks(hold);
                    touchX = touchY = -1;
                    boolean wasDown = down;
                    down = false;
                    long dur = System.currentTimeMillis() - downT;
                    if (holding) { if (!holdUsed) fire(85, "Play / Pauza"); holding = false; }
                    else if (wasDown && !moved && dur < 450) fire(23, null);
                    else if (wasDown && moved && vt != null) {
                        vt.addMovement(e);
                        vt.computeCurrentVelocity(1000);
                        float dd = getResources().getDisplayMetrics().density;
                        float vx = vt.getXVelocity() / dd, vy = vt.getYVelocity() / dd;
                        float v = Math.max(Math.abs(vx), Math.abs(vy));
                        if (v > 1400) {
                            final int code = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 22 : 21) : (vy > 0 ? 20 : 19);
                            int extra = Math.min(4, (int) (v / 1100));
                            for (int i = 1; i <= extra; i++) h.postDelayed(() -> fire(code, null), i * 90L);
                        }
                    }
                    if (vt != null) { vt.recycle(); vt = null; }
                    invalidate();
                    return true;
                }
                case MotionEvent.ACTION_CANCEL:
                    h.removeCallbacks(hold);
                    touchX = touchY = -1; down = false; holding = false;
                    if (vt != null) { vt.recycle(); vt = null; }
                    invalidate();
                    return true;
            }
            return true;
        }
    }

    /** A drawn icon on its own (for search bars, list rows). */
    static class IconView extends View {
        final int type; int color = LABEL;
        IconView(Context c, int type) { super(c); this.type = type; }
        @Override protected void onDraw(Canvas c) { icon(c, type, getWidth() / 2f, getHeight() / 2f, Math.min(getWidth(), getHeight()) * .22f, color); }
    }

    /** App tile: coloured rounded square with a mark, name below. */
    static class Tile extends View {
        final String name, mark; final int color; Runnable action, longAction;
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Handler h = new Handler(Looper.getMainLooper());
        private boolean down, longFired;
        private final Runnable lp = new Runnable() { public void run() {
            if (down && longAction != null) { longFired = true; performHapticFeedback(HapticFeedbackConstants.LONG_PRESS); longAction.run(); } } };
        Tile(Context c, String name, String mark, int color, Runnable a) {
            super(c); this.name = name; this.mark = mark; this.color = color; this.action = a; setClickable(true);
        }
        @Override protected void onMeasure(int w, int hh) {
            int width = MeasureSpec.getSize(w);
            setMeasuredDimension(width, width + dp(getContext(), 24));
        }
        @Override protected void onDraw(Canvas c) {
            float w = getWidth(), s = w - dp(getContext(), 8);
            float l = (w - s) / 2f;
            p.setColor(color); p.setAlpha(down ? 200 : 255);
            c.drawRoundRect(new RectF(l, 0, l + s, s), s * .23f, s * .23f, p);
            p.setAlpha(255); p.setColor(WHITE); p.setTextAlign(Paint.Align.CENTER); p.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
            p.setTextSize(s * (mark.length() > 2 ? .3f : .4f)); c.drawText(mark, w / 2f, s / 2f - (p.descent() + p.ascent()) / 2f, p);
            p.setColor(0xFFD1D1D6); p.setTypeface(MEDIUM); p.setTextSize(11.5f * getResources().getDisplayMetrics().scaledDensity);
            c.drawText(name, w / 2f, s + dp(getContext(), 18), p);
        }
        @Override public boolean onTouchEvent(MotionEvent e) {
            switch (e.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    down = true; longFired = false; invalidate(); animate().scaleX(.94f).scaleY(.94f).setDuration(70).start();
                    h.postDelayed(lp, 600); return true;
                case MotionEvent.ACTION_UP:
                    down = false; invalidate(); animate().scaleX(1).scaleY(1).setDuration(90).start(); h.removeCallbacks(lp);
                    if (!longFired && e.getX() >= 0 && e.getX() <= getWidth() && e.getY() >= 0 && e.getY() <= getHeight() && action != null) {
                        performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP); action.run();
                    }
                    return true;
                case MotionEvent.ACTION_CANCEL: down = false; h.removeCallbacks(lp); invalidate(); animate().scaleX(1).scaleY(1).setDuration(90).start(); return true;
            }
            return true;
        }
    }
}
