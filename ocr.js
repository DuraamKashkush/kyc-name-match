/*
 * ocr.js — reading a document image to PRE-FILL the form.
 *
 * Read this first, because the boundary matters more than the code:
 *
 *   This file is not part of the decision path and must never become part of
 *   it. engine.js does not reference it, does not know it exists, and produces
 *   identical output whether or not it has been loaded. There is a test that
 *   asserts exactly that.
 *
 * The reason is not fastidiousness. The whole claim of this tool is that a
 * verdict is deterministic, reproducible and explainable rule by rule. OCR is
 * probabilistic: it is a machine's best guess at what some pixels say. The
 * moment a misread character can move a verdict, that claim is gone. So OCR
 * proposes values, a human accepts them, and the engine runs on what the human
 * accepted — which is also, not coincidentally, how document capture works in a
 * real verification queue.
 *
 * One part of a document can prove its own transcription: the machine-readable
 * zone, because ICAO Doc 9303 gives every field a check digit. A misread there
 * fails arithmetic and is reported rather than believed. That is why fields
 * derived from a verified MRZ are treated differently from anything read off
 * the printed page, which nothing can validate.
 *
 * Tesseract is loaded lazily from vendor/ on first use, so none of its 18 MB is
 * fetched unless someone actually asks to read an image. Nothing is uploaded:
 * the file is read into a canvas in the browser and never leaves it.
 */

