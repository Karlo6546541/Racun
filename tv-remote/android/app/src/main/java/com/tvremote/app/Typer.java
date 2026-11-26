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

    /** Lower case; keeps what the Netflix grid has (a-z, 0-9, space and the Croatian č ć đ š ž). */
    static String gridText(String s) {
        StringBuilder b = new StringBuilder();
        for (char c : s.toLowerCase().toCharArray())
            if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == ' ' || "čćđšž".indexOf(c) >= 0) b.append(c);
        return b.toString();
    }

    /**
     * Netflix TV search keyboard as it looks on a Croatian-region TCL (photo of the screen):
     * a top row with Space (above the first three columns) and Delete (above the last three),
     * then letters and digits in six columns; the last row has only five keys. Focus starts on Space.
     * The key a DOWN press lands on from the wide top row is not known, so after leaving it we press
     * LEFT until the first column is certain (the grid does not wrap).
     */
    static final class Grid {
        static final String[] ROWS = {"abcčćd", "đefghi", "jklmno", "pqrsšt", "uvwxyz", "ž12345", "67890"};
        int r = -1, c = 0; // r == -1: top row, c == 0 Space, c == 5 Delete

        /** D-pad presses (ending in OK) that type one character, or nothing for unknown ones. */
        List<Integer> type(char ch) {
            if (ch == ' ') return toTop(false);
            for (int row = 0; row < ROWS.length; row++) {
                int col = ROWS[row].indexOf(ch);
                if (col >= 0) return moveTo(row, col);
            }
            return new ArrayList<>();
        }

        List<Integer> delete() { return toTop(true); }

        private List<Integer> toTop(boolean del) {
            List<Integer> k = new ArrayList<>();
            if (r != -1) {
                while (r > 0) { k.add(UP); r--; }
                int col = del ? 5 : 0;
                while (c < col) { k.add(RIGHT); c++; }
                while (c > col) { k.add(LEFT); c--; }
                k.add(UP);
                r = -1;
            } else if (del && c == 0) { k.add(RIGHT); c = 5; }
            else if (!del && c == 5) { k.add(LEFT); c = 0; }
            k.add(OK);
            return k;
        }

        private List<Integer> moveTo(int row, int col) {
            List<Integer> k = new ArrayList<>();
            if (r == -1) {
                k.add(DOWN);
                for (int i = 0; i < 5; i++) k.add(LEFT);
                r = 0; c = 0;
            }
            boolean verticalFirst = r == ROWS.length - 1; // the short last row has no sixth key
            if (verticalFirst) vertical(k, row);
            while (c < col) { k.add(RIGHT); c++; }
            while (c > col) { k.add(LEFT); c--; }
            if (!verticalFirst) vertical(k, row);
            k.add(OK);
            return k;
        }

        private void vertical(List<Integer> k, int row) {
            while (r < row) { k.add(DOWN); r++; }
            while (r > row) { k.add(UP); r--; }
        }
    }

    final Grid grid = new Grid();

    /** Auto: the TV's own keyboard when it asked for one, otherwise Netflix's on-screen grid. */
    static int resolve(int mode, boolean imeActive, String foregroundApp) {
        if (mode != AUTO) return mode;
        if (foregroundApp != null && foregroundApp.toLowerCase().contains("netflix")) return GRID;
        return imeActive ? TEXT : GRID;
    }

    /** Netflix drops a key that follows a move too closely, so leave time before every OK. */
    private static void press(List<Integer> keys, Sink out) throws Exception {
        for (int i = 0; i < keys.size(); i++) {
            int k = keys.get(i);
            out.key(k);
            boolean nextIsOk = i + 1 < keys.size() && keys.get(i + 1) == OK;
            out.pause(k == OK ? 320 : nextIsOk ? 300 : 200);
        }
    }

    void append(int mode, String s, Sink out) throws Exception {
        if (s.isEmpty()) return;
        if (mode == TEXT) { out.text(s); return; }
        if (mode == GRID) {
            for (char ch : gridText(s).toCharArray()) press(grid.type(ch), out);
            return;
        }
        for (char ch : plain(s).toCharArray()) {
            int k = keyFor(ch);
            if (k > 0) { out.key(k); out.pause(90); }
        }
    }

    void delete(int mode, int n, Sink out) throws Exception {
        for (int i = 0; i < n; i++) {
            if (mode == GRID) press(grid.delete(), out);
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

    void resetGrid() { grid.r = -1; grid.c = 0; }
}
