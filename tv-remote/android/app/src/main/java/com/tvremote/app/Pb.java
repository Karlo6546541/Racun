package com.tvremote.app;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Minimal protobuf writer/reader: just varint and length-delimited fields. */
final class Pb {
    private final ByteArrayOutputStream out = new ByteArrayOutputStream();

    private void varint(long v) {
        while ((v & ~0x7FL) != 0) { out.write((int) ((v & 0x7F) | 0x80)); v >>>= 7; }
        out.write((int) v);
    }
    Pb i(int field, long v) { varint((long) field << 3); varint(v); return this; }
    Pb b(int field, byte[] v) { varint(((long) field << 3) | 2); varint(v.length); out.write(v, 0, v.length); return this; }
    Pb s(int field, String v) { return b(field, v.getBytes(StandardCharsets.UTF_8)); }
    Pb m(int field, Pb v) { return b(field, v.bytes()); }
    byte[] bytes() { return out.toByteArray(); }

    /** Message prefixed with its length as a varint, as sent on the wire. */
    byte[] framed() {
        byte[] body = bytes();
        Pb p = new Pb(); p.varint(body.length);
        byte[] head = p.bytes();
        byte[] all = new byte[head.length + body.length];
        System.arraycopy(head, 0, all, 0, head.length);
        System.arraycopy(body, 0, all, head.length, body.length);
        return all;
    }

    /** Parsed message: field number -> values (Long for varints, byte[] for nested/bytes/strings). */
    static final class Msg {
        final Map<Integer, List<Object>> f = new HashMap<>();
        boolean has(int n) { return f.containsKey(n); }
        long i(int n, long def) { List<Object> l = f.get(n); return l != null && l.get(0) instanceof Long ? (Long) l.get(0) : def; }
        byte[] b(int n) { List<Object> l = f.get(n); return l != null && l.get(0) instanceof byte[] ? (byte[]) l.get(0) : null; }
        Msg m(int n) { byte[] x = b(n); return x == null ? null : parse(x); }
    }

    static Msg parse(byte[] d) {
        Msg msg = new Msg();
        int[] pos = {0};
        while (pos[0] < d.length) {
            long tag = readVarint(d, pos);
            int field = (int) (tag >>> 3), wt = (int) (tag & 7);
            Object val;
            if (wt == 0) val = readVarint(d, pos);
            else if (wt == 2) {
                int len = (int) readVarint(d, pos);
                byte[] x = new byte[len];
                System.arraycopy(d, pos[0], x, 0, len);
                pos[0] += len; val = x;
            } else if (wt == 5) { pos[0] += 4; continue; }
            else if (wt == 1) { pos[0] += 8; continue; }
            else throw new IllegalArgumentException("wire type " + wt);
            msg.f.computeIfAbsent(field, k -> new ArrayList<>()).add(val);
        }
        return msg;
    }

    static long readVarint(byte[] d, int[] pos) {
        long r = 0; int shift = 0;
        while (true) {
            if (pos[0] >= d.length) throw new IllegalArgumentException("truncated");
            int b = d[pos[0]++] & 0xFF;
            r |= (long) (b & 0x7F) << shift;
            if ((b & 0x80) == 0) return r;
            shift += 7;
        }
    }
}
