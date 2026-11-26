package com.tvremote.app;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;

/**
 * Gets text into a TV app in one of three ways:
 * TEXT  - the TV's system keyboard (IME) takes the text directly (YouTube, most apps);
 * KEYS  - one key press per letter, like a USB keyboard;
 * GRID  - walks an on-screen letter grid with the D-pad and presses OK (Netflix).
 * AUTO picks TEXT when the TV recently reported a system-keyboard field, else KEYS.
 */
final class Typer {
    static final int AUTO = 0, TEXT = 1, KEYS = 2, GRID = 3;
    static final String[] NAMES = {"Auto", "Tekst", "Tipke", "Netflix"};

    interface Sink {
        void key(int code) throws Exception;
        void text(String s) throws Exception;
        void pause(long ms) throws Exception;
    }

    static final int UP = 19, DOWN = 20, LEFT = 21, RIGHT = 22, OK = 23, DEL = 67, SPACE = 62;

    /** Lower case, no accents (č→c, đ→d), only what the keyboards have. */
    static String plain(String s) {
        String n = Normalizer.normalize(s.toLowerCase().replace('đ', 'd'), Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        StringBuilder b = new StringBuilder();
        for (char c : n.toCharArray()) if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == ' ') b.append(c);
        return b.toString();
    }

    static int keyFor(char c) {
        if (c >= 'a' && c <= 'z') return 29 + (c - 'a');
        if (c >= '0' && c <= '9') return 7 + (c - '0');
        if (c == ' ') return SPACE;
        return -1;
    }

    /**
     * Netflix TV search keyboard: a row with Space (left half) and Delete (right half),
     * then a–z and 0–9 in rows of six. Focus is assumed to start on "a".
     */
    static final class Grid {
        static final String[] ROWS = {"abcdef", "ghijkl", "mnopqr", "stuvwx", "yz1234", "567890"};
        int r = 0, c = 0; // r == -1 is the Space/Delete row

        /** D-pad presses (ending in OK) that type one character, or nothing for unknown ones. */
        List<Integer> type(char ch) {
            if (ch == ' ') return toTopRow(1);
            for (int row = 0; row < ROWS.length; row++) {
                int col = ROWS[row].indexOf(ch);
                if (col >= 0) return moveTo(row, col);
            }
            return new ArrayList<>();
        }

        List<Integer> delete() { return toTopRow(4); }

        private List<Integer> toTopRow(int col) {
            List<Integer> k = new ArrayList<>();
            if (r != -1) {
                k.addAll(moveNoOk(0, col));
                k.add(UP);
                r = -1;
            }
            // Space covers columns 0-2, Delete 3-5
            boolean wantDel = col >= 3, onDel = c >= 3;
            if (wantDel && !onDel) k.add(RIGHT);
            if (!wantDel && onDel) k.add(LEFT);
            c = col;
            k.add(OK);
            return k;
        }

        private List<Integer> moveTo(int row, int col) {
            List<Integer> k = moveNoOk(row, col);
            k.add(OK);
            return k;
        }

        private List<Integer> moveNoOk(int row, int col) {
            List<Integer> k = new ArrayList<>();
            if (r == -1) { k.add(DOWN); r = 0; }
            while (r < row) { k.add(DOWN); r++; }
            while (r > row) { k.add(UP); r--; }
            while (c < col) { k.add(RIGHT); c++; }
            while (c > col) { k.add(LEFT); c--; }
            return k;
        }
    }

    final Grid grid = new Grid();

    /** Resolve AUTO for the moment of typing. */
    static int resolve(int mode, long lastImeAt) {
        if (mode != AUTO) return mode;
        return System.currentTimeMillis() - lastImeAt < 120_000 ? TEXT : KEYS;
    }

    void append(int mode, String s, Sink out) throws Exception {
        if (s.isEmpty()) return;
        if (mode == TEXT) { out.text(s); return; }
        String p = plain(s);
        for (char ch : p.toCharArray()) {
            if (mode == KEYS) {
                int k = keyFor(ch);
                if (k > 0) { out.key(k); out.pause(90); }
            } else {
                for (int k : grid.type(ch)) { out.key(k); out.pause(130); }
            }
        }
    }

    void delete(int mode, int n, Sink out) throws Exception {
        for (int i = 0; i < n; i++) {
            if (mode == GRID) { for (int k : grid.delete()) { out.key(k); out.pause(130); } }
            else { out.key(DEL); out.pause(60); }
        }
    }

    /**
     * Makes the TV field show exactly {@code text}: deletes what is there, then types it all again.
     * {@code onTv} is how many characters the field holds now (as far as we know).
     */
    void replace(int mode, int onTv, String text, Sink out) throws Exception {
        int clear = mode == GRID ? onTv : onTv + 2;   // a couple of extra deletes cost nothing outside the grid
        delete(mode, clear, out);
        append(mode, text, out);
    }

    void resetGrid() { grid.r = 0; grid.c = 0; }
}
