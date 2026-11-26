package com.tvremote.app;

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
import java.lang.reflect.Method;

import static org.robolectric.Shadows.shadowOf;

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

    @Test public void setup() throws Exception {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).setup().get();
        save(a, "0-setup");
    }

    @Test public void tabs() throws Exception {
        Context c = RuntimeEnvironment.getApplication();
        c.getSharedPreferences("tv", Context.MODE_PRIVATE).edit()
                .putString("ip", "192.168.0.177").putBoolean("paired:192.168.0.177", true).commit();
        MainActivity a = Robolectric.buildActivity(MainActivity.class).setup().get();
        Method sel = MainActivity.class.getDeclaredMethod("selectTab", int.class);
        sel.setAccessible(true);
        String[] names = {"1-remote", "2-apps", "3-keyboard", "4-settings"};
        for (int i = 0; i < names.length; i++) { sel.invoke(a, i); save(a, names[i]); }
        // Netflix chosen for search
        java.lang.reflect.Field appsF = MainActivity.class.getDeclaredField("apps"); appsF.setAccessible(true);
        java.lang.reflect.Field sa = MainActivity.class.getDeclaredField("searchApp"); sa.setAccessible(true);
        Object netflix = ((java.util.List<?>) appsF.get(a)).get(2);
        sa.set(a, netflix);
        Method style = MainActivity.class.getDeclaredMethod("styleChips"); style.setAccessible(true); style.invoke(a);
        sel.invoke(a, 1); save(a, "5-apps-netflix");
        // teaching bar
        java.lang.reflect.Field rb = MainActivity.class.getDeclaredField("recordBar"); rb.setAccessible(true);
        Method start = MainActivity.class.getDeclaredMethod("startRecording", Apps.App.class); start.setAccessible(true);
        start.invoke(a, netflix);
        save(a, "6-learning");
    }
}
