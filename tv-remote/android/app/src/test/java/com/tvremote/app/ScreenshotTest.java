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
        shadowOf(Looper.getMainLooper()).idle();
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
                .putString("shortcuts", "[{\"name\":\"Netflix – do pretrage\",\"app\":\"Netflix\",\"steps\":\"w6000 k23 w3000 k19 w400 k21 w400 k23 w1200\"},"
                        + "{\"name\":\"Disney+ PIN\",\"app\":\"Disney+\",\"steps\":\"w7000 k23 w2000 k8 w300 k9 w300 k10 w300 k11 w1200\"}]")
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

        Object netflix = ((List<?>) f(a, "apps")).get(2);
        Field sa = MainActivity.class.getDeclaredField("searchApp"); sa.setAccessible(true);
        sa.set(a, netflix);
        m("styleChips").invoke(a);
        sel.invoke(a, 1);
        save(a, "6-apps-netflix");

        m("startRecording", String.class, String.class, boolean.class).invoke(a, "Disney+ PIN", "Disney+", false);
        save(a, "7-recording");
    }

    @Test public void replayDoesNotOverlapAndStopsOnTap() throws Exception {
        MainActivity a = paired();
        Class<?> sc = Class.forName("com.tvremote.app.MainActivity$Shortcut");
        java.lang.reflect.Constructor<?> ctor = sc.getDeclaredConstructor(String.class, String.class, String.class);
        ctor.setAccessible(true);
        Object slow = ctor.newInstance("Spori", null, "w5000 k23");
        Method runS = m("runShortcut", sc, String.class);
        runS.invoke(a, slow, null);
        runS.invoke(a, slow, null);           // second tap while running: ignored
        shadowOf(Looper.getMainLooper()).idle();
        String banner = ((android.widget.TextView) f(a, "banner")).getText().toString();
        assertTrue(banner, banner.contains("Već radim"));
        m("press", int.class).invoke(a, 22);  // any remote key stops it
        Field rep = MainActivity.class.getDeclaredField("replaying"); rep.setAccessible(true);
        long end = System.currentTimeMillis() + 3000;
        while ((boolean) rep.get(a) && System.currentTimeMillis() < end) Thread.sleep(50);
        assertTrue("replay should have stopped well before its 5 s wait", !(boolean) rep.get(a));
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
