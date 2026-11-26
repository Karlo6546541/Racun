package com.tvremote.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class TyperTest {
    private static String run(int mode, String... ops) throws Exception {
        final StringBuilder log = new StringBuilder();
        Typer t = new Typer();
        Typer.Sink sink = new Typer.Sink() {
            public void key(int k) { log.append(name(k)).append(' '); }
            public void text(String s) { log.append("TEXT(").append(s).append(") "); }
            public void pause(long ms) {}
        };
        for (String op : ops) {
            if (op.equals("<DEL>")) t.delete(mode, 1, sink); else t.append(mode, op, sink);
        }
        return log.toString().trim();
    }

    private static String name(int k) {
        switch (k) {
            case 19: return "U"; case 20: return "D"; case 21: return "L"; case 22: return "R";
            case 23: return "OK"; case 62: return "SPC"; case 67: return "DEL";
        }
        if (k >= 29 && k <= 54) return "" + (char) ('a' + k - 29);
        if (k >= 7 && k <= 16) return "" + (char) ('0' + k - 7);
        return "" + k;
    }

    @Test public void plainStripsAccents() {
        assertEquals("sta je dodo 9", Typer.plain("Šta je Đođo 9!"));
    }

    @Test public void keysMode() throws Exception {
        assertEquals("c a SPC 1 DEL", run(Typer.KEYS, "Ča 1", "<DEL>"));
    }

    @Test public void textMode() throws Exception {
        assertEquals("TEXT(Čao)", run(Typer.TEXT, "Čao"));
    }

    @Test public void gridMode() throws Exception {
        // a: already focused; b: right; o: row 2 col 2; space: back to row 0, up, left half; then delete: right, OK
        assertEquals("OK R OK D D R OK U U L U OK R OK", run(Typer.GRID, "abo ", "<DEL>"));
        // digit 9 is row 5, col 4; from 'a'
        assertEquals("D D D D D R R R R OK", run(Typer.GRID, "9"));
    }
}
