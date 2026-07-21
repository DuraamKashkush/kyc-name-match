/*
 * mrz.js — machine-readable zone parsing, per ICAO Doc 9303.
 *
 * The MRZ is the two or three lines of monospaced text at the foot of a passport
 * or the back of an ID card. It matters here for one reason: it carries check
 * digits, so the data can be verified arithmetically rather than merely compared.
 *
 * This is what makes the document-number check real. The printed passport number
 * has no check digit — the check digit lives HERE — so without the MRZ the engine
 * can only say a number is "plausibly formatted". With it, a transcription error
 * or an altered field fails arithmetic.
 *
 * Supported formats, both from ICAO Doc 9303:
 *   TD3 — passports, 2 lines × 44 characters
 *   TD1 — ID cards, 3 lines × 30 characters
 *
 * TD2 (2 × 36) is rare and is detected but not parsed, rather than guessed at.
 *
 * No DOM access, no network. Pure functions.
 */

var MRZ = (function () {
  'use strict';

  /* Character values for the check-digit calculation: digits are themselves,
   * letters are A=10 through Z=35, and the filler '<' is zero. */
  function charValue(ch) {
    if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48;
    if (ch >= 'A' && ch <= 'Z') return ch.charCodeAt(0) - 55;
    if (ch === '<') return 0;
    return null; // anything else is not valid MRZ content
  }

  /* The ICAO 9303 check digit: weight each character 7, 3, 1 repeating, sum, take
   * modulo 10. Used on the document number, date of birth, expiry, the optional
   * data field, and once more over a composite of all of them. */
  function checkDigit(str) {
    var weights = [7, 3, 1];
    var sum = 0;
    for (var i = 0; i < str.length; i++) {
      var v = charValue(str[i]);
      if (v === null) return null;
      sum += v * weights[i % 3];
    }
    return String(sum % 10);
  }

  /* YYMMDD to ISO. The century is not in the MRZ, so it has to be inferred:
   * a date of birth cannot be in the future, and an expiry is not in the past
   * century. Both rules are stated rather than assumed silently. */
  function toIsoDate(yymmdd, kind, todayYear) {
    if (!/^\d{6}$/.test(yymmdd)) return null;
    var yy = Number(yymmdd.slice(0, 2));
    var mm = yymmdd.slice(2, 4);
    var dd = yymmdd.slice(4, 6);
    if (Number(mm) < 1 || Number(mm) > 12) return null;
    if (Number(dd) < 1 || Number(dd) > 31) return null;

    var year;
    if (kind === 'dob') {
      year = 2000 + yy;
      if (year > todayYear) year -= 100;   // nobody is born in the future
    } else {
      year = 2000 + yy;                     // expiries are this century
    }
    return year + '-' + mm + '-' + dd;
  }

  /* SURNAME<<GIVEN<NAMES<<<<<<  →  { surname, givenNames, full } */
  function parseNameField(field) {
    var trimmed = field.replace(/<+$/, '');
    var parts = trimmed.split('<<');
    var surname = (parts[0] || '').replace(/</g, ' ').trim();
    var given = (parts.slice(1).join(' ') || '').replace(/</g, ' ').trim();
    // Given names first, then surname — the order the rest of the engine expects.
    var full = (given + ' ' + surname).trim();
    return { surname: surname, givenNames: given, full: full };
  }

  function cleanLines(text) {
    return String(text || '')
      .toUpperCase()
      .split(/[\r\n]+/)
      .map(function (l) { return l.replace(/\s/g, ''); })
      .filter(Boolean);
  }

  function verify(fields, checks, label, value, expectedDigit) {
    var computed = checkDigit(value);
    checks.push({
      field: label,
      value: value,
      stated: expectedDigit,
      computed: computed,
      valid: computed !== null && computed === expectedDigit,
    });
  }

  /* ── Character-type layout ──────────────────────────────────────────────────
   *
   * Which positions in each line must be digits, which must be letters, and
   * which may be either. Fixed by ICAO Doc 9303.
   *
   * This exists for the OCR corrector: knowing that positions 13–18 of a TD3
   * second line are a date makes turning a misread O into a 0 deterministic
   * rather than a guess. `parse()` deliberately still reads its own offsets —
   * it is covered by tests and there is nothing to gain by rewriting it — so a
   * test cross-checks this table against a known-good MRZ to catch any drift
   * between the two.
   *
   * 'd' digit, 'a' letter or filler, 'x' either.
   */
  var LAYOUTS = {
    TD3: {
      lineLength: 44,
      lines: [
        [{ at: 0, len: 2, type: 'a' },    // document code
         { at: 2, len: 3, type: 'a' },    // issuing state
         { at: 5, len: 39, type: 'a' }],  // name field
        [{ at: 0, len: 9, type: 'x' },    // document number
         { at: 9, len: 1, type: 'd' },    // its check digit
         { at: 10, len: 3, type: 'a' },   // nationality
         { at: 13, len: 6, type: 'd' },   // date of birth
         { at: 19, len: 1, type: 'd' },
         { at: 20, len: 1, type: 'a' },   // sex
         { at: 21, len: 6, type: 'd' },   // expiry
         { at: 27, len: 1, type: 'd' },
         { at: 28, len: 14, type: 'x' },  // optional data
         { at: 42, len: 1, type: 'd' },
         { at: 43, len: 1, type: 'd' }],  // composite
      ],
    },
    TD1: {
      lineLength: 30,
      lines: [
        [{ at: 0, len: 2, type: 'a' },
         { at: 2, len: 3, type: 'a' },
         { at: 5, len: 9, type: 'x' },
         { at: 14, len: 1, type: 'd' },
         { at: 15, len: 15, type: 'x' }],
        [{ at: 0, len: 6, type: 'd' },
         { at: 6, len: 1, type: 'd' },
         { at: 7, len: 1, type: 'a' },
         { at: 8, len: 6, type: 'd' },
         { at: 14, len: 1, type: 'd' },
         { at: 15, len: 3, type: 'a' },
         { at: 18, len: 11, type: 'x' },
         { at: 29, len: 1, type: 'd' }],
        [{ at: 0, len: 30, type: 'a' }],
      ],
    },
  };

  /* The expected character type at one position, or 'x' if unconstrained. */
  function charTypeAt(format, lineIndex, pos) {
    var spec = LAYOUTS[format];
    if (!spec || !spec.lines[lineIndex]) return 'x';
    var runs = spec.lines[lineIndex];
    for (var i = 0; i < runs.length; i++) {
      if (pos >= runs[i].at && pos < runs[i].at + runs[i].len) return runs[i].type;
    }
    return 'x';
  }

  function parse(text, todayYear) {
    todayYear = todayYear || 2026;
    var lines = cleanLines(text);
    if (!lines.length) return null;

    var format = null;
    if (lines.length === 2 && lines[0].length === 44 && lines[1].length === 44) {
      format = 'TD3';
    } else if (lines.length === 3 && lines.every(function (l) { return l.length === 30; })) {
      format = 'TD1';
    } else if (lines.length === 2 && lines[0].length === 36 && lines[1].length === 36) {
      return {
        ok: false, format: 'TD2',
        error: 'TD2 format (2 lines of 36) is recognised but not parsed by this tool.',
      };
    } else {
      return {
        ok: false, format: null,
        error: 'Not a recognised MRZ. Expected 2 lines of 44 characters (TD3, passport) ' +
               'or 3 lines of 30 (TD1, ID card); got ' + lines.length + ' line(s) of ' +
               lines.map(function (l) { return l.length; }).join('/') + '.',
      };
    }

    var f = {}, checks = [];

    if (format === 'TD3') {
      var l1 = lines[0], l2 = lines[1];
      f.documentCode  = l1.substr(0, 2).replace(/</g, '');
      f.issuingState  = l1.substr(2, 3).replace(/</g, '');
      f.name          = parseNameField(l1.substr(5, 39));

      f.documentNumber = l2.substr(0, 9).replace(/</g, '');
      f.nationality    = l2.substr(10, 3).replace(/</g, '');
      f.sex            = l2.substr(20, 1).replace(/</g, '');
      f.dob            = toIsoDate(l2.substr(13, 6), 'dob', todayYear);
      f.expiry         = toIsoDate(l2.substr(21, 6), 'expiry', todayYear);
      f.personalNumber = l2.substr(28, 14).replace(/</g, '');

      verify(f, checks, 'Document number', l2.substr(0, 9), l2[9]);
      verify(f, checks, 'Date of birth',   l2.substr(13, 6), l2[19]);
      verify(f, checks, 'Expiry',          l2.substr(21, 6), l2[27]);
      verify(f, checks, 'Optional data',   l2.substr(28, 14), l2[42]);
      // The composite covers every field that carries its own check digit, so
      // altering one field and its digit together still fails here.
      verify(f, checks, 'Composite',
             l2.substr(0, 10) + l2.substr(13, 7) + l2.substr(21, 22), l2[43]);

    } else {
      var a = lines[0], b = lines[1], c = lines[2];
      f.documentCode  = a.substr(0, 2).replace(/</g, '');
      f.issuingState  = a.substr(2, 3).replace(/</g, '');
      f.documentNumber = a.substr(5, 9).replace(/</g, '');

      f.dob         = toIsoDate(b.substr(0, 6), 'dob', todayYear);
      f.sex         = b.substr(7, 1).replace(/</g, '');
      f.expiry      = toIsoDate(b.substr(8, 6), 'expiry', todayYear);
      f.nationality = b.substr(15, 3).replace(/</g, '');
      f.name        = parseNameField(c);

      verify(f, checks, 'Document number', a.substr(5, 9), a[14]);
      verify(f, checks, 'Date of birth',   b.substr(0, 6), b[6]);
      verify(f, checks, 'Expiry',          b.substr(8, 6), b[14]);
      verify(f, checks, 'Composite',
             a.substr(5, 25) + b.substr(0, 7) + b.substr(8, 7) + b.substr(18, 11), b[29]);
    }

    return {
      ok: true,
      format: format,
      fields: f,
      checks: checks,
      allValid: checks.every(function (c) { return c.valid; }),
    };
  }

  /* Build a TD3 or TD1 MRZ from field values. Used only to generate the synthetic
   * sample cases with arithmetically correct check digits — the tool itself never
   * needs to write an MRZ, only to read one. */
  function pad(s, n) { return (s + '<'.repeat(n)).substr(0, n); }

  function buildTD3(o) {
    var nameField = pad(o.surname + '<<' + o.givenNames.replace(/ /g, '<'), 39);
    var l1 = pad(o.documentCode, 2) + pad(o.issuingState, 3) + nameField;

    var num = pad(o.documentNumber, 9);
    var dob = o.dob.replace(/-/g, '').slice(2);
    var exp = o.expiry.replace(/-/g, '').slice(2);
    var personal = pad(o.personalNumber || '', 14);

    var l2 = num + checkDigit(num) + pad(o.nationality, 3) +
             dob + checkDigit(dob) + pad(o.sex, 1) +
             exp + checkDigit(exp) + personal + checkDigit(personal);
    l2 += checkDigit(l2.substr(0, 10) + l2.substr(13, 7) + l2.substr(21, 22));
    return l1 + '\n' + l2;
  }

  function buildTD1(o) {
    var num = pad(o.documentNumber, 9);
    var l1 = pad(o.documentCode, 2) + pad(o.issuingState, 3) + num +
             checkDigit(num) + pad(o.optional1 || '', 15);

    var dob = o.dob.replace(/-/g, '').slice(2);
    var exp = o.expiry.replace(/-/g, '').slice(2);
    var l2 = dob + checkDigit(dob) + pad(o.sex, 1) + exp + checkDigit(exp) +
             pad(o.nationality, 3) + pad(o.optional2 || '', 11);
    l2 += checkDigit(l1.substr(5, 25) + l2.substr(0, 7) + l2.substr(8, 7) +
                     l2.substr(18, 11));

    var l3 = pad(o.surname + '<<' + o.givenNames.replace(/ /g, '<'), 30);
    return l1 + '\n' + l2 + '\n' + l3;
  }

  return {
    parse: parse,
    checkDigit: checkDigit,
    parseNameField: parseNameField,
    buildTD3: buildTD3,
    buildTD1: buildTD1,
    LAYOUTS: LAYOUTS,
    charTypeAt: charTypeAt,
    cleanLines: cleanLines,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MRZ;
}
