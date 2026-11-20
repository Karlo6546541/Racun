/* Moji Računi — glavna logika aplikacije */
(function () {
  'use strict';

  var P = window.RacunParser;
  // Tesseract.js i hrvatski jezik su spremljeni u aplikaciji (vendor/), pa čitanje radi i bez interneta
  var OCR_BASE = new URL('vendor/tesseract/', location.href).href;
  var SOON_DAYS = 30;

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  // ---------------------------------------------------------------- baza (IndexedDB)
  var dbPromise = new Promise(function (resolve, reject) {
    var req = indexedDB.open('moji-racuni', 1);
    req.onupgradeneeded = function () {
      req.result.createObjectStore('receipts', { keyPath: 'id' });
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });

  function tx(mode, fn) {
    return dbPromise.then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction('receipts', mode);
        var store = t.objectStore('receipts');
        var result = fn(store);
        t.oncomplete = function () { resolve(result instanceof IDBRequest ? result.result : undefined); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('Spremanje nije uspjelo')); };
      });
    });
  }
  var db = {
    all: function () { return tx('readonly', function (s) { return s.getAll(); }); },
    get: function (id) { return tx('readonly', function (s) { return s.get(id); }); },
    put: function (r) { return tx('readwrite', function (s) { s.put(r); }); },
    del: function (id) { return tx('readwrite', function (s) { s.delete(id); }); }
  };

  // ---------------------------------------------------------------- pomoćne funkcije
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    var p = iso.split('-');
    return Number(p[2]) + '. ' + Number(p[1]) + '. ' + p[0] + '.';
  }
  function fmtMoney(n) {
    if (n == null || n === '' || isNaN(n)) return '';
    return Number(n).toLocaleString('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }
  function daysBetween(fromIso, toIso) {
    var a = Date.UTC.apply(null, fromIso.split('-').map(function (v, i) { return i === 1 ? v - 1 : +v; }));
    var b = Date.UTC.apply(null, toIso.split('-').map(function (v, i) { return i === 1 ? v - 1 : +v; }));
    return Math.round((b - a) / 86400000);
  }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  function humanLeft(days) {
    if (days > 60) {
      var months = Math.floor(days / 30.44);
      if (months >= 24 && months % 12 === 0) return (months / 12) + ' ' + plural(months / 12, 'godina', 'godine', 'godina');
      return months + ' ' + plural(months, 'mjesec', 'mjeseca', 'mjeseci');
    }
    return days + ' ' + plural(days, 'dan', 'dana', 'dana');
  }

  /** Stanje garancije: none | ok | soon | expired */
  function warrantyState(r) {
    if (!r.warrantyUntil) return { key: 'none', cls: 'none', label: 'Bez garancije', days: null };
    var left = daysBetween(today(), r.warrantyUntil);
    if (left < 0) return { key: 'expired', cls: 'bad', label: 'Garancija istekla', days: left };
    if (left <= SOON_DAYS) {
      return { key: 'soon', cls: 'warn', label: left === 0 ? 'Ističe danas!' : 'Ističe za ' + humanLeft(left), days: left };
    }
    return { key: 'ok', cls: 'ok', label: 'Vrijedi još ' + humanLeft(left), days: left };
  }

  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2800);
  }

  var urlCache = new Map();
  function blobUrl(r) {
    if (!r.image) return null;
    if (!urlCache.has(r.id)) urlCache.set(r.id, URL.createObjectURL(r.image));
    return urlCache.get(r.id);
  }
  function dropUrl(id) {
    if (urlCache.has(id)) { URL.revokeObjectURL(urlCache.get(id)); urlCache.delete(id); }
  }

  // ---------------------------------------------------------------- navigacija
  var state = { view: 'list', filter: 'all', query: '', editing: null, draftImage: null, ocrRun: 0 };

  function show(view, title) {
    state.view = view;
    $$('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + view; });
    $('#backBtn').hidden = view === 'list';
    $('#title').textContent = title || 'Moji Računi';
    window.scrollTo(0, 0);
  }

  function showList() { show('list'); renderList(); }

  // Svaki zaslon osim popisa dodaje se u povijest, pa radi i sistemski gumb "natrag".
  function pushView(extra) { history.pushState(Object.assign({ view: state.view }, extra), '', '#' + state.view); }

  $('#backBtn').addEventListener('click', function () { history.back(); });
  window.addEventListener('popstate', function (e) {
    state.ocrRun++; // prekini eventualno čitanje računa
    var s = e.state;
    if (s && s.view === 'detail') openDetail(s.id, 'none');
    else showList();
  });

  // ---------------------------------------------------------------- popis računa
  function renderList() {
    db.all().then(function (all) {
      all.sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt; });

      // Upozorenje za garancije koje uskoro ističu
      var soon = all.filter(function (r) { return warrantyState(r).key === 'soon'; });
      var alertBox = $('#alertBox');
      if (soon.length) {
        alertBox.hidden = false;
        alertBox.innerHTML = '⚠️ ' + (soon.length === 1
          ? 'Garancija za <b>' + esc(soon[0].item || soon[0].store || 'jedan račun') + '</b> uskoro ističe.'
          : soon.length + ' garancije uskoro ističu.') + ' Ako nešto ne radi, sad je vrijeme za reklamaciju.';
      } else {
        alertBox.hidden = true;
      }

      $('#listControls').hidden = all.length === 0;
      $('#empty').hidden = all.length !== 0;

      var q = state.query.trim().toLowerCase();
      var items = all.filter(function (r) {
        var ws = warrantyState(r).key;
        if (state.filter === 'active' && ws !== 'ok' && ws !== 'soon') return false;
        if (state.filter === 'soon' && ws !== 'soon') return false;
        if (state.filter === 'expired' && ws !== 'expired') return false;
        if (!q) return true;
        return [r.item, r.store, r.note, r.category, r.ocrText, fmtDate(r.date)].join(' ').toLowerCase().indexOf(q) !== -1;
      });

      var list = $('#list');
      if (all.length && !items.length) {
        list.innerHTML = '<li class="empty muted">Nema računa za ovaj odabir.</li>';
        return;
      }
      list.innerHTML = items.map(function (r) {
        var ws = warrantyState(r);
        var url = blobUrl(r);
        var thumb = url ? '<img class="thumb" src="' + url + '" alt="">' : '<div class="thumb">🧾</div>';
        var title = r.item || r.store || 'Račun';
        var sub = [r.item ? r.store : '', fmtDate(r.date)].filter(Boolean).join(' · ');
        return '<li class="card" data-id="' + esc(r.id) + '" tabindex="0" role="button">' + thumb +
          '<div class="card-body"><div class="card-title">' + esc(title) + '</div>' +
          '<div class="card-sub">' + esc(sub) + '</div>' +
          '<span class="badge ' + ws.cls + '">' + esc(ws.label) + '</span></div>' +
          '<div class="card-price">' + esc(fmtMoney(r.total)) + '</div></li>';
      }).join('');
    });
  }

  $('#list').addEventListener('click', function (e) {
    var card = e.target.closest('.card');
    if (card) openDetail(card.dataset.id);
  });
  $('#list').addEventListener('keydown', function (e) {
    var card = e.target.closest('.card');
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetail(card.dataset.id); }
  });
  $('#search').addEventListener('input', function (e) { state.query = e.target.value; renderList(); });
  $('#filterChips').addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    state.filter = chip.dataset.filter;
    $$('#filterChips .chip').forEach(function (c) { c.classList.toggle('active', c === chip); });
    renderList();
  });

  // ---------------------------------------------------------------- slika
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve(img); URL.revokeObjectURL(url); };
      img.onerror = function () { reject(new Error('Ne mogu otvoriti sliku')); URL.revokeObjectURL(url); };
      img.src = url;
    });
  }
  function drawScaled(img, max) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    var scale = Math.min(1, max / Math.max(iw, ih));
    var c = document.createElement('canvas');
    c.width = Math.round(iw * scale);
    c.height = Math.round(ih * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  /** Smanjena slika za spremanje (štedi prostor na mobitelu). */
  function compress(img) {
    var c = drawScaled(img, 1600);
    return new Promise(function (resolve) { c.toBlob(resolve, 'image/jpeg', 0.75); });
  }
  /** Crno-bijela slika s pojačanim kontrastom za bolje čitanje teksta. */
  function prepareForOcr(img) {
    var c = drawScaled(img, 2600);
    var ctx = c.getContext('2d');
    var d = ctx.getImageData(0, 0, c.width, c.height);
    var px = d.data;
    for (var i = 0; i < px.length; i += 4) {
      var g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      g = Math.max(0, Math.min(255, (g - 128) * 1.5 + 140));
      px[i] = px[i + 1] = px[i + 2] = g;
    }
    ctx.putImageData(d, 0, 0);
    return c;
  }

  // ---------------------------------------------------------------- OCR (Tesseract.js)
  var tesseractLoad = null;
  var workerPromise = null;
  var ocrProgress = function () {};
  function getWorker() {
    if (!tesseractLoad) {
      tesseractLoad = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = OCR_BASE + 'tesseract.min.js';
        s.onload = resolve;
        s.onerror = function () { tesseractLoad = null; reject(new Error('load')); };
        document.head.appendChild(s);
      });
    }
    if (!workerPromise) {
      workerPromise = tesseractLoad.then(function () {
        return window.Tesseract.createWorker('hrv', 1, {
          workerPath: OCR_BASE + 'worker.min.js',
          corePath: OCR_BASE,
          langPath: OCR_BASE + 'lang',
          logger: function (m) { ocrProgress(m); }
        });
      }).catch(function (e) { workerPromise = null; throw e; });
    }
    return workerPromise;
  }

  function runOcr(img, runId) {
    var status = $('#ocrStatus'), bar = $('#ocrBar'), text = $('#ocrText');
    status.hidden = false;
    $('#ocrDone').hidden = true;
    bar.style.width = '5%';
    text.textContent = 'Pripremam čitanje računa…';
    ocrProgress = function (m) {
      if (runId !== state.ocrRun) return;
      if (m.status === 'recognizing text') {
        text.textContent = 'Čitam račun… ' + Math.round(m.progress * 100) + '%';
        bar.style.width = (30 + m.progress * 70) + '%';
      } else if (/loading|initializ/.test(m.status)) {
        text.textContent = 'Pripremam čitanje računa…';
        bar.style.width = (5 + (m.progress || 0) * 25) + '%';
      }
    };

    getWorker()
      .then(function (worker) { return worker.recognize(prepareForOcr(img)); })
      .then(function (res) {
        if (runId !== state.ocrRun) return;
        var raw = res.data.text || '';
        var found = P.parseReceipt(raw);
        var f = $('#receiptForm');
        // Popuni samo prazna polja — korisnik je možda već nešto upisao
        if (found.store && !f.store.value) f.store.value = found.store;
        if (found.date && (!f.date.value || f.date.dataset.auto)) { f.date.value = found.date; delete f.date.dataset.auto; }
        if (found.total != null && !f.total.value) f.total.value = String(found.total.toFixed(2)).replace('.', ',');
        state.ocrText = raw;
        $('#ocrRaw').textContent = raw;
        $('#ocrRawWrap').hidden = !raw.trim();
        status.hidden = true;
        var done = $('#ocrDone');
        var got = [found.store, found.date, found.total != null, state.qrFound].filter(Boolean).length;
        done.hidden = false;
        if (got) {
          done.className = 'hint ok';
          done.textContent = state.qrFound
            ? '✅ QR kod pročitan: datum i iznos su točni. Provjerite ostalo.'
            : '✅ Račun pročitan. Provjerite podatke i ispravite ako treba.';
        } else {
          done.className = 'hint warn';
          done.textContent = 'Nisam uspio pročitati račun. Upišite podatke ručno — slika je svejedno spremljena.';
        }
        updateWarrantyResult();
        if (!f.item.value) f.item.focus({ preventScroll: true });
      })
      .catch(function (e) {
        if (runId !== state.ocrRun) return;
        status.hidden = true;
        var done = $('#ocrDone');
        done.hidden = false;
        done.className = 'hint warn';
        done.textContent = 'Automatsko čitanje nije uspjelo. Upišite podatke ručno — slika je spremljena.';
        console.error(e);
      });
  }

  // ---------------------------------------------------------------- obrazac
  var form = $('#receiptForm');
  var warrantyMonths = 24;

  function setWarrantyChip(months) {
    warrantyMonths = months;
    $$('#warrantyChips .chip').forEach(function (c) { c.classList.toggle('active', c.dataset.months === String(months)); });
    $('#customWarranty').hidden = months !== 'custom';
    updateWarrantyResult();
  }

  function computedWarrantyUntil() {
    if (warrantyMonths === 'custom') return form.warrantyUntil.value || null;
    return P.addMonths(form.date.value, Number(warrantyMonths));
  }

  function updateWarrantyResult() {
    var until = computedWarrantyUntil();
    var el = $('#warrantyResult');
    if (warrantyMonths === 0 || warrantyMonths === '0') { el.textContent = ''; return; }
    el.textContent = until ? '🛡️ Garancija vrijedi do ' + fmtDate(until) : '';
  }

  $('#warrantyChips').addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    var m = chip.dataset.months;
    setWarrantyChip(m === 'custom' ? 'custom' : Number(m));
    if (m === 'custom' && !form.warrantyUntil.value) form.warrantyUntil.focus();
  });
  form.date.addEventListener('input', function () { delete form.date.dataset.auto; updateWarrantyResult(); });
  form.warrantyUntil.addEventListener('input', updateWarrantyResult);

  function openForm(record, imageFile) {
    state.editing = record || null;
    state.draftImage = record ? record.image || null : null;
    state.ocrText = record ? record.ocrText || '' : '';
    state.ocrRun++;
    form.reset();
    $('#ocrDone').hidden = true;
    $('#ocrStatus').hidden = true;
    $('#ocrRaw').textContent = state.ocrText;
    $('#ocrRawWrap').hidden = !state.ocrText;

    if (record) {
      form.item.value = record.item || '';
      form.store.value = record.store || '';
      form.date.value = record.date || '';
      form.total.value = record.total != null ? String(record.total.toFixed(2)).replace('.', ',') : '';
      form.category.value = record.category || '';
      form.note.value = record.note || '';
      var preset = [0, 12, 24, 36, 60].indexOf(record.warrantyMonths) !== -1 && record.warrantyMonths !== null;
      if (preset) setWarrantyChip(record.warrantyMonths);
      else { form.warrantyUntil.value = record.warrantyUntil || ''; setWarrantyChip(record.warrantyUntil ? 'custom' : 0); }
    } else {
      form.date.value = today();
      form.date.dataset.auto = '1';
      setWarrantyChip(24);
    }

    var wrap = $('#formImageWrap');
    if (state.draftImage) {
      wrap.hidden = false;
      $('#formImage').src = URL.createObjectURL(state.draftImage);
    } else {
      wrap.hidden = true;
    }

    show('form', record ? 'Uredi račun' : 'Novi račun');
    pushView();

    if (imageFile) handleImage(imageFile);
  }

  var scriptCache = {};
  function loadScript(src) {
    if (!scriptCache[src]) {
      scriptCache[src] = new Promise(function (resolve, reject) {
        var el = document.createElement('script');
        el.src = src; el.onload = resolve;
        el.onerror = function () { delete scriptCache[src]; reject(new Error('load')); };
        document.head.appendChild(el);
      });
    }
    return scriptCache[src];
  }

  /** Ima li tekst izgled računa? (ignoriramo QR kodove koji nisu fiskalni) */
  function isReceiptQr(text) { return !!(text && P.parseFiscalQr(text)); }

  function scaledCanvas(c, max) {
    var sc = Math.min(1, max / Math.max(c.width, c.height));
    if (sc === 1) return c;
    var o = document.createElement('canvas');
    o.width = Math.round(c.width * sc); o.height = Math.round(c.height * sc);
    o.getContext('2d').drawImage(c, 0, 0, o.width, o.height);
    return o;
  }

  /**
   * Traži fiskalni QR kod. Najprije ugrađeni čitač preglednika (brz i otporan na loše slike),
   * zatim jsQR na nekoliko veličina — dekoder često bolje radi na manjoj slici nego na velikoj.
   */
  function readQr(canvases) {
    var native = null;
    if ('BarcodeDetector' in window) {
      try { native = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { native = null; }
    }
    var viaNative = native
      ? canvases.reduce(function (chain, c) {
          return chain.then(function (found) {
            if (found) return found;
            return native.detect(c).then(function (codes) {
              for (var i = 0; i < codes.length; i++) if (isReceiptQr(codes[i].rawValue)) return codes[i].rawValue;
              return null;
            }).catch(function () { return null; });
          });
        }, Promise.resolve(null))
      : Promise.resolve(null);

    return viaNative.then(function (found) {
      if (found) return found;
      return loadScript(OCR_BASE.replace('tesseract/', 'jsQR.js')).then(function () {
        var tried = {}, jobs = [];
        canvases.forEach(function (c, ci) {
          [1000, 800, 1400, 600, 1800].forEach(function (max) {
            var sc = scaledCanvas(c, max), key = ci + ':' + sc.width + 'x' + sc.height;
            if (tried[key]) return;
            tried[key] = 1; jobs.push(sc);
          });
        });
        // Svaki pokušaj u zasebnom koraku da se zaslon ne zamrzne
        return jobs.reduce(function (chain, c) {
          return chain.then(function (res) {
            if (res) return res;
            return new Promise(function (resolve) {
              setTimeout(function () {
                var d = c.getContext('2d').getImageData(0, 0, c.width, c.height);
                var code = window.jsQR(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' });
                resolve(code && isReceiptQr(code.data) ? code.data : null);
              }, 0);
            });
          });
        }, Promise.resolve(null));
      }).catch(function () { return null; });
    });
  }

  function canvasFromImageData(id) {
    var c = document.createElement('canvas');
    c.width = id.width; c.height = id.height;
    c.getContext('2d').putImageData(new ImageData(id.data, id.width, id.height), 0, 0);
    return c;
  }
  function toJpeg(canvas) {
    return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', 0.8); });
  }

  function handleImage(file) {
    var runId = state.ocrRun;
    state.qrFound = false;
    $('#cropToggle').hidden = true;
    loadImage(file).then(function (img) {
      if (runId !== state.ocrRun) return;
      var full = drawScaled(img, 3000);

      // 1) Izreži račun s pozadine (ako ga uspijemo pronaći)
      var cropped = null;
      try {
        var fd = full.getContext('2d').getImageData(0, 0, full.width, full.height);
        var res = window.RacunScan.cropReceipt(fd, 2600);
        if (res) cropped = canvasFromImageData(res.cropped);
      } catch (e) { console.error(e); }
      var work = cropped || full;

      return Promise.all([toJpeg(drawScaled(work, 1600)), cropped ? toJpeg(drawScaled(full, 1600)) : null, readQr(cropped ? [cropped, full] : [full])])
        .then(function (r) {
          if (runId !== state.ocrRun) return;
          state.draftImage = r[0];
          state.originalImage = r[1];
          $('#formImageWrap').hidden = false;
          $('#formImage').src = URL.createObjectURL(r[0]);
          if (cropped) {
            var t = $('#cropToggle');
            t.hidden = false; t.dataset.mode = 'cropped';
            t.textContent = '✂️ Račun izrezan s pozadine · Prikaži original';
          }

          // 2) QR kod: točan datum i iznos
          var qr = r[2] ? P.parseFiscalQr(r[2]) : null;
          if (qr) {
            state.qrFound = true;
            if (qr.date) { form.date.value = qr.date; delete form.date.dataset.auto; }
            if (qr.total != null) form.total.value = qr.total.toFixed(2).replace('.', ',');
            updateWarrantyResult();
          }

          // 3) Čitanje teksta (naziv trgovine i sve što QR nije dao)
          runOcr(work, runId);
        });
    }).catch(function (e) {
      console.error(e);
      toast('Ne mogu otvoriti tu sliku. Pokušajte ponovno.');
    });
  }

  $('#cropToggle').addEventListener('click', function () {
    var t = $('#cropToggle');
    if (!state.originalImage) return;
    var toOriginal = t.dataset.mode === 'cropped';
    var tmp = state.draftImage; state.draftImage = state.originalImage; state.originalImage = tmp;
    t.dataset.mode = toOriginal ? 'original' : 'cropped';
    t.textContent = toOriginal ? '🖼️ Prikazan original · Izreži račun' : '✂️ Račun izrezan s pozadine · Prikaži original';
    $('#formImage').src = URL.createObjectURL(state.draftImage);
  });

  function onPicked(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (file) openForm(null, file);
  }
  $('#cameraInput').addEventListener('change', onPicked);
  $('#galleryInput').addEventListener('change', onPicked);
  $('#manualBtn').addEventListener('click', function () { openForm(null); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.date.value) { toast('Upišite datum kupnje'); form.date.focus(); return; }
    var totalStr = form.total.value.trim();
    var total = totalStr ? P.parseAmount(totalStr.replace(/[€\s]|eur/gi, '')) : null;
    if (totalStr && total === null) { toast('Cijena nije ispravna (npr. 129,99)'); form.total.focus(); return; }
    if (warrantyMonths === 'custom' && !form.warrantyUntil.value) {
      toast('Upišite do kada vrijedi garancija'); form.warrantyUntil.focus(); return;
    }

    var old = state.editing;
    var rec = {
      id: old ? old.id : (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
      createdAt: old ? old.createdAt : Date.now(),
      updatedAt: Date.now(),
      item: form.item.value.trim(),
      store: form.store.value.trim(),
      date: form.date.value,
      total: total,
      category: form.category.value,
      note: form.note.value.trim(),
      warrantyMonths: warrantyMonths === 'custom' ? null : warrantyMonths,
      warrantyUntil: warrantyMonths === 0 ? null : computedWarrantyUntil(),
      image: state.draftImage || null,
      ocrText: state.ocrText || ''
    };
    db.put(rec).then(function () {
      dropUrl(rec.id);
      toast(old ? 'Promjene spremljene ✅' : 'Račun spremljen ✅');
      history.back(); // natrag na popis ili na detalje (koji se ponovno učitaju)
    }).catch(function (err) {
      console.error(err);
      toast('Spremanje nije uspjelo. Je li mobitel pun?');
    });
  });

  // ---------------------------------------------------------------- detalji
  /** nav: 'push' (zadano) ili 'none' kad dolazimo gumbom natrag */
  function openDetail(id, nav) {
    db.get(id).then(function (r) {
      if (!r) { showList(); return; }
      var ws = warrantyState(r);
      var url = blobUrl(r);
      var box;
      if (ws.key === 'none') {
        box = '<div class="warranty-box none">Za ovaj račun nije upisana garancija.</div>';
      } else {
        var total = daysBetween(r.date, r.warrantyUntil) || 1;
        var pct = Math.max(0, Math.min(100, (ws.days / total) * 100));
        box = '<div class="warranty-box ' + ws.cls + '"><div class="big">🛡️ ' + esc(ws.label) + '</div>' +
          '<div>Garancija vrijedi do <b>' + fmtDate(r.warrantyUntil) + '</b></div>' +
          '<div class="meter"><div style="width:' + pct.toFixed(0) + '%"></div></div></div>';
      }
      var rows = [
        ['Trgovina', r.store], ['Datum kupnje', fmtDate(r.date)], ['Cijena', fmtMoney(r.total)],
        ['Kategorija', r.category], ['Bilješka', r.note]
      ].filter(function (x) { return x[1]; });

      $('#view-detail').innerHTML =
        (url ? '<img class="detail-img" id="detailImg" src="' + url + '" alt="Slika računa">' : '') +
        '<h2 class="detail-head">' + esc(r.item || r.store || 'Račun') + '</h2>' + box +
        '<dl class="facts">' + rows.map(function (x) { return '<dt>' + x[0] + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('') + '</dl>' +
        '<div class="detail-actions">' +
        (url ? '<button class="btn btn-primary" id="shareBtn">📤 Pošalji račun (za reklamaciju)</button>' : '') +
        '<button class="btn btn-secondary" id="editBtn">✏️ Uredi</button>' +
        '<button class="btn btn-danger" id="deleteBtn">🗑️ Obriši račun</button></div>';

      show('detail', 'Račun');
      if (nav !== 'none') pushView({ id: r.id });

      var img = $('#detailImg');
      if (img) img.addEventListener('click', function () { $('#viewerImg').src = url; $('#viewer').showModal(); });
      $('#editBtn').addEventListener('click', function () { openForm(r); });
      $('#deleteBtn').addEventListener('click', function () {
        if (!confirm('Sigurno obrisati ovaj račun? Ovo se ne može vratiti.')) return;
        db.del(r.id).then(function () { dropUrl(r.id); toast('Račun obrisan'); history.back(); });
      });
      var share = $('#shareBtn');
      if (share) share.addEventListener('click', function () { shareReceipt(r); });
    });
  }

  function shareReceipt(r) {
    var name = (r.item || r.store || 'racun').replace(/[^\wĀ-ſ-]+/g, '_') + '_' + r.date + '.jpg';
    var text = [r.item, r.store, 'Kupljeno: ' + fmtDate(r.date), r.total != null ? 'Cijena: ' + fmtMoney(r.total) : '',
      r.warrantyUntil ? 'Garancija do: ' + fmtDate(r.warrantyUntil) : ''].filter(Boolean).join('\n');
    var file = new File([r.image], name, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Račun', text: text }).catch(function () {});
    } else {
      var a = document.createElement('a');
      a.href = blobUrl(r); a.download = name; a.click();
      toast('Slika računa preuzeta');
    }
  }

  $('#viewer').addEventListener('click', function () { $('#viewer').close(); });

  // ---------------------------------------------------------------- izbornik / sigurnosna kopija
  $('#menuBtn').addEventListener('click', function () { $('#menu').showModal(); });
  $('#closeMenu').addEventListener('click', function () { $('#menu').close(); });
  $('#menu').addEventListener('click', function (e) { if (e.target.id === 'menu') $('#menu').close(); });

  function blobToDataUrl(b) {
    return new Promise(function (resolve) {
      var fr = new FileReader(); fr.onload = function () { resolve(fr.result); }; fr.readAsDataURL(b);
    });
  }
  function dataUrlToBlob(u) { return fetch(u).then(function (r) { return r.blob(); }); }

  $('#exportBtn').addEventListener('click', function () {
    db.all().then(function (all) {
      return Promise.all(all.map(function (r) {
        var copy = Object.assign({}, r);
        return (r.image ? blobToDataUrl(r.image) : Promise.resolve(null)).then(function (d) { copy.image = d; return copy; });
      }));
    }).then(function (rows) {
      var blob = new Blob([JSON.stringify({ app: 'moji-racuni', version: 1, exportedAt: new Date().toISOString(), receipts: rows })], { type: 'application/json' });
      var name = 'moji-racuni-' + today() + '.json';
      var file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'Sigurnosna kopija računa' }).catch(function () {});
      } else {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name; a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      }
      toast('Spremljeno ' + rows.length + ' ' + plural(rows.length, 'račun', 'računa', 'računa'));
    });
  });

  $('#importInput').addEventListener('change', function (e) {
    var file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    file.text().then(function (txt) {
      var data = JSON.parse(txt);
      if (!data || !Array.isArray(data.receipts)) throw new Error('bad');
      return Promise.all(data.receipts.map(function (r) {
        if (!r || !r.id) return null;
        return (typeof r.image === 'string' ? dataUrlToBlob(r.image) : Promise.resolve(null)).then(function (b) {
          r.image = b; return db.put(r);
        });
      })).then(function () { return data.receipts.length; });
    }).then(function (n) {
      $('#menu').close();
      toast('Vraćeno ' + n + ' ' + plural(n, 'račun', 'računa', 'računa') + ' ✅');
      renderList();
    }).catch(function () { toast('Ta datoteka nije ispravna sigurnosna kopija'); });
  });

  // Instalacija na početni zaslon
  var installEvt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); installEvt = e; $('#installBtn').hidden = false;
  });
  $('#installBtn').addEventListener('click', function () {
    if (!installEvt) return;
    installEvt.prompt();
    installEvt = null; $('#installBtn').hidden = true;
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});

  // ---------------------------------------------------------------- start
  if (location.hash) history.replaceState(null, '', location.pathname);
  show('list');
  renderList();
})();