var OCR = (function () {
  'use strict';

  var VENDOR = 'vendor/tesseract/';
  var MRZ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';

  /* Letters an OCR engine confuses with digits, and the reverse. Applied ONLY
   * where the MRZ layout says the position must be one or the other, which is
   * what makes this deterministic rather than a guess. */
  var TO_DIGIT = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5',
                   B: '8', G: '6', T: '7', A: '4' };
  var TO_ALPHA = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B', '6': 'G',
                   '4': 'A' };

  /* Characters that commonly come back in place of the MRZ filler. */
  var FILLER_JUNK = /[«»‹›¢<>\[\]{}()|_\-—–.,:;'"`~^*]/g;

  /* ISO 3166 alpha-3 (what an MRZ carries) to the alpha-2 codes this form uses.
   * Only the countries the form offers, plus UTO — the fictional state ICAO
   * uses in its own specimen documents. */
  var ALPHA3 = {
    ISR: 'IL', JOR: 'JO', PSE: 'PS', EGY: 'EG', LBN: 'LB', SYR: 'SY',
    IRQ: 'IQ', SAU: 'SA', ARE: 'AE', MAR: 'MA', TUN: 'TN', DZA: 'DZ',
    UTO: 'OTHER',
  };

  var DOC_CODE = { P: 'passport', I: 'national_id', A: 'residence_permit',
                   C: 'national_id', D: 'drivers_license' };

  var worker = null;
  var loading = null;

  /* The MRZ layout tables. Global in the browser, required in Node so the
   * deterministic half of this file (reconstruction and correction) can be
   * tested without a canvas or a worker. */
  function mrzLib() {
    if (typeof MRZ !== 'undefined') return MRZ;
    if (typeof module !== 'undefined' && module.exports) {
      try { return require('./mrz.js'); } catch (e) { return null; }
    }
    return null;
  }

  /* ── Loading Tesseract ─────────────────────────────────────────────────── */

  function injectScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }

  /* Nothing here runs until the first call. */
  function ensureWorker(onProgress) {
    if (worker) return Promise.resolve(worker);
    if (loading) return loading;

    loading = (function () {
      var step = typeof Tesseract === 'undefined'
        ? injectScript(VENDOR + 'tesseract.min.js')
        : Promise.resolve();

      return step.then(function () {
        if (typeof Tesseract === 'undefined') {
          throw new Error('Tesseract did not load from ' + VENDOR);
        }
        return Tesseract.createWorker('eng', 1, {
          workerPath: VENDOR + 'worker.min.js',
          corePath: VENDOR,
          langPath: VENDOR,
          logger: function (m) {
            if (onProgress && m && typeof m.progress === 'number') {
              onProgress(m.status, m.progress);
            }
          },
        });
      }).then(function (w) {
        worker = w;
        return w;
      }).catch(function (e) {
        loading = null;       // let a later attempt retry cleanly
        throw e;
      });
    })();

    return loading;
  }

  /* ── Image handling ────────────────────────────────────────────────────── */

  function fileToImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) {
        reject(new Error('That is not an image file.'));
        return;
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('The image could not be decoded.'));
      };
      img.src = url;
    });
  }

  /* Greyscale and stretch contrast. Tesseract does its own binarisation, but a
   * phone photo of a document is usually low-contrast enough to be worth
   * helping. Also caps the long edge — beyond about 2000px accuracy stops
   * improving and everything just gets slower. */
  function preprocess(img, maxEdge) {
    maxEdge = maxEdge || 2000;
    var scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    var w = Math.round(img.width * scale), h = Math.round(img.height * scale);

    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    var d = ctx.getImageData(0, 0, w, h);
    var p = d.data;
    var min = 255, max = 0, i;
    for (i = 0; i < p.length; i += 4) {
      var g = (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) | 0;
      p[i] = p[i + 1] = p[i + 2] = g;
      if (g < min) min = g;
      if (g > max) max = g;
    }
    var range = Math.max(1, max - min);
    for (i = 0; i < p.length; i += 4) {
      var v = ((p[i] - min) * 255 / range) | 0;
      p[i] = p[i + 1] = p[i + 2] = v < 0 ? 0 : (v > 255 ? 255 : v);
    }
    ctx.putImageData(d, 0, 0);
    return c;
  }

  function cropBottom(canvas, fraction) {
    var h = Math.round(canvas.height * fraction);
    var c = document.createElement('canvas');
    c.width = canvas.width; c.height = h;
    c.getContext('2d').drawImage(canvas, 0, canvas.height - h, canvas.width, h,
                                 0, 0, canvas.width, h);
    return c;
  }

  /* ── MRZ reconstruction ────────────────────────────────────────────────── */

  /* Pull plausible MRZ lines out of noisy OCR output. A line qualifies on shape
   * — right sort of length, right sort of characters — not on content. */
  function candidateLines(rawText) {
    return String(rawText || '')
      .toUpperCase()
      .split(/[\r\n]+/)
      .map(function (l) { return l.replace(/\s+/g, '').replace(FILLER_JUNK, '<'); })
      .filter(function (l) {
        if (l.length < 20) return false;
        var good = (l.match(/[A-Z0-9<]/g) || []).length;
        return good / l.length > 0.85;
      });
  }

  /* An MRZ line is always padded to full width with filler, so a long run of one
   * repeated character at the end of a line is padding that came back as a
   * letter — L and K are what the recogniser most often returns for '<'. Four is
   * the threshold because no name ends in four identical letters, which keeps
   * this from touching real data. */
  function restoreTrailingFiller(line) {
    return line.replace(/([A-Z0-9])\1{3,}$/, function (run) {
      return new Array(run.length + 1).join('<');
    });
  }

  function fitToLength(line, len) {
    if (line.length === len) return line;
    if (line.length > len) return line.slice(0, len);
    return line + new Array(len - line.length + 1).join('<');
  }

  /* Order matters here and cost an hour to notice: the filler run has to be
   * restored AFTER the line is cut to its proper length, not before. A raw
   * recognised line usually runs past the end of the zone with a little trailing
   * noise, so the run of misread padding is not at the end of the string until
   * the overshoot has been trimmed off. */
  function normaliseLine(line, len) {
    return restoreTrailingFiller(fitToLength(line, len));
  }

  /* Choose the line grouping that matches a known document format. */
  function assembleMrz(lines) {
    if (lines.length >= 3) {
      var t1 = lines.slice(-3).map(function (l) { return normaliseLine(l, 30); });
      if (lines.slice(-3).every(function (l) { return Math.abs(l.length - 30) <= 6; })) {
        return { format: 'TD1', lines: t1 };
      }
    }
    if (lines.length >= 2) {
      var last2 = lines.slice(-2);
      if (last2.every(function (l) { return Math.abs(l.length - 44) <= 8; })) {
        return { format: 'TD3', lines: last2.map(function (l) { return normaliseLine(l, 44); }) };
      }
      if (last2.every(function (l) { return Math.abs(l.length - 30) <= 6; })) {
        return { format: 'TD1', lines: last2.map(function (l) { return normaliseLine(l, 30); }) };
      }
    }
    return null;
  }

  /* Fix characters that cannot legally appear where they are. This is where the
   * layout table earns its place: position 13 of a TD3 second line is part of a
   * date, so an O there is a misread 0 — not a judgement call. Every change is
   * recorded so the operator can see what was altered. */
  function correctByLayout(format, lines) {
    var M = mrzLib();
    if (!M || !M.charTypeAt) return { lines: lines, corrections: [] };

    var corrections = [];
    var fixed = lines.map(function (line, li) {
      var out = '';
      for (var p = 0; p < line.length; p++) {
        var ch = line[p];
        var want = M.charTypeAt(format, li, p);
        var next = ch;
        if (want === 'd' && /[A-Z]/.test(ch) && TO_DIGIT[ch]) next = TO_DIGIT[ch];
        else if (want === 'a' && /[0-9]/.test(ch) && TO_ALPHA[ch]) next = TO_ALPHA[ch];
        if (next !== ch) {
          corrections.push({ line: li + 1, pos: p + 1, from: ch, to: next, expected: want });
        }
        out += next;
      }
      return out;
    });
    return { lines: fixed, corrections: corrections };
  }

  /* ── Visual zone ───────────────────────────────────────────────────────── */

  var MONTHS = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
                 JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };

  /* Best-effort only, and labelled as such everywhere it surfaces. Nothing on
   * the printed side of a document can be validated, so these are suggestions
   * for a human to accept or reject — never values the engine may act on
   * unchallenged. */
  function extractVisualFields(text) {
    var out = {};
    var t = String(text || '').toUpperCase();

    var dates = [];
    var re = /\b(\d{1,2})[\s\/.\-]*([A-Z]{3}|\d{1,2})[\s\/.\-]*(\d{2,4})\b/g;
    var m;
    while ((m = re.exec(t)) !== null) {
      var d = m[1], mo = MONTHS[m[2]] || m[2], y = m[3];
      if (!/^\d{1,2}$/.test(mo)) continue;
      if (y.length === 2) y = (Number(y) > 40 ? '19' : '20') + y;
      var day = Number(d), mon = Number(mo);
      if (day < 1 || day > 31 || mon < 1 || mon > 12) continue;
      dates.push(y + '-' + String(mon).padStart(2, '0') + '-' + String(day).padStart(2, '0'));
    }
    if (dates.length) {
      var sorted = dates.slice().sort();
      out.dob = sorted[0];                       // earliest plausible date
      if (sorted.length > 1) out.expiry = sorted[sorted.length - 1];
    }

    var nums = (t.match(/\b[A-Z0-9]{6,9}\b/g) || []).filter(function (s) {
      return /\d/.test(s) && !/^(PASSPORT|NATIONAL|IDENTITY|SPECIMEN)$/.test(s);
    });
    if (nums.length) out.docNumber = nums[0];

    return out;
  }

  /* ── Orchestration ─────────────────────────────────────────────────────── */

  function recognise(w, image, whitelist) {
    // Page segmentation matters more than anything else here. The default mode
    // runs layout analysis, which on a two-line block of monospaced glyphs
    // invents columns and drops characters. Mode 6 — "a single uniform block of
    // text" — is what the zone actually is, and it stops the line lengths
    // drifting, which everything downstream depends on.
    var params = whitelist
      ? { tessedit_char_whitelist: MRZ_CHARS,
          tessedit_pageseg_mode: '6',
          preserve_interword_spaces: '0' }
      : { tessedit_char_whitelist: '',
          tessedit_pageseg_mode: '3' };
    return w.setParameters(params).then(function () {
      return w.recognize(image);
    }).then(function (r) {
      return (r && r.data && r.data.text) || '';
    });
  }

  /* Read a document image and return proposals for the form. Never writes to
   * the DOM and never calls the engine. */
  function readDocument(file, opts) {
    opts = opts || {};
    var onProgress = opts.onProgress || function () {};
    var M = mrzLib();
    var canvas, mrzResult = null, visualText = '';

    return fileToImage(file).then(function (img) {
      canvas = preprocess(img);
      onProgress('preparing', 1);
      return ensureWorker(onProgress);
    }).then(function (w) {
      // Pass 1: the MRZ, restricted to its own alphabet. Tried on the bottom of
      // the document first, where it always sits, then on the whole image if
      // that finds nothing.
      return recognise(w, cropBottom(canvas, 0.4), true).then(function (text) {
        var found = assembleMrz(candidateLines(text));
        if (found) return found;
        return recognise(w, canvas, true).then(function (full) {
          return assembleMrz(candidateLines(full));
        });
      }).then(function (found) {
        if (found) {
          var corrected = correctByLayout(found.format, found.lines);
          var joined = corrected.lines.join('\n');
          mrzResult = {
            format: found.format,
            text: joined,
            raw: found.lines.join('\n'),
            corrections: corrected.corrections,
            parsed: M ? M.parse(joined, new Date().getFullYear()) : null,
          };
        }
        // Pass 2: the printed side, unrestricted.
        return recognise(w, canvas, false);
      }).then(function (text) {
        visualText = text;
        return buildProposals(mrzResult, visualText);
      });
    });
  }

  /* Turn what was read into per-field proposals, each carrying where it came
   * from and whether anything could validate it. */
  function buildProposals(mrzResult, visualText) {
    var proposals = [];
    var validated = !!(mrzResult && mrzResult.parsed && mrzResult.parsed.ok &&
                       mrzResult.parsed.allValid);

    if (mrzResult) {
      proposals.push({
        field: 'mrz', value: mrzResult.text, source: 'mrz', validated: validated,
        note: validated
          ? 'Read from the machine-readable zone; every check digit verifies, so the ' +
            'transcription is confirmed by arithmetic rather than by eye.'
          : 'Read from the machine-readable zone, but the check digits do not verify. ' +
            'That is either a misread or a document that does not add up — either way it ' +
            'needs a human before it can be relied on.',
      });

      if (mrzResult.parsed && mrzResult.parsed.ok) {
        var f = mrzResult.parsed.fields;

        /* Which fields the check digits actually cover — and it is not all of
         * them. In TD3 the composite spans the second line only; in TD1 it
         * excludes the third. The NAME is not protected in either format, and
         * neither are nationality, sex or the document code.
         *
         * So a zone that verifies says nothing whatever about the name printed
         * in it. Marking a name "validated" because the digits passed would be
         * a false assurance about the one field this whole tool exists to
         * compare, so those fields are proposed as unconfirmed like any other
         * unvalidated read. */
        function fromMrz(field, value, label, covered) {
          if (!value) return;
          var isValid = validated && covered;
          proposals.push({
            field: field, value: value, source: 'mrz', validated: isValid,
            note: isValid
              ? label + ' taken from the machine-readable zone and covered by its check ' +
                'digits, which verify.'
              : !validated
                ? label + ' taken from the machine-readable zone, whose check digits do ' +
                  'not verify.'
                : label + ' taken from the machine-readable zone, but no check digit covers ' +
                  'this field — the composite spans the data line only, never the name. ' +
                  'Confirm it against the printed page.',
          });
        }
        fromMrz('dob', f.dob, 'Date of birth', true);
        fromMrz('expiry', f.expiry, 'Expiry', true);
        fromMrz('docNumber', f.documentNumber, 'Document number', true);
        fromMrz('fullName', f.name && f.name.full, 'Name', false);
        if (f.nationality && ALPHA3[f.nationality]) {
          fromMrz('country', ALPHA3[f.nationality], 'Issuing country', false);
        }
        if (f.documentCode && DOC_CODE[f.documentCode[0]]) {
          fromMrz('docType', DOC_CODE[f.documentCode[0]], 'Document type', false);
        }
      }
    }

    // Only offer printed-page guesses for fields the MRZ did not already supply.
    var taken = {};
    proposals.forEach(function (p) { taken[p.field] = true; });
    var visual = extractVisualFields(visualText);
    Object.keys(visual).forEach(function (k) {
      if (taken[k]) return;
      proposals.push({
        field: k, value: visual[k], source: 'visual', validated: false,
        note: 'Read from the printed side of the document. Nothing there carries a check ' +
              'digit, so this cannot be validated and has to be confirmed by eye before ' +
              'the comparison will rely on it.',
      });
    });

    return {
      ok: proposals.length > 0,
      mrz: mrzResult,
      visualText: visualText,
      proposals: proposals,
      error: proposals.length ? null
        : 'Nothing readable was found. A flat, well-lit, straight-on photograph of the ' +
          'whole page works best.',
    };
  }

  function terminate() {
    if (worker) { try { worker.terminate(); } catch (e) {} }
    worker = null; loading = null;
  }

  return {
    readDocument: readDocument,
    // Exposed for tests, which exercise the deterministic parts without a browser.
    candidateLines: candidateLines,
    assembleMrz: assembleMrz,
    correctByLayout: correctByLayout,
    extractVisualFields: extractVisualFields,
    buildProposals: buildProposals,
    fitToLength: fitToLength,
    restoreTrailingFiller: restoreTrailingFiller,
    ALPHA3: ALPHA3,
    terminate: terminate,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = OCR;
}
