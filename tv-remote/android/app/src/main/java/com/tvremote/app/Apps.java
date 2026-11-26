package com.tvremote.app;

import java.util.ArrayList;
import java.util.List;

/** Streaming apps: how to launch them (tried in order) and how to search in them. */
final class Apps {
    static final class App {
        final String name, mark; final int color; final String[] launch, search;
        App(String name, String mark, int color, String[] launch, String[] search) {
            this.name = name; this.mark = mark; this.color = color; this.launch = launch; this.search = search;
        }
    }

    // Launch candidates: deep link first, then application id (package name).
    // Deep links per the Home Assistant Android TV Remote docs; unverified ones are last resorts.
    static List<App> presets() {
        List<App> l = new ArrayList<>();
        l.add(new App("YouTube", "YT", 0xFFFF0000,
                new String[]{"https://www.youtube.com", "vnd.youtube://", "com.google.android.youtube.tv"},
                new String[]{"https://www.youtube.com/results?search_query=%s"}));
        l.add(new App("YT Music", "♪", 0xFFFF375F,
                new String[]{"https://music.youtube.com", "com.google.android.youtube.tvmusic"},
                new String[]{"https://music.youtube.com/search?q=%s"}));
        l.add(new App("Netflix", "N", 0xFFE50914,
                new String[]{"netflix://", "com.netflix.ninja", "https://www.netflix.com/browse?source=30"},
                new String[]{"nflx://www.netflix.com/search?q=%s", "https://www.netflix.com/search?q=%s&source=30"}));
        l.add(new App("Disney+", "D+", 0xFF113CCF,
                new String[]{"https://www.disneyplus.com", "disneyplus://", "com.disney.disneyplus"},
                new String[]{"https://www.disneyplus.com/search?q=%s"}));
        l.add(new App("Prime Video", "prime", 0xFF00A8E1,
                new String[]{"https://app.primevideo.com", "com.amazon.amazonvideo.livingroom"},
                new String[]{"https://app.primevideo.com/search?phrase=%s"}));
        l.add(new App("HBO Max", "max", 0xFF5822B4,
                new String[]{"https://play.max.com", "hbomax://", "com.wbd.stream", "com.hbo.hbonow"},
                new String[]{}));
        l.add(new App("Spotify", "S", 0xFF1DB954,
                new String[]{"spotify://", "com.spotify.tv.android"},
                new String[]{}));
        return l;
    }
}
