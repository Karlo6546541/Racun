package com.tvremote.app;

import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Looper;
import android.view.View;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.List;

/** Renders each screen to PNG so the layout can be looked at without a device. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w393dp-h851dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class ScreenshotTest {

    private static void save(MainActivity a, String name) throws Exception {
        shadowOf(Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(600));
        View v = a.getWindow().getDecorView();
        v.measure(View.MeasureSpec.makeMeasureSpec(v.getWidth(), View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(v.getHeight(), View.MeasureSpec.EXACTLY));
        v.layout(0, 0, v.getWidth(), v.getHeight());
        Bitmap bm = Bitmap.createBitmap(v.getWidth(), v.getHeight(), Bitmap.Config.ARGB_8888);
        v.draw(new Canvas(bm));
        File dir = new File(System.getProperty("shots.dir", "build/shots"));
        dir.mkdirs();
        try (FileOutputStream o = new FileOutputStream(new File(dir, name + ".png"))) {
            bm.compress(Bitmap.CompressFormat.PNG, 100, o);
        }
    }

    private static Method m(String name, Class<?>... args) throws Exception {
        Method x = MainActivity.class.getDeclaredMethod(name, args); x.setAccessible(true); return x;
    }

    private static Object f(Object o, String name) throws Exception {
        Field x = MainActivity.class.getDeclaredField(name); x.setAccessible(true); return x.get(o);
    }

    private static MainActivity paired() {
        Context c = RuntimeEnvironment.getApplication();
        c.getSharedPreferences("tv", Context.MODE_PRIVATE).edit()
                .putString("ip", "192.168.0.177").putBoolean("paired:192.168.0.177", true)
                .putString("shortcuts", "[{\"name\":\"Disney+ PIN\",\"app\":\"Disney+\",\"steps\":\"w7000 k23 w2000 k8 w300 k9 w300 k10 w300 k11 w1200\"}]")
                .commit();
        return Robolectric.buildActivity(MainActivity.class).setup().get();
    }

    @Test public void setup() throws Exception {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).setup().get();
        save(a, "0-setup");
    }

    @Test public void tabs() throws Exception {
        MainActivity a = paired();
        Method sel = m("selectTab", int.class);
        String[] names = {"1-remote", "2-apps", "3-keyboard", "4-shortcuts", "5-settings"};
        for (int i = 0; i < names.length; i++) { sel.invoke(a, i); save(a, names[i]); }

        m("startRecording", String.class, String.class, boolean.class).invoke(a, "Disney+ PIN", "Disney+", false);
        save(a, "7-recording");
    }

    @Test public void replayDoesNotOverlapAndStopsOnTap() throws Exception {
        MainActivity a = paired();
        Class<?> sc = Class.forName("com.tvremote.app.MainActivity$Shortcut");
        java.lang.reflect.Constructor<?> ctor = sc.getDeclaredConstructor(String.class, String.class, String.class);
        ctor.setAccessible(true);
        Object slow = ctor.newInstance("Spori", null, "w5000 k23");
        Method runS = m("runShortcut", sc);
        runS.invoke(a, slow);
        runS.invoke(a, slow);           // second tap while running: ignored
        shadowOf(Looper.getMainLooper()).idle();
        String banner = ((android.widget.TextView) f(a, "banner")).getText().toString();
        assertTrue(banner, banner.contains("Već radim"));
        m("press", int.class).invoke(a, 22);  // any remote key stops it
        Field rep = MainActivity.class.getDeclaredField("replaying"); rep.setAccessible(true);
        long end = System.currentTimeMillis() + 3000;
        while ((boolean) rep.get(a) && System.currentTimeMillis() < end) Thread.sleep(50);
        assertTrue("replay should have stopped well before its 5 s wait", !(boolean) rep.get(a));
    }

    @Test public void trackpadGestures() {
        Context c = RuntimeEnvironment.getApplication();
        Ui.TrackPad pad = new Ui.TrackPad(c);
        pad.measure(View.MeasureSpec.makeMeasureSpec(1000, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(1400, View.MeasureSpec.EXACTLY));
        pad.layout(0, 0, 1000, 1400);
        final java.util.List<Integer> keys = new java.util.ArrayList<>();
        pad.key = keys::add;
        float d = c.getResources().getDisplayMetrics().density;
        long t = 1000;
        // slow drag to the right over 100 dp: two steps (one per 40 dp)
        pad.onTouchEvent(android.view.MotionEvent.obtain(t, t, android.view.MotionEvent.ACTION_DOWN, 300, 700, 0));
        for (int i = 1; i <= 20; i++)
            pad.onTouchEvent(android.view.MotionEvent.obtain(t, t + i * 50, android.view.MotionEvent.ACTION_MOVE, 300 + i * 5 * d, 700, 0));
        pad.onTouchEvent(android.view.MotionEvent.obtain(t, t + 1100, android.view.MotionEvent.ACTION_UP, 300 + 100 * d, 700, 0));
        assertTrue(keys.toString(), keys.equals(java.util.Arrays.asList(22, 22)));
        // tap: OK
        keys.clear();
        pad.onTouchEvent(android.view.MotionEvent.obtain(t, 5000, android.view.MotionEvent.ACTION_DOWN, 500, 500, 0));
        pad.onTouchEvent(android.view.MotionEvent.obtain(t, 5100, android.view.MotionEvent.ACTION_UP, 502, 501, 0));
        assertTrue(keys.toString(), keys.equals(java.util.Collections.singletonList(23)));
        // drag up 50 dp: one step up
        keys.clear();
        pad.onTouchEvent(android.view.MotionEvent.obtain(t, 9000, android.view.MotionEvent.ACTION_DOWN, 500, 900, 0));
        for (int i = 1; i <= 10; i++)
            pad.onTouchEvent(android.view.MotionEvent.obtain(t, 9000 + i * 60, android.view.MotionEvent.ACTION_MOVE, 500, 900 - i * 5 * d, 0));
        pad.onTouchEvent(android.view.MotionEvent.obtain(t, 9700, android.view.MotionEvent.ACTION_UP, 500, 900 - 50 * d, 0));
        assertTrue(keys.toString(), keys.equals(java.util.Collections.singletonList(19)));
    }

    // ---- multi-touch helpers
    private static android.view.MotionEvent ev(long t, int action, float[][] pts) {
        int n = pts.length;
        android.view.MotionEvent.PointerProperties[] pp = new android.view.MotionEvent.PointerProperties[n];
        android.view.MotionEvent.PointerCoords[] pc = new android.view.MotionEvent.PointerCoords[n];
        for (int i = 0; i < n; i++) {
            pp[i] = new android.view.MotionEvent.PointerProperties(); pp[i].id = i;
            pp[i].toolType = android.view.MotionEvent.TOOL_TYPE_FINGER;
            pc[i] = new android.view.MotionEvent.PointerCoords(); pc[i].x = pts[i][0]; pc[i].y = pts[i][1];
            pc[i].pressure = 1; pc[i].size = 1;
        }
        return android.view.MotionEvent.obtain(0, t, action, n, pp, pc, 0, 0, 1, 1, 0, 0, 0, 0);
    }
    private static int pointerDown(int index) { return android.view.MotionEvent.ACTION_POINTER_DOWN | (index << android.view.MotionEvent.ACTION_POINTER_INDEX_SHIFT); }
    private static int pointerUp(int index) { return android.view.MotionEvent.ACTION_POINTER_UP | (index << android.view.MotionEvent.ACTION_POINTER_INDEX_SHIFT); }

    private static Ui.TrackPad pad(java.util.List<Integer> keys) {
        Ui.TrackPad pad = new Ui.TrackPad(RuntimeEnvironment.getApplication());
        pad.measure(View.MeasureSpec.makeMeasureSpec(1000, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(1400, View.MeasureSpec.EXACTLY));
        pad.layout(0, 0, 1000, 1400);
        pad.key = keys::add;
        return pad;
    }

    private static void drag(Ui.TrackPad p, long t, float x0, float y0, float dxDp, float dyDp, int steps, boolean down, boolean up) {
        float d = RuntimeEnvironment.getApplication().getResources().getDisplayMetrics().density;
        if (down) p.onTouchEvent(ev(t, android.view.MotionEvent.ACTION_DOWN, new float[][]{{x0, y0}}));
        for (int i = 1; i <= steps; i++)
            p.onTouchEvent(ev(t + 20 + i * 40, android.view.MotionEvent.ACTION_MOVE, new float[][]{{x0 + dxDp * d * i / steps, y0 + dyDp * d * i / steps}}));
        if (up) p.onTouchEvent(ev(t + 40 + steps * 40, android.view.MotionEvent.ACTION_UP, new float[][]{{x0 + dxDp * d, y0 + dyDp * d}}));
    }

    @Test public void holdAndSlideChangesVolume() {
        java.util.List<Integer> keys = new java.util.ArrayList<>();
        Ui.TrackPad p = pad(keys);
        p.onTouchEvent(ev(0, android.view.MotionEvent.ACTION_DOWN, new float[][]{{500, 800}}));
        shadowOf(Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(600));   // hold
        drag(p, 600, 500, 800, 0, -60, 12, false, true);                              // slide up 60 dp
        assertTrue(keys.toString(), keys.equals(java.util.Arrays.asList(24, 24)));       // two volume-up steps, no play/pause
    }

    @Test public void edgeSwipesAreBackHomeAndKeyboard() {
        java.util.List<Integer> keys = new java.util.ArrayList<>();
        Ui.TrackPad p = pad(keys);
        final int[] kb = {0};
        p.onEdgeRight = () -> kb[0]++;
        drag(p, 0, 5, 700, 80, 0, 16, true, true);          // left edge inwards
        assertTrue(keys.toString(), keys.equals(java.util.Collections.singletonList(4)));
        keys.clear();
        drag(p, 2000, 500, 1395, 0, -80, 16, true, true);   // bottom edge upwards
        assertTrue(keys.toString(), keys.equals(java.util.Collections.singletonList(3)));
        keys.clear();
        drag(p, 4000, 995, 700, -80, 0, 16, true, true);    // right edge inwards
        assertTrue("keyboard opened", kb[0] == 1);
        assertTrue(keys.toString(), keys.isEmpty());
    }

    @Test public void secondFingerIsIgnored() {
        java.util.List<Integer> keys = new java.util.ArrayList<>();
        Ui.TrackPad p = pad(keys);
        p.onTouchEvent(ev(0, android.view.MotionEvent.ACTION_DOWN, new float[][]{{400, 700}}));
        p.onTouchEvent(ev(20, pointerDown(1), new float[][]{{400, 700}, {600, 700}}));
        p.onTouchEvent(ev(120, pointerUp(1), new float[][]{{400, 700}, {600, 700}}));
        p.onTouchEvent(ev(130, android.view.MotionEvent.ACTION_UP, new float[][]{{400, 700}}));
        assertTrue(keys.toString(), keys.equals(java.util.Collections.singletonList(23)));   // still just a tap
    }

    @Test public void longPressIsPlayPause() {
        java.util.List<Integer> keys = new java.util.ArrayList<>();
        Ui.TrackPad p = pad(keys);
        p.onTouchEvent(ev(0, android.view.MotionEvent.ACTION_DOWN, new float[][]{{500, 700}}));
        shadowOf(Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(700));
        p.onTouchEvent(ev(800, android.view.MotionEvent.ACTION_UP, new float[][]{{500, 700}}));
        assertTrue(keys.toString(), keys.equals(java.util.Collections.singletonList(85)));
    }

    @Test public void recordingSavesSteps() throws Exception {
        MainActivity a = paired();
        m("startRecording", String.class, String.class, boolean.class).invoke(a, "Test", null, false);
        Method press = m("press", int.class);
        press.invoke(a, 23);
        press.invoke(a, 8);
        m("stopRecording", boolean.class).invoke(a, true);
        shadowOf(Looper.getMainLooper()).idle();
        String json = RuntimeEnvironment.getApplication().getSharedPreferences("tv", Context.MODE_PRIVATE).getString("shortcuts", "");
        assertTrue(json, json.contains("\"name\":\"Test\"") && json.contains("k23") && json.contains("k8"));
    }
}
