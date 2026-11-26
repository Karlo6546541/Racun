package com.tvremote.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class TyperTest {
    private static String run(int mode, String... ops) throws Exception {
        final StringBuilder log = new StringBuilder();
        Typer t = new Typer();
        if (mode == Typer.GRID) { t.grid.r = -1; t.grid.c = 0; t.grid.anchored = true; }   // focus on Space, known
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

    @Test public void replaceClearsThenTypesAll() throws Exception {
        final StringBuilder log = new StringBuilder();
        Typer.Sink sink = new Typer.Sink() {
            public void key(int k) { log.append(name(k)).append(' '); }
            public void text(String s) { log.append("TEXT(").append(s).append(") "); }
            public void pause(long ms) {}
        };
        new Typer().replace(Typer.TEXT, 3, "abc", sink);
        assertEquals("DEL DEL DEL DEL DEL TEXT(abc)", log.toString().trim());
        log.setLength(0);
        Typer g = new Typer();
        g.grid.r = -1; g.grid.c = 0; g.grid.anchored = true;   // focus known to be on Space
        g.replace(Typer.GRID, 0, "ab", sink);     // empty Netflix field: just type
        g.replace(Typer.GRID, 2, "a", sink);      // two deletes, then "a" again
        // a: leave Space (D L x5), OK | b: R, OK | two deletes from b (col 1): R x4 to col 5, UP onto Delete, OK, OK
        // | then 'a' again from Delete: D L x5, OK
        assertEquals("D L L L L L OK R OK R R R R U OK OK D L L L L L OK", log.toString().trim());
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

    private static final String HOME = "D L L L L L"; // leave Space: DOWN, then LEFT x5 to be sure of column 0

    @Test public void gridStartsOnSpace() throws Exception {
        assertEquals("OK", run(Typer.GRID, " "));                      // Space is focused at first
        assertEquals(HOME + " OK", run(Typer.GRID, "a"));              // 'a' = row 0, col 0
        assertEquals(HOME + " R R R R R OK", run(Typer.GRID, "d"));    // 'd' = row 0, col 5
    }

    @Test public void gridCroatianLetters() throws Exception {
        assertEquals(HOME + " R R R OK", run(Typer.GRID, "č"));        // row 0, col 3
        assertEquals(HOME + " D OK", run(Typer.GRID, "đ"));            // row 1, col 0
        assertEquals(HOME + " R R R R D D D OK", run(Typer.GRID, "š")); // row 3, col 4
        assertEquals(HOME + " D D D D D OK", run(Typer.GRID, "ž"));    // row 5, col 0
    }

    @Test public void gridLastRowHasFiveKeys() throws Exception {
        // '6' = row 6 col 0; '0' = row 6 col 4 (never col 5, that key does not exist)
        assertEquals(HOME + " D D D D D D OK", run(Typer.GRID, "6"));
        assertEquals(HOME + " R R R R D D D D D D OK", run(Typer.GRID, "0"));
    }

    @Test public void gridMovesBetweenKeys() throws Exception {
        // "ae": a (row 0 col 0) then e (row 1 col 1): RIGHT, DOWN
        assertEquals(HOME + " OK R D OK", run(Typer.GRID, "ae"));
        // from the last row back up is vertical first: '6' then 'a'
        assertEquals(HOME + " D D D D D D OK U U U U U U OK", run(Typer.GRID, "6a"));
    }

    @Test public void gridSpaceAndDelete() throws Exception {
        // type 'a' then Space: UP to the top row under cols 0-2 (we are at col 0), OK
        assertEquals(HOME + " OK U OK", run(Typer.GRID, "a "));
        // delete after 'd' (col 5): UP lands on Delete, OK
        assertEquals(HOME + " R R R R R OK U OK", run(Typer.GRID, "d", "<DEL>"));
        // Space then Delete on the top row: RIGHT, OK
        assertEquals("OK R OK", run(Typer.GRID, " ", "<DEL>"));
    }

    @Test public void gridWordFromAndPacing() throws Exception {
        // Derived by hand from the photo: f=row1 col2, r=row3 col2, o=row2 col5, m=row2 col3.
        // From Space: DOWN, LEFT x5 (column 0), RIGHT x2, DOWN, OK | DOWN DOWN OK | RIGHT x3, UP, OK | LEFT x2 OK
        assertEquals("D L L L L L R R D OK D D OK R R R U OK L L OK", run(Typer.GRID, "from"));

        // Every OK is preceded by a pause of at least 300 ms and followed by one of at least 300 ms.
        final java.util.List<String> events = new java.util.ArrayList<>();
        Typer.Sink sink = new Typer.Sink() {
            public void key(int k) { events.add("k" + k); }
            public void text(String t) {}
            public void pause(long ms) { events.add("p" + ms); }
        };
        new Typer().append(Typer.GRID, "o", sink);
        for (int i = 0; i < events.size(); i++) {
            if (events.get(i).equals("k23")) {
                assertTrue("pause before OK", Long.parseLong(events.get(i - 1).substring(1)) >= 300);
                assertTrue("pause after OK", Long.parseLong(events.get(i + 1).substring(1)) >= 300);
            }
        }
    }

    @Test public void autoPicksSystemKeyboardOnlyWhenTheTvAsked() {
        assertEquals(Typer.TEXT, Typer.resolve(Typer.AUTO, true, "com.google.android.youtube.tv"));
        assertEquals(Typer.KEYS, Typer.resolve(Typer.AUTO, false, "com.netflix.ninja"));   // walking the grid blind drifts
        assertEquals(Typer.GRID, Typer.resolve(Typer.GRID, true, ""));
        assertEquals(Typer.KEYS, Typer.resolve(Typer.KEYS, true, ""));
    }

    @Test public void gridAnchorsBeforeTheFirstKey() throws Exception {
        final java.util.List<Integer> keys = new java.util.ArrayList<>();
        Typer.Sink sink = new Typer.Sink() {
            public void key(int k) { keys.add(k); }
            public void text(String t) {}
            public void pause(long ms) {}
        };
        new Typer().append(Typer.GRID, "a", sink);
        // LEFT x6, UP x9 (to the profile picture), DOWN (Space), DOWN (first row), LEFT x6, then 'a' = OK
        String expected = "21 21 21 21 21 21 19 19 19 19 19 19 19 19 19 20 20 21 21 21 21 21 21 23";
        StringBuilder got = new StringBuilder();
        for (int k : keys) got.append(got.length() == 0 ? "" : " ").append(k);
        assertEquals(expected, got.toString());
        // and only once per field
        keys.clear();
        Typer again = new Typer();
        again.append(Typer.GRID, "a", sink); keys.clear();
        again.append(Typer.GRID, "a", sink);
        assertEquals("[23]", keys.toString());
    }

    @Test public void keysModeTypesWhatNetflixAcceptsFromAKeyboard() throws Exception {
        assertEquals("f r o m", run(Typer.KEYS, "from"));
        assertEquals("s t a SPC 1 DEL", run(Typer.KEYS, "Šta 1", "<DEL>"));
    }

    @Test public void gridKeepsCroatianLettersOnly() {
        assertEquals("šđčćž ab12", Typer.gridText("ŠĐČĆŽ Ab12!?"));
    }
}
