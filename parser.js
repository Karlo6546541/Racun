/*
 * Prepoznavanje podataka s računa iz OCR teksta.
 * Radi i u pregledniku (window.RacunParser) i u Node.js (module.exports) radi testova.
 */
(function (root) {
  'use strict';

  var TOTAL_WORDS = [
    'za platiti', 'za plaćanje', 'za placanje', 'sveukupno', 'ukupno', 'ukupan iznos',
    'iznos računa', 'iznos racuna', 'total', 'suma', 'za uplatu', 'ukupno eur', 'ukupno €'
  ];

  // Riječi za koje znamo da NISU ukupan iznos
  var NOT_TOTAL_WORDS = ['pdv', 'porez', 'osnovica', 'popust', 'povrat', 'ostatak', 'vraćeno', 'vraceno', 'kusur'];

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function toIso(y, m, d) {
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
    var dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1) return null;
    return y + '-' + pad(m) + '-' + pad(d);
  }

  /** Pronađi datum kupnje. Vraća 'YYYY-MM-DD' ili null. */
  function findDate(text) {
    // OCR često zamijeni nulu slovom O
    var t = text.replace(/(\d)[Oo]/g, function (_, d) { return d + '0'; })
      .replace(/[Oo](\d)/g, function (_, d) { return '0' + d; });
    var found = [];
    var m;
    // dd.mm.yyyy  dd/mm/yyyy  dd-mm-yyyy  (+ dd.mm.yy)
    var re1 = /(\d{1,2})\s?[.\/\-]\s?(\d{1,2})\s?[.\/\-]\s?(\d{4}|\d{2})(?!\d)/g;
    while ((m = re1.exec(t))) {
      var iso = toIso(parseInt(m[3], 10), parseInt(m[2], 10), parseInt(m[1], 10));
      if (iso) found.push(iso);
    }
    // yyyy-mm-dd
    var re2 = /(20\d{2})[.\/\-](\d{1,2})[.\/\-](\d{1,2})(?!\d)/g;
    while ((m = re2.exec(t))) {
      var iso2 = toIso(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
      if (iso2) found.push(iso2);
    }
    if (!found.length) return null;
    // Odbaci datume u budućnosti (npr. "vrijedi do"), uzmi prvi preostali
    var today = new Date().toISOString().slice(0, 10);
    var past = found.filter(function (d) { return d <= today; });
    return (past.length ? past : found)[0];
  }

  /** Pretvori tekst iznosa ("1.234,56", "12,99", "12.99") u broj. */
  function parseAmount(s) {
    s = s.replace(/\s/g, '');
    if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(,\d{3})+\.\d{2}$/.test(s)) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  var AMOUNT_RE = /(\d{1,3}(?:[.\s]\d{3})*[.,]\s?\d{2}|\d+[.,]\s?\d{2})(?!\d)/g;

  function amountsIn(line) {
    var out = [];
    var m;
    AMOUNT_RE.lastIndex = 0;
    while ((m = AMOUNT_RE.exec(line))) {
      var v = parseAmount(m[1]);
      if (v !== null && v > 0 && v < 1000000) out.push(v);
    }
    return out;
  }

  /** Pronađi ukupan iznos računa. Vraća broj ili null. */
  function findTotal(text) {
    var lines = text.split(/\r?\n/);
    var candidates = [];
    for (var i = 0; i < lines.length; i++) {
      var low = lines[i].toLowerCase();
      var isTotal = TOTAL_WORDS.some(function (w) { return low.indexOf(w) !== -1; });
      var isNot = NOT_TOTAL_WORDS.some(function (w) { return low.indexOf(w) !== -1; });
      if (!isTotal || isNot) continue;
      var nums = amountsIn(lines[i]);
      // ponekad je iznos u sljedećem retku
      if (!nums.length && i + 1 < lines.length) nums = amountsIn(lines[i + 1]);
      if (nums.length) candidates.push(nums[nums.length - 1]);
    }
    if (candidates.length) return Math.max.apply(null, candidates);
    // Rezerva: najveći iznos na računu
    var all = [];
    lines.forEach(function (l) {
      if (NOT_TOTAL_WORDS.some(function (w) { return l.toLowerCase().indexOf(w) !== -1; })) return;
      all = all.concat(amountsIn(l));
    });
    return all.length ? Math.max.apply(null, all) : null;
  }

  /** Pronađi naziv trgovine (obično na vrhu računa). */
  function findStore(text) {
    var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); })
      .filter(function (l) { return l.replace(/[^A-Za-zČĆŽŠĐčćžšđ]/g, '').length >= 3; });
    var top = lines.slice(0, 8);
    var company = top.filter(function (l) { return /\b(d\.?\s?o\.?\s?o|d\.?\s?d\.?|j\.?\s?d\.?\s?o\.?\s?o|obrt)\b/i.test(l); })[0];
    var pick = company || top[0];
    if (!pick) return '';
    return pick.replace(/[|_*#~=<>]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 60);
  }

  function parseReceipt(text) {
    text = text || '';
    return { store: findStore(text), date: findDate(text), total: findTotal(text) };
  }

  /** Datum isteka garancije (u mjesecima od datuma kupnje). */
  function addMonths(iso, months) {
    if (!iso || !months) return null;
    var p = iso.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1 + months, p[2]));
    // npr. 31.1. + 1 mj. -> zadnji dan veljače
    if (d.getUTCDate() !== p[2]) d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
    return d.toISOString().slice(0, 10);
  }

  /**
   * Fiskalni QR kod hrvatskog računa je poveznica poput
   * https://porezna-uprava.gov.hr/rn?jir=...&datv=20250314_1742&izn=329,99
   * Vraća { date, total } ili null ako tekst nije takav kod.
   */
  function parseFiscalQr(text) {
    if (!text || !/porezna-uprava|[?&](jir|zki)=/i.test(text)) return null;
    var q = text.indexOf('?') === -1 ? '' : text.slice(text.indexOf('?') + 1);
    var params = {};
    q.split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) { try { params[kv.slice(0, i).toLowerCase()] = decodeURIComponent(kv.slice(i + 1)); } catch (e) { params[kv.slice(0, i).toLowerCase()] = kv.slice(i + 1); } }
    });
    var out = { date: null, total: null };
    var m = /^(\d{4})(\d{2})(\d{2})/.exec((params.datv || '').replace(/\D/g, '').length >= 8 ? (params.datv || '').replace(/\D/g, '') : '');
    if (m) out.date = toIso(+m[1], +m[2], +m[3]);
    if (params.izn) {
      var n = parseAmount(params.izn.replace(/[^\d.,]/g, ''));
      if (n !== null) out.total = n;
    }
    return out.date || out.total != null ? out : null;
  }

  var api = {
    parseFiscalQr: parseFiscalQr,
    parseReceipt: parseReceipt, findDate: findDate, findTotal: findTotal,
    findStore: findStore, parseAmount: parseAmount, addMonths: addMonths
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RacunParser = api;
})(this);
