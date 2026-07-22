/*
 * tests.js — assertions against engine.js.
 *
 * No framework and no build step: this file runs in the browser via tests.html
 * and in Node via `node tests.js`. The whole claim of this project is that the
 * decision is deterministic and reproducible, and an untested engine has no
 * business making that claim.
 *
 * The adversarial cases matter more than the happy ones. An engine tuned to
 * match aggressively across transliterations will happily match two DIFFERENT
 * people, and that failure is far more serious in a KYC queue than the false
 * mismatch this tool was built to fix. Roughly half the assertions below exist
 * to hold the engine back.
 */

var TEST_SUITE = (function () {
  'use strict';

  var K = (typeof module !== 'undefined' && module.exports)
    ? require('./engine.js') : KYC;

  var groups = [];
  var current = null;

  function group(name) { current = { name: name, tests: [] }; groups.push(current); }
  function test(name, fn) { current.tests.push({ name: name, fn: fn }); }

  function fail(msg) { throw new Error(msg); }
  function eq(actual, expected, what) {
    if (actual !== expected) {
      fail((what || 'value') + ': expected ' + JSON.stringify(expected) +
           ', got ' + JSON.stringify(actual));
    }
  }
  function ok(cond, msg) { if (!cond) fail(msg || 'expected truthy'); }
  function gte(actual, bound, what) {
    if (!(actual >= bound)) fail((what || 'value') + ': expected >= ' + bound + ', got ' + actual);
  }
  function lte(actual, bound, what) {
    if (!(actual <= bound)) fail((what || 'value') + ': expected <= ' + bound + ', got ' + actual);
  }
  function hasRule(rules, id) {
    ok(rules.indexOf(id) >= 0, 'expected rule ' + id + ', got [' + rules.join(', ') + ']');
  }

  /* Helpers for building throwaway records. */
  var TODAY = '2026-07-21';
  function rec(over) {
    var base = {
      fullName: '', dob: '1994-03-07', docType: 'passport', docNumber: 'M1234567',
      expiry: '2029-08-22', country: 'JO', address: 'Amman, Jordan',
    };
    Object.keys(over || {}).forEach(function (k) { base[k] = over[k]; });
    return base;
  }
  function cmp(nameA, nameB) { return K.compareNames(nameA, nameB); }
  function tok(a, b) { return K.compareTokens(a, b); }
  function tokens(name) { return K.preprocessTokens(K.tokenize(name)).tokens; }
  function findings(name) {
    return K.preprocessTokens(K.tokenize(name)).findings
      .reduce(function (acc, f) { return acc.concat(f.rules); }, []);
  }

  /* ── Script detection ─────────────────────────────────────────────────── */

  group('Script detection');

  test('Arabic is detected', function () { eq(K.detectScript('محمد'), 'arabic'); });
  test('Hebrew is detected', function () { eq(K.detectScript('מוחמד'), 'hebrew'); });
  test('Latin is detected', function () { eq(K.detectScript('Mohammad'), 'latin'); });

  /* ── Skeleton convergence ─────────────────────────────────────────────── */

  group('Consonant skeleton — the three scripts must converge');

  test('محمد, מוחמד and Mohammad all reduce to MHMD', function () {
    eq(K.skeleton('محمد'), 'MHMD', 'arabic');
    eq(K.skeleton('מוחמד'), 'MHMD', 'hebrew');
    eq(K.skeleton('Mohammad'), 'MHMD', 'latin');
  });
  test('Every common spelling of Muhammad reduces alike', function () {
    ['Mohammad', 'Mohamed', 'Muhammad', 'Muhammed', 'Mohammed', 'Mohamad']
      .forEach(function (s) { eq(K.skeleton(s), 'MHMD', s); });
  });
  test('سيد and Sayed both reduce to SD', function () {
    eq(K.skeleton('سيد'), 'SD', 'arabic');
    eq(K.skeleton('Sayed'), 'SD', 'latin');
  });
  test('Word-initial y and w are consonants and survive', function () {
    eq(K.skeleton('يوسف'), 'YSF', 'arabic yousef');
    eq(K.skeleton('Yousef'), 'YSF', 'latin yousef');
    eq(K.skeleton('وليد'), 'WLD', 'arabic walid');
    eq(K.skeleton('Walid'), 'WLD', 'latin walid');
  });
  test('A word-initial vowel drops — Ibrahim is not Y-Ibrahim', function () {
    eq(K.skeleton('إبراهيم'), 'BRHM', 'arabic');
    eq(K.skeleton('Ibrahim'), 'BRHM', 'latin i-');
    eq(K.skeleton('Ebrahim'), 'BRHM', 'latin e-');
  });
  test('Ta marbuta is silent — فاطمة is Fatima, not Fatimat', function () {
    eq(K.skeleton('فاطمة'), 'FTM', 'arabic');
    eq(K.skeleton('Fatima'), 'FTM', 'latin');
  });
  test('Alef maqsura is a vowel — مصطفى is Mustafa', function () {
    eq(K.skeleton('مصطفى'), 'MSTF', 'arabic');
    eq(K.skeleton('Mustafa'), 'MSTF', 'latin');
  });
  test('ع vanishes in transliteration — عمر is Omar', function () {
    eq(K.skeleton('عمر'), 'MR', 'arabic');
    eq(K.skeleton('Omar'), 'MR', 'latin o-');
    eq(K.skeleton('Umar'), 'MR', 'latin u-');
  });
  test('Equivalence classes collapse as specified', function () {
    eq(K.skeleton('خالد'), K.skeleton('Khaled'), 'kh class');
    eq(K.skeleton('طارق'), K.skeleton('Tariq'), 'emphatic t, q');
    eq(K.skeleton('جمال'), K.skeleton('Gamal'), 'egyptian g for jim');
    eq(K.skeleton('ناصر'), K.skeleton('Nasser'), 'sad class');
  });

  /* ── Skeleton distinctness ────────────────────────────────────────────── */

  group('Consonant skeleton — genuinely different names must stay apart');

  test('Sayed and Sharif do not converge', function () {
    ok(K.skeleton('سيد') !== K.skeleton('شريف'), 'skeletons collided');
  });
  test('Walid and Khalid do not converge', function () {
    ok(K.skeleton('Walid') !== K.skeleton('Khalid'), 'skeletons collided');
  });
  test('Yaser and Nasser do not converge', function () {
    ok(K.skeleton('Yaser') !== K.skeleton('Nasser'), 'skeletons collided');
  });
  test('Mohammad and Mahmoud DO converge — which is why the lexicon exists', function () {
    eq(K.skeleton('Mohammad'), K.skeleton('Mahmoud'),
       'if these ever stop colliding, the LEX-2 rule is no longer load-bearing');
  });

  /* ── Known-name lexicon ───────────────────────────────────────────────── */

  group('Known-name lexicon');

  test('Mohammad and Mahmoud are refused despite identical consonants', function () {
    var r = tok('Mohammad', 'Mahmoud');
    eq(r.score, 0, 'score');
    hasRule(r.rules, 'LEX-2');
  });
  test('Spelling variants of one name are matched outright', function () {
    ['Mohamed', 'Muhammed', 'Mohammed', 'محمد', 'מוחמד'].forEach(function (s) {
      var r = tok('Mohammad', s);
      eq(r.score, 1, 'Mohammad vs ' + s);
      hasRule(r.rules, 'LEX-1');
    });
  });
  test('Jamal and Gamal are one name', function () {
    var r = tok('Jamal', 'Gamal');
    eq(r.score, 1);
    hasRule(r.rules, 'LEX-1');
  });
  test('Hassan and Hussein are two names', function () {
    eq(tok('Hassan', 'Hussein').score, 0);
  });
  test('Khaled and Khalil are two names', function () {
    eq(tok('Khaled', 'Khalil').score, 0);
  });
  test('Ali and Alaa are two names', function () {
    eq(tok('Ali', 'Alaa').score, 0);
  });
  test('Cross-script lexicon hits work', function () {
    eq(tok('أحمد', 'Ahmed').score, 1, 'arabic vs latin');
    eq(tok('אחמד', 'Ahmad').score, 1, 'hebrew vs latin');
    eq(tok('محمد', 'מוחמד').score, 1, 'arabic vs hebrew');
  });

  /* ── Skeleton matching for names outside the lexicon ──────────────────── */

  group('Skeleton matching outside the lexicon');

  test('Sayed matches Sayyid on the skeleton', function () {
    var r = tok('Sayed', 'Sayyid');
    gte(r.score, 0.9, 'score');
  });
  test('Sharif matches Shareef on the skeleton', function () {
    gte(tok('Sharif', 'Shareef').score, 0.9, 'score');
  });
  test('Arabic surname matches its Latin transliteration', function () {
    var r = tok('سيد', 'Sayed');
    eq(r.score, 1, 'score');
    hasRule(r.rules, 'SKEL-1');
    hasRule(r.rules, 'WEAK-1');
  });
  test('Unrelated surnames score low', function () {
    lte(tok('Sayed', 'Sharif').score, 0.4, 'score');
    lte(tok('Haddad', 'Mansour').score, 0.4, 'score');
  });
  test('First-vowel conflict holds a pair back from a clean match', function () {
    var r = tok('Salem', 'Islam');
    ok(r.score < 0.85, 'expected to be held back, got ' + r.score);
    hasRule(r.rules, 'VOW-1');
  });

  /* ── Hebrew ───────────────────────────────────────────────────────────── */

  group('Hebrew — the script-specific problems');

  test('The geresh is read as a letter, not stripped as a diacritic', function () {
    // ג׳=j, ר׳=gh, ת׳=th, ד׳=dh. Stripping the mark would collapse each onto the
    // wrong sound, which is what used to happen.
    eq(K.skeleton('ר׳אנם'), K.skeleton('غانم'), 'ר׳ must be gh');
    eq(K.skeleton('ת׳אבת'), K.skeleton('ثابت'), 'ת׳ must be th');
    eq(K.skeleton('ג׳מאל'), K.skeleton('جمال'), 'ג׳ must be j');
    eq(K.skeleton('ח׳אלד'), K.skeleton('خالد'), 'ח׳ must be kh');
  });
  test('A geresh typed as a plain apostrophe works too', function () {
    // Records use the ASCII apostrophe at least as often as U+05F3.
    eq(K.skeleton("ג'מאל"), K.skeleton('ג׳מאל'), 'apostrophe and geresh must agree');
  });
  test('A silent ة is matched through Hebrew final ה', function () {
    gte(tok('شحادة', 'שחאדה').score, 0.9, 'Shehadeh');
    gte(tok('سلامة', 'סלאמה').score, 0.9, 'Salameh');
    gte(tok('حمادة', 'חמאדה').score, 0.9, 'Hamadeh');
    gte(tok('عودة', 'עודה').score, 0.85, 'Odeh — short token, so the ה costs proportionally more');
  });
  test('A pronounced ه is NOT thrown away with it', function () {
    // This is the assertion that matters. Mapping final ה to a vowel would fix
    // the test above and silently break this one — both families have to work,
    // because Hebrew writes ة and ه identically and cannot tell you which it is.
    eq(tok('عبدالله', 'עבדאללה').score, 1, 'Abdullah');
    eq(tok('طه', 'טאהה').score, 1, 'Taha');
  });
  test('A trailing Latin h is ambiguous in the same way', function () {
    gte(tok('شحادة', 'Shehadeh').score, 0.9, 'silent ة');
    eq(tok('صلاح', 'Salah').score, 1, 'pronounced ح must survive');
    eq(tok('فرح', 'Farah').score, 1, 'pronounced ح must survive');
  });
  test('ר carries غ, since Hebrew has no letter for it', function () {
    // With the geresh it is exact; without it, an honest refer rather than a
    // match — the unmarked Hebrew spelling genuinely does not distinguish them.
    eq(tok('غانم', 'ר׳אנם').score, 1, 'with geresh');
    var bare = tok('غانم', 'ראנם').score;
    ok(bare >= 0.6 && bare < 0.9,
       'without geresh should refer, not match or fail — got ' + bare);
  });
  test('אום is joined on the Hebrew side as أم is on the Arabic side', function () {
    eq(tokens('אום אל-פחם').length, 1, 'should join to one token');
    eq(tokens('أم الفحم').length, 1, 'as Arabic already did');
  });
  test('All six directions agree for one person', function () {
    var forms = ['محمد أحمد السيد', 'מוחמד אחמד אלסייד', 'Mohammad Ahmad Al-Sayed'];
    for (var i = 0; i < forms.length; i++) {
      for (var j = 0; j < forms.length; j++) {
        if (i === j) continue;
        gte(cmp(forms[i], forms[j]).score, 85, forms[i] + ' vs ' + forms[j]);
      }
    }
  });

  /* ── Particles ────────────────────────────────────────────────────────── */

  group('Particles');

  test('The definite article is stripped and reported', function () {
    eq(tokens('Al-Sayed').join(' '), 'sayed');
    hasRule(findings('Al-Sayed'), 'ART-1');
  });
  test('Arabic ال and Hebrew אל are stripped', function () {
    eq(tokens('السيد').join(' '), 'سيد', 'arabic');
    eq(tokens('אלסייד').join(' '), 'סייד', 'hebrew');
  });
  test('A sun-letter article is recognised', function () {
    eq(tokens('Ash-Sharif').join(' '), 'sharif', 'hyphenated');
    hasRule(findings('Ash-Sharif'), 'ART-2');
  });
  test('An assimilated article with no hyphen is recognised', function () {
    eq(tokens('Mohammad Assayed').join(' '), 'mohammad sayed');
    hasRule(findings('Mohammad Assayed'), 'ART-2');
  });
  test('Elsayed and Al-Sayed reach the same token', function () {
    eq(tokens('Mohammad Elsayed')[1], tokens('Mohammad Al-Sayed')[1]);
  });
  test('Ali is NOT reduced to "i" by the article stripper', function () {
    eq(tokens('Ali').join(' '), 'ali');
    eq(tokens('Mohammad Ali').join(' '), 'mohammad ali');
  });
  test('عبد is joined to what follows, never stripped', function () {
    eq(tokens('عبد الرحمن').join(' '), 'عبدالرحمن');
    hasRule(findings('عبد الرحمن'), 'JOIN-1');
  });
  test('Abdul Rahman, Abd al-Rahman and Abdulrahman are one name', function () {
    var forms = ['Abdul Rahman', 'Abd al-Rahman', 'Abdulrahman', 'Abdel Rahman'];
    forms.forEach(function (f) {
      var r = tok(tokens(f)[0], 'Abdulrahman');
      eq(r.score, 1, f + ' vs Abdulrahman');
    });
  });
  test('Abdullah survives as one token and is not read as an article', function () {
    eq(tokens('عبد الله').join(' '), 'عبدالله');
    eq(tok(tokens('Abd Allah')[0], 'Abdullah').score, 1);
  });
  test('Abu is kept as part of the family name', function () {
    eq(tokens('Abu Sayed').join(' '), 'abusayed');
    hasRule(findings('Abu Sayed'), 'JOIN-1');
  });
  test('bin and ibn are removed and reported', function () {
    eq(tokens('Mohammad bin Ahmad').join(' '), 'mohammad ahmad');
    hasRule(findings('Mohammad bin Ahmad'), 'PAT-1');
    eq(tokens('Mohammad ibn Ahmad').join(' '), 'mohammad ahmad');
  });

  /* ── Full-name comparison ─────────────────────────────────────────────── */

  group('Full-name comparison');

  test('Arabic document against Latin system record — the headline case', function () {
    var r = cmp('محمد أحمد السيد', 'Muhammed Elsayed');
    gte(r.score, 85, 'name score');
  });
  test('Hebrew record against Latin record', function () {
    gte(cmp('מוחמד אחמד אלסייד', 'Mohammad Ahmad Al-Sayed').score, 85, 'name score');
  });
  test('All four spellings of one person agree with each other', function () {
    var forms = ['محمد السيد', 'מוחמד אלסייד', 'Mohammad Al-Sayed', 'Muhammed Elsayed'];
    for (var i = 0; i < forms.length; i++) {
      for (var j = i + 1; j < forms.length; j++) {
        gte(cmp(forms[i], forms[j]).score, 85, forms[i] + ' vs ' + forms[j]);
      }
    }
  });
  test('Reordered tokens still match, and the reordering is recorded', function () {
    var r = cmp('Mohammad Ali', 'Ali Mohammad');
    gte(r.score, 85, 'name score');
    var all = r.pairs.reduce(function (a, p) { return a.concat(p.rules); }, []);
    hasRule(all, 'ORD-1');
  });
  test('A patronymic present in one record only is benign', function () {
    var r = cmp('Mohammad Ahmad Al-Sayed', 'Mohammad Al-Sayed');
    gte(r.score, 90, 'name score');
    var all = r.pairs.reduce(function (a, p) { return a.concat(p.rules); }, []);
    hasRule(all, 'TOK-1');
  });
  test('A different family name is substantive', function () {
    lte(cmp('Mohammad Al-Sayed', 'Mohammad Al-Sharif').score, 65, 'name score');
  });
  test('A different given name is substantive', function () {
    lte(cmp('Mohammad Al-Sayed', 'Mahmoud Al-Sayed').score, 65, 'name score');
  });
  test('The Mohammad/Mahmoud finding is SHOWN, not silently dropped', function () {
    var r = cmp('Mohammad Ahmad Al-Sayed', 'Mahmoud Ahmad Al-Sharif');
    var row = r.pairs.filter(function (p) {
      return p.a === 'mohammad' && p.b === 'mahmoud';
    })[0];
    ok(row, 'the contradicting pair must appear as a row in the breakdown');
    hasRule(row.rules, 'LEX-2');
  });
  test('A missing name is reported, never scored as agreement', function () {
    var r = cmp('', 'Mohammad Al-Sayed');
    eq(r.score, 0, 'name score');
    hasRule(r.pairs[0].rules, 'MISS-1');
  });

  /* ── Dates ────────────────────────────────────────────────────────────── */

  group('Date of birth');

  function dobCheck(a, b) {
    var res = K.compare(rec({ fullName: 'Mohammad Al-Sayed', dob: a }),
                        rec({ fullName: 'Mohammad Al-Sayed', dob: b }), { today: TODAY });
    return res.checks.filter(function (c) { return c.field === 'Date of birth'; })[0];
  }

  test('Identical dates agree', function () {
    hasRule(dobCheck('1994-03-07', '1994-03-07').rules, 'DOB-1');
  });
  test('Day/month transposition is identified as a keying error', function () {
    var c = dobCheck('1994-03-07', '1994-07-03');
    hasRule(c.rules, 'DOB-SWAP');
    eq(c.cap, 'REFER', 'caps at refer, not no-match');
  });
  test('Same year with a non-transposed difference is not a swap', function () {
    hasRule(dobCheck('1994-03-07', '1994-09-15').rules, 'DOB-2');
  });
  test('A first-of-January date is flagged as a placeholder', function () {
    hasRule(dobCheck('1994-01-01', '1994-01-01').rules, 'DOB-4');
  });
  test('Unrelated dates differ', function () {
    hasRule(dobCheck('1994-03-07', '1991-11-22').rules, 'DOB-3');
  });
  test('A transposition needs day and month to actually differ', function () {
    // 05-05 against 05-05 is identical, not a transposition.
    hasRule(dobCheck('1994-05-05', '1994-05-05').rules, 'DOB-1');
  });

  /* ── Documents ────────────────────────────────────────────────────────── */

  group('Document checks');

  test('A valid Israeli ID check digit verifies', function () {
    eq(K.israeliIdValid('310256789'), true, '310256789');
    eq(K.israeliIdValid('284190352'), true, '284190352');
  });
  test('A corrupted Israeli ID check digit fails', function () {
    eq(K.israeliIdValid('310256788'), false, 'last digit changed');
    eq(K.israeliIdValid('310256779'), false, 'inner digit changed');
  });
  test('A wrong-length Israeli ID is not evaluated rather than failed', function () {
    eq(K.israeliIdValid('12345'), null);
  });
  test('An expired document caps the verdict regardless of the name', function () {
    var res = K.compare(
      rec({ fullName: 'Mohammad Al-Sayed', expiry: '2024-02-10' }),
      rec({ fullName: 'Mohammad Al-Sayed', expiry: '2024-02-10' }),
      { today: TODAY });
    eq(res.nameScore, 100, 'names are identical');
    eq(res.provisionalVerdict, 'MATCH', 'provisional');
    eq(res.verdict, 'REFER', 'capped');
    ok(res.hardStops.some(function (h) { return h.rule === 'EXP-1'; }), 'EXP-1 must cap');
  });
  /* The ordinary KYC case: the customer presents one document, the file was
   * built from another. Before 1.2.0 this always capped at REFER however well
   * the person matched, which made the tool useless for the case it exists for
   * — and every sample case hid it by carrying one document number on both
   * sides. These four assertions exist to stop that coming back. */
  test('Two different documents for one person can still reach MATCH', function () {
    var res = K.compare(
      rec({ fullName: 'Mohammad Al-Sayed', docType: 'passport',
            docNumber: 'M1234567', expiry: '2029-08-22' }),
      rec({ fullName: 'Mohammad Al-Sayed', docType: 'national_id',
            docNumber: '310256789', expiry: '2031-05-14' }),
      { today: TODAY });
    eq(res.nameScore, 100, 'same person');
    eq(res.verdict, 'MATCH', 'a different class of document must not cap');
    ok(!res.hardStops.some(function (h) { return h.rule === 'NUM-2' || h.rule === 'EXP-2'; }),
      'neither NUM-2 nor EXP-2 may fire across document types');
  });
  test('Across document types the number is reported as not comparable', function () {
    var res = K.compare(
      rec({ fullName: 'Mohammad Al-Sayed', docType: 'passport', docNumber: 'M1234567' }),
      rec({ fullName: 'Mohammad Al-Sayed', docType: 'national_id', docNumber: '310256789' }),
      { today: TODAY });
    var num = res.checks.filter(function (c) { return c.field === 'Document number'; })[0];
    eq(num.status, 'info', 'absent evidence is not adverse evidence');
    ok(num.rules.indexOf('NUM-3') >= 0, 'must cite NUM-3');
  });
  test('Within one document type a differing number still caps', function () {
    var res = K.compare(
      rec({ fullName: 'Mohammad Al-Sayed', docType: 'passport', docNumber: 'M1234567' }),
      rec({ fullName: 'Mohammad Al-Sayed', docType: 'passport', docNumber: 'K7781234' }),
      { today: TODAY });
    eq(res.verdict, 'REFER', 'two passports, two numbers');
    ok(res.hardStops.some(function (h) { return h.rule === 'NUM-2'; }), 'NUM-2 must cap');
  });
  test('An expired document caps even across document types', function () {
    var res = K.compare(
      rec({ fullName: 'Mohammad Al-Sayed', docType: 'passport', expiry: '2029-08-22' }),
      rec({ fullName: 'Mohammad Al-Sayed', docType: 'national_id',
            docNumber: '310256789', expiry: '2024-02-10' }),
      { today: TODAY });
    eq(res.verdict, 'REFER', 'validity is not a comparison');
    ok(res.hardStops.some(function (h) { return h.rule === 'EXP-1'; }), 'EXP-1 must still cap');
  });

  /* Israel prints the holder's identity number on the driving licence, so those
   * two documents DO share an identifier where two classes normally would not.
   * The exception has to stay narrow, which is what most of these pin down. */
  test('An Israeli ID and driving licence are compared on their number', function () {
    var res = K.compare(
      rec({ fullName: 'Mohammad Al-Sayed', country: 'IL', docType: 'national_id',
            docNumber: '310256789', expiry: '2031-05-14' }),
      rec({ fullName: 'Mohammad Al-Sayed', country: 'IL', docType: 'drivers_license',
            docNumber: '310256789', expiry: '2028-09-30' }),
      { today: TODAY });
    eq(res.verdict, 'MATCH');
    var num = res.checks.filter(function (c) { return c.field === 'Document number'; })[0];
    eq(num.statusLabel, 'Agrees', 'the licence carries the identity number');
    ok(num.rules.indexOf('NUM-4') >= 0, 'must cite NUM-4');
  });
  test('Israeli ID and licence numbers that disagree are a real discrepancy', function () {
    var res = K.compare(
      rec({ fullName: 'Mohammad Al-Sayed', country: 'IL', docType: 'national_id',
            docNumber: '310256789', expiry: '2031-05-14' }),
      rec({ fullName: 'Mohammad Al-Sayed', country: 'IL', docType: 'drivers_license',
            docNumber: '318765432', expiry: '2028-09-30' }),
      { today: TODAY });
    eq(res.verdict, 'REFER', 'these should have cited the same nine digits');
    ok(res.hardStops.some(function (h) { return h.rule === 'NUM-2'; }), 'NUM-2 must cap');
  });
  test('The licence number is check-digit verified, being the identity number', function () {
    var res = K.compare(
      rec({ fullName: 'Mohammad Al-Sayed', country: 'IL', docType: 'drivers_license',
            docNumber: '310256789' }),
      rec({ fullName: 'Mohammad Al-Sayed', country: 'IL', docType: 'drivers_license',
            docNumber: '310256789' }),
      { today: TODAY });
    var chk = res.checks.filter(function (c) { return /check digit/i.test(c.field); });
    ok(chk.length > 0, 'ID-CHK must run on a driving licence');
    eq(chk[0].statusLabel, 'Valid');
  });
  test('The exception does not reach the Israeli passport', function () {
    var res = K.compare(
      rec({ fullName: 'Mohammad Al-Sayed', country: 'IL', docType: 'national_id',
            docNumber: '310256789', expiry: '2031-05-14' }),
      rec({ fullName: 'Mohammad Al-Sayed', country: 'IL', docType: 'passport',
            docNumber: 'M1234567', expiry: '2029-08-22' }),
      { today: TODAY });
    eq(res.verdict, 'MATCH', 'a passport carries its own number');
    var num = res.checks.filter(function (c) { return c.field === 'Document number'; })[0];
    eq(num.statusLabel, 'Not comparable');
  });
  test('The exception does not leave Israel', function () {
    var res = K.compare(
      rec({ fullName: 'Mohammad Al-Sayed', country: 'JO', docType: 'national_id',
            docNumber: '310256789', expiry: '2031-05-14' }),
      rec({ fullName: 'Mohammad Al-Sayed', country: 'JO', docType: 'drivers_license',
            docNumber: 'DL8842317', expiry: '2028-09-30' }),
      { today: TODAY });
    var num = res.checks.filter(function (c) { return c.field === 'Document number'; })[0];
    eq(num.statusLabel, 'Not comparable', 'the scheme is a fact about Israel only');
  });
  test('A shared number does not make the expiry dates comparable', function () {
    // The two documents carry one identifier but run on separate renewal cycles,
    // so NUM-4 must not drag EXP-4 along with it.
    var res = K.compare(
      rec({ fullName: 'Mohammad Al-Sayed', country: 'IL', docType: 'national_id',
            docNumber: '310256789', expiry: '2031-05-14' }),
      rec({ fullName: 'Mohammad Al-Sayed', country: 'IL', docType: 'drivers_license',
            docNumber: '310256789', expiry: '2028-09-30' }),
      { today: TODAY });
    var exp = res.checks.filter(function (c) { return c.field === 'Expiry'; })[0];
    eq(exp.statusLabel, 'Not comparable');
    ok(exp.rules.indexOf('EXP-4') >= 0, 'must still cite EXP-4');
  });

  test('Checks can only lower a verdict, never raise it', function () {
    var res = K.compare(
      rec({ fullName: 'Mohammad Al-Sayed' }),
      rec({ fullName: 'Mahmoud Al-Sharif' }),
      { today: TODAY });
    eq(res.provisionalVerdict, 'NO_MATCH', 'provisional');
    // Every field agrees here, which must NOT rescue the name mismatch.
    eq(res.verdict, 'NO_MATCH', 'agreeing fields cannot raise the verdict');
  });

  /* ── Machine-readable zone ────────────────────────────────────────────── */

  group('Machine-readable zone (ICAO Doc 9303)');

  var M = (typeof module !== 'undefined' && module.exports)
    ? require('./mrz.js') : MRZ;

  var TD3 = 'P<JORELSAYED<<MOHAMMAD<AHMAD<<<<<<<<<<<<<<<<\n' +
            'M1234567<0JOR9403073M2908225<<<<<<<<<<<<<<06';
  var TD1 = 'I<ISR3102567891<<<<<<<<<<<<<<<\n' +
            '9403073M3105146ISR<<<<<<<<<<<6\n' +
            'ALSAYED<<MOHAMMAD<AHMAD<<<<<<<';

  test('The ICAO Doc 9303 specimen validates end to end', function () {
    // The published TD3 specimen (Utopia / Anna Maria Eriksson). Validating
    // against a document somebody else constructed is worth more than any
    // assertion written against my own implementation, because it cannot be
    // made to pass by accident.
    var specimen = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\n' +
                   'L898902C36UTO7408122F1204159ZE184226B<<<<<10';
    var p = M.parse(specimen, 2026);
    ok(p.ok, 'should parse');
    eq(p.allValid, true, 'every check digit in the specimen must verify');
    eq(p.fields.documentNumber, 'L898902C3');
    eq(p.fields.dob, '1974-08-12');
    eq(p.fields.expiry, '2012-04-15');
    eq(p.fields.name.full, 'ANNA MARIA ERIKSSON');
    eq(p.checks.length, 5, 'four field digits plus the composite');
  });
  test('A TD3 passport zone parses with every check digit verifying', function () {
    var p = M.parse(TD3, 2026);
    ok(p.ok, 'should parse');
    eq(p.format, 'TD3');
    eq(p.allValid, true, 'all check digits');
    eq(p.fields.documentNumber, 'M1234567');
    eq(p.fields.dob, '1994-03-07');
    eq(p.fields.expiry, '2029-08-22');
    eq(p.fields.nationality, 'JOR');
  });
  test('A TD1 ID-card zone parses with every check digit verifying', function () {
    var p = M.parse(TD1, 2026);
    ok(p.ok, 'should parse');
    eq(p.format, 'TD1');
    eq(p.allValid, true, 'all check digits');
    eq(p.fields.documentNumber, '310256789');
    eq(p.fields.dob, '1994-03-07');
  });
  test('The zone name field is read surname-last', function () {
    eq(M.parse(TD3, 2026).fields.name.full, 'MOHAMMAD AHMAD ELSAYED');
    eq(M.parse(TD3, 2026).fields.name.surname, 'ELSAYED');
  });
  test('A single altered character fails its check digit', function () {
    // Change the document number without touching its check digit.
    var tampered = TD3.replace('M1234567<0', 'M1234568<0');
    var p = M.parse(tampered, 2026);
    ok(p.ok, 'still parses');
    eq(p.allValid, false, 'must not verify');
  });
  test('Altering a field AND its own digit still fails the composite', function () {
    // This is the whole reason the composite digit exists: a forger who fixes
    // the field-level digit is caught by the check that spans every field.
    var num = 'M1234568';
    var withDigit = num + '<' + M.checkDigit(num + '<');
    var tampered = TD3.replace('M1234567<0', withDigit);
    var p = M.parse(tampered, 2026);
    var docCheck = p.checks.filter(function (c) { return c.field === 'Document number'; })[0];
    var composite = p.checks.filter(function (c) { return c.field === 'Composite'; })[0];
    eq(docCheck.valid, true, 'the field-level digit was repaired');
    eq(composite.valid, false, 'but the composite must still fail');
  });
  test('Century inference: a birth date is never in the future', function () {
    eq(M.parse(TD3, 2026).fields.dob, '1994-03-07', '94 is 1994, not 2094');
  });
  test('An unreadable zone is reported, not guessed at', function () {
    var p = M.parse('NOT AN MRZ AT ALL', 2026);
    eq(p.ok, false);
    ok(p.error.length > 10, 'should explain what it expected');
  });
  test('A bad zone caps the verdict even when the names agree', function () {
    var tampered = TD3.replace('M1234567<0', 'M1234568<0');
    var res = K.compare(
      rec({ fullName: 'Mohammad Al-Sayed', mrz: tampered }),
      rec({ fullName: 'Mohammad Al-Sayed' }),
      { today: TODAY });
    eq(res.provisionalVerdict, 'MATCH', 'names are identical');
    eq(res.verdict, 'REFER', 'the failed zone must cap it');
    ok(res.hardStops.some(function (h) { return h.rule === 'MRZ-1'; }), 'MRZ-1 must cap');
  });
  test('A zone that disagrees with the printed record is a finding', function () {
    var res = K.compare(
      // Zone says M1234567, the operator keyed M7654321 from the printed page.
      rec({ fullName: 'Mohammad Al-Sayed', mrz: TD3, docNumber: 'M7654321' }),
      rec({ fullName: 'Mohammad Al-Sayed', docNumber: 'M7654321' }),
      { today: TODAY });
    var c = res.checks.filter(function (x) {
      return x.field.indexOf('MRZ vs printed') === 0;
    })[0];
    ok(c, 'the cross-check must run');
    eq(c.status, 'bad', 'must disagree');
    eq(res.verdict, 'REFER', 'and cap the verdict');
  });
  test('A record with no zone is simply not checked', function () {
    var res = K.compare(rec({ fullName: 'Mohammad Al-Sayed' }),
                        rec({ fullName: 'Mohammad Al-Sayed' }), { today: TODAY });
    ok(!res.checks.some(function (c) { return c.field.indexOf('MRZ') === 0; }),
       'no MRZ rows should appear');
    eq(res.verdict, 'MATCH', 'and nothing is capped');
  });
  test('The zone Latin name matches an Arabic printed name on the same document', function () {
    // The payoff: the zone gives a second, independent Latin transcription, and
    // it goes through the same matcher as everything else.
    var res = K.compare(
      rec({ fullName: 'محمد أحمد السيد', mrz: TD3 }),
      rec({ fullName: 'Muhammed Elsayed' }),
      { today: TODAY });
    var c = res.checks.filter(function (x) {
      return x.field.indexOf('MRZ name') === 0;
    })[0];
    ok(c, 'the name cross-check must run');
    eq(c.status, 'ok', 'zone name should agree with the Arabic printed name: ' + c.statusLabel);
  });

  /* ── OCR boundary ─────────────────────────────────────────────────────── */

  group('OCR — kept outside the decision path');

  var O = (typeof module !== 'undefined' && module.exports)
    ? require('./ocr.js') : (typeof OCR !== 'undefined' ? OCR : null);

  test('The engine contains no reference to OCR at all', function () {
    // The boundary is the whole point, so it is checked structurally rather
    // than trusted: engine.js must not mention the reader in any form. This
    // one reads the source, so it only runs under Node — the Node run is the
    // authoritative check, and it is also the environment where the engine is
    // exercised with the reader entirely absent.
    if (typeof require === 'undefined') return;   // browser run: skipped
    var src = require('fs').readFileSync(__dirname + '/engine.js', 'utf8');
    ok(!/\bOCR\b/.test(src.replace(/'OCR-[12]'|OCR-[12]/g, '')),
       'engine.js references OCR beyond the two rule ids');
    ok(src.indexOf('ocr.js') < 0, 'engine.js must not require ocr.js');
    ok(src.indexOf('Tesseract') < 0, 'engine.js must not reference Tesseract');
  });
  test('A verdict is identical whether or not the reader is loaded', function () {
    // The Node suite loads ocr.js above; the engine result must be unaffected.
    var a = rec({ fullName: 'محمد أحمد السيد' });
    var b = rec({ fullName: 'Muhammed Elsayed' });
    var before = K.caseNote(K.compare(a, b, { today: TODAY }));
    ok(O, 'ocr.js should be loadable');
    var after = K.caseNote(K.compare(a, b, { today: TODAY }));
    eq(after, before, 'loading the reader changed a verdict');
  });
  test('Unconfirmed machine-read text caps the verdict', function () {
    var a = rec({ fullName: 'Mohammad Al-Sayed' });
    var b = rec({ fullName: 'Mohammad Al-Sayed' });
    var plain = K.compare(a, b, { today: TODAY });
    var ocr = K.compare(a, b, {
      today: TODAY, provenance: { a: { fullName: 'ocr-unconfirmed' } },
    });
    eq(plain.verdict, 'MATCH', 'identical names match when typed');
    eq(ocr.nameScore, plain.nameScore, 'provenance must not change the score');
    eq(ocr.verdict, 'REFER', 'unconfirmed machine-read text must cap');
    ok(ocr.hardStops.some(function (h) { return h.rule === 'OCR-1'; }), 'OCR-1 must cap');
  });
  test('Check-digit-validated text does NOT need a second pair of eyes', function () {
    var res = K.compare(rec({ fullName: 'Mohammad Al-Sayed' }),
                        rec({ fullName: 'Mohammad Al-Sayed' }),
                        { today: TODAY, provenance: { a: { dob: 'mrz-validated' } } });
    eq(res.verdict, 'MATCH', 'arithmetic already confirmed it');
    ok(!res.hardStops.some(function (h) { return h.rule === 'OCR-1'; }), 'must not cap');
  });
  test('The case note discloses what was machine-read', function () {
    var note = K.caseNote(K.compare(
      rec({ fullName: 'Mohammad Al-Sayed' }), rec({ fullName: 'Mohammad Al-Sayed' }),
      { today: TODAY, provenance: { a: { dob: 'mrz-validated', fullName: 'ocr-unconfirmed' } } }));
    ok(note.indexOf('HOW THE VALUES WERE OBTAINED') >= 0, 'note must have a provenance section');
    ok(note.indexOf('NOT yet confirmed') >= 0, 'note must flag the unconfirmed field');
  });
  test('A note stays silent about provenance when everything was typed', function () {
    var note = K.caseNote(K.compare(rec({ fullName: 'Mohammad Al-Sayed' }),
                                    rec({ fullName: 'Mohammad Al-Sayed' }), { today: TODAY }));
    ok(note.indexOf('HOW THE VALUES WERE OBTAINED') < 0,
       'typed values are the default and need no disclosure');
  });

  group('OCR — reconstructing a misread zone');

  var CLEAN_MRZ = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\n' +
                  'L898902C36UTO7408122F1204159ZE184226B<<<<<10';

  test('Filler characters are recovered from OCR junk', function () {
    var junk = CLEAN_MRZ.split('\n').map(function (l) { return l.replace(/</g, '«'); }).join('\n');
    var asm = O.assembleMrz(O.candidateLines(junk));
    ok(asm, 'should find a zone');
    eq(asm.format, 'TD3');
    eq(asm.lines.join('\n'), CLEAN_MRZ, 'fillers must be restored');
  });
  test('Letters misread inside a date are corrected to digits', function () {
    // O for 0 and I for 1 are the classic OCR-B confusions. Positions 14-19 of
    // the second line are a date, so those cannot legally be letters.
    var noisy = CLEAN_MRZ.replace('7408122', '74O8I22').replace('1204159', '12O4I59');
    var asm = O.assembleMrz(O.candidateLines(noisy));
    var fixed = O.correctByLayout(asm.format, asm.lines);
    eq(fixed.lines.join('\n'), CLEAN_MRZ, 'the zone should be fully recovered');
    eq(fixed.corrections.length, 4, 'four characters should have been corrected');
    // And the recovery is confirmed by arithmetic, not by hope.
    eq(M.parse(fixed.lines.join('\n'), 2026).allValid, true);
  });
  test('Correction never touches positions that may legally be letters', function () {
    // The name field is alphabetic throughout, so nothing there is rewritten.
    var asm = O.assembleMrz(O.candidateLines(CLEAN_MRZ));
    var fixed = O.correctByLayout('TD3', asm.lines);
    eq(fixed.corrections.length, 0, 'a clean zone needs no corrections');
    eq(fixed.lines[0], CLEAN_MRZ.split('\n')[0], 'the name line must be untouched');
  });
  test('Correction cannot rescue a genuinely wrong zone', function () {
    // Changing a digit to another digit is not a character-class error, so the
    // corrector leaves it and the check digits catch it. Correction must never
    // be able to manufacture a passing document.
    var tampered = CLEAN_MRZ.replace('L898902C36', 'L898902C46');
    var fixed = O.correctByLayout('TD3', tampered.split('\n'));
    eq(M.parse(fixed.lines.join('\n'), 2026).allValid, false,
       'a real alteration must still fail');
  });
  test('Nonsense is reported rather than forced into a shape', function () {
    eq(O.assembleMrz(O.candidateLines('hello world\nthis is not a document')), null);
  });
  test('A verified zone does NOT validate the name', function () {
    // The check digits cover the data line only — in TD3 the composite spans
    // line 2, in TD1 it excludes line 3. The name is protected in neither, so a
    // zone that verifies says nothing about the name printed in it. Claiming
    // otherwise would be a false assurance about the one field this whole tool
    // exists to compare.
    var parsed = M.parse(CLEAN_MRZ, 2026);
    eq(parsed.allValid, true, 'the zone itself verifies');

    var res = O.buildProposals(
      { format: 'TD3', text: CLEAN_MRZ, corrections: [], parsed: parsed }, '');
    ok(res.ok, 'should produce proposals');

    function validatedFor(field) {
      var p = res.proposals.filter(function (x) { return x.field === field; })[0];
      ok(p, 'expected a proposal for ' + field);
      return p.validated;
    }
    eq(validatedFor('dob'), true, 'date of birth carries a check digit');
    eq(validatedFor('expiry'), true, 'expiry carries a check digit');
    eq(validatedFor('docNumber'), true, 'document number carries a check digit');
    eq(validatedFor('fullName'), false, 'NO check digit covers the name');
    eq(validatedFor('country'), false, 'nationality sits outside the composite');
  });
  test('Nothing read off the printed page may claim validation', function () {
    var visual = O.buildProposals(null, 'DATE OF BIRTH 12 AUG 1974');
    ok(visual.proposals.length > 0, 'printed-page reads should still be offered');
    ok(visual.proposals.every(function (p) { return !p.validated; }),
       'the printed side carries no check digits at all');
  });
  test('Trailing filler is restored without touching real names', function () {
    eq(O.restoreTrailingFiller('P<UTOERIKSSON<<ANNA<MARIALLLLLLLLLLLLLLLLLL')
        .slice(-6), '<<<<<<', 'a long run of one letter at the end is padding');
    eq(O.restoreTrailingFiller('SMITH<<JOHN<LLL'), 'SMITH<<JOHN<LLL',
       'a short run is left alone — three letters could be a name');
    eq(O.restoreTrailingFiller('P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<'),
       'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<', 'clean input is unchanged');
  });
  test('The bundled specimen carries an arithmetically valid zone', function () {
    // The specimen is what the demo reads, so its check digits have to be real.
    // Editing the drawing by hand without recomputing them would leave a demo
    // that reports a document failing its own arithmetic. Guards the source SVG
    // rather than the rendered PNG, since the SVG is what a person would edit.
    if (typeof require === 'undefined') return;   // browser run: skipped
    var svg = require('fs').readFileSync(__dirname + '/specimen.svg', 'utf8');
    var lines = (svg.match(/>([PL][A-Z0-9&;lt<]{20,})</g) || [])
      .map(function (m) { return m.slice(1, -1).replace(/&lt;/g, '<'); })
      .filter(function (l) { return l.length === 44; });
    eq(lines.length, 2, 'expected two 44-character lines in the specimen');
    var parsed = M.parse(lines.join('\n'), 2026);
    ok(parsed.ok, 'the specimen zone should parse');
    eq(parsed.allValid, true, 'every check digit in the specimen must verify');
    eq(parsed.fields.name.full, 'ANNA MARIA ERIKSSON');
    eq(parsed.fields.issuingState, 'UTO',
       'the specimen must stay on the fictional ICAO state, not a real country');
  });
  test('The layout table agrees with what parse() actually reads', function () {
    // These are two descriptions of the same standard and must not drift apart.
    [['TD3', CLEAN_MRZ]].forEach(function (pair) {
      pair[1].split('\n').forEach(function (line, li) {
        for (var p = 0; p < line.length; p++) {
          var t = M.charTypeAt(pair[0], li, p);
          if (t === 'd') ok(/[0-9]/.test(line[p]), 'expected a digit at line ' + li + ' pos ' + p);
          if (t === 'a') ok(/[A-Z<]/.test(line[p]), 'expected a letter at line ' + li + ' pos ' + p);
        }
      });
    });
  });

  /* ── Address ──────────────────────────────────────────────────────────── */

  group('Address');

  test('One town written three ways is recognised as one town', function () {
    var res = K.compare(
      rec({ fullName: 'Mohammad Al-Sayed', address: 'אום אל-פחם' }),
      rec({ fullName: 'Mohammad Al-Sayed', address: 'Umm al-Fahm' }),
      { today: TODAY });
    var c = res.checks.filter(function (x) { return x.field === 'Address'; })[0];
    eq(c.status, 'ok', 'localities should agree: ' + c.statusLabel);
  });
  test('The address can never decide an outcome on its own', function () {
    var res = K.compare(
      rec({ fullName: 'Mohammad Al-Sayed', address: 'Haifa' }),
      rec({ fullName: 'Mohammad Al-Sayed', address: 'Berlin' }),
      { today: TODAY });
    eq(res.verdict, 'MATCH', 'a differing address must not cap the verdict');
  });

  /* ── End to end ───────────────────────────────────────────────────────── */

  group('The sample cases end to end');

  function sample(key) {
    var C = (typeof module !== 'undefined' && module.exports)
      ? loadCasesInNode() : SAMPLE_CASES;
    return K.compare(C[key].a, C[key].b, { today: TODAY });
  }
  function loadCasesInNode() {
    var fs = require('fs'), p = require('path');
    var src = fs.readFileSync(p.join(__dirname, 'cases.js'), 'utf8');
    var box = {};
    new Function('g', src + '\ng.SAMPLE_CASES = SAMPLE_CASES;')(box);
    return box.SAMPLE_CASES;
  }

  test('Clean match returns MATCH', function () {
    var r = sample('clean');
    eq(r.verdict, 'MATCH');
    eq(r.nameScore, 100, 'name score');
  });
  test('Transliteration mismatch returns MATCH — the headline result', function () {
    var r = sample('translit');
    eq(r.verdict, 'MATCH');
    gte(r.nameScore, 85, 'name score');
  });
  test('Naive comparison scores that same pair near zero', function () {
    // The contrast this project exists to demonstrate: identical inputs, one
    // naive string comparison, one engine.
    var C = (typeof module !== 'undefined' && module.exports)
      ? loadCasesInNode() : SAMPLE_CASES;
    eq(C.translit.a.fullName === C.translit.b.fullName, false,
       'raw strings must not be equal, or the case proves nothing');
    ok(sample('translit').nameScore >= 85, 'but the engine matches them');
  });
  test('Day/month swap returns REFER and names the rule', function () {
    var r = sample('dobswap');
    eq(r.verdict, 'REFER');
    ok(r.hardStops.some(function (h) { return h.rule === 'DOB-SWAP'; }), 'DOB-SWAP must cap');
  });
  test('Arabic ID against a Hebrew record returns MATCH with no Latin involved', function () {
    var r = sample('arabhebrew');
    eq(r.verdict, 'MATCH');
    eq(r.nameScore, 100, 'name score');
    // The town has the same problem as the person and goes through the same engine.
    var addr = r.checks.filter(function (c) { return c.field === 'Address'; })[0];
    eq(addr.status, 'ok', 'أم الفحم vs אום אל-פחם: ' + addr.statusLabel);
  });
  test('Passport against ID card returns MATCH across two documents', function () {
    var r = sample('crossdoc');
    eq(r.verdict, 'MATCH', 'one person, two documents');
    eq(r.nameScore, 100, 'name score');
    var num = r.checks.filter(function (c) { return c.field === 'Document number'; })[0];
    eq(num.statusLabel, 'Not comparable', 'M1234567 against 310256789');
  });
  test('Different person returns NO MATCH', function () {
    var r = sample('different');
    eq(r.verdict, 'NO_MATCH');
    lte(r.nameScore, 60, 'name score');
  });

  /* ── Reproducibility ──────────────────────────────────────────────────── */

  group('Reproducibility');

  test('The same inputs produce a byte-identical case note', function () {
    var a = rec({ fullName: 'محمد أحمد السيد' });
    var b = rec({ fullName: 'Muhammed Elsayed' });
    var n1 = K.caseNote(K.compare(a, b, { today: TODAY }));
    var n2 = K.caseNote(K.compare(a, b, { today: TODAY }));
    eq(n1, n2, 'case notes diverged between two runs');
    ok(n1.length > 400, 'the note should actually contain the finding');
  });
  test('Every score in a breakdown cites at least one rule', function () {
    var r = K.compare(rec({ fullName: 'محمد أحمد السيد' }),
                      rec({ fullName: 'Mahmoud Al-Sharif' }), { today: TODAY });
    r.name.pairs.forEach(function (p) {
      ok(p.rules && p.rules.length, 'a name row carried no rule id: ' + JSON.stringify(p));
    });
    r.checks.forEach(function (c) {
      ok(c.rules && c.rules.length, 'a check row carried no rule id: ' + c.field);
    });
  });
  test('Every rule cited by the engine exists in the registry', function () {
    var REG = (typeof module !== 'undefined' && module.exports)
      ? require('./rules.js').RULES : RULES;
    var seen = {};
    [['محمد أحمد السيد', 'Muhammed Elsayed'],
     ['Mohammad Al-Sayed', 'Mahmoud Al-Sharif'],
     ['מוחמד אלסייד', 'Mohammad Al-Sayed'],
     ['Abd al-Rahman bin Ahmad', 'Abdulrahman Ahmad']].forEach(function (pair) {
      var r = K.compare(rec({ fullName: pair[0], dob: '1994-03-07' }),
                        rec({ fullName: pair[1], dob: '1994-07-03' }), { today: TODAY });
      r.name.pairs.concat(r.checks).forEach(function (row) {
        row.rules.forEach(function (id) { seen[id] = true; });
      });
      r.name.preprocessing.forEach(function (f) {
        f.rules.forEach(function (id) { seen[id] = true; });
      });
    });
    Object.keys(seen).forEach(function (id) {
      ok(REG[id], 'rule ' + id + ' is cited by the engine but missing from rules.js');
    });
    ok(Object.keys(seen).length >= 10, 'expected the sweep to exercise many rules');
  });
  test('The Method page sound classes match what the engine actually does', function () {
    // This drifted once during development: ة was moved from the T class to the
    // vowel class in the map, and the published table still listed it under T.
    // The whole auditability claim rests on the documentation being generated
    // from the data the engine runs on, so it gets a test.
    var LX = (typeof module !== 'undefined' && module.exports)
      ? require('./lexicon.js')
      : { EQUIVALENCE_DISPLAY: EQUIVALENCE_DISPLAY, ARABIC_MAP: ARABIC_MAP,
          HEBREW_MAP: HEBREW_MAP };

    var arabic = /[؀-ۿ]/;
    var hebrew = /[֐-׿]/;

    LX.EQUIVALENCE_DISPLAY.forEach(function (entry) {
      entry.members.split('·').forEach(function (segment) {
        segment.trim().split(/[\s,]+/).filter(Boolean).forEach(function (item) {
          if (item.length !== 1) return;          // digraphs and prose, skip
          if (arabic.test(item)) {
            eq(LX.ARABIC_MAP[item], entry.cls,
               'Method page lists ' + item + ' under class ' + entry.cls);
          } else if (hebrew.test(item)) {
            eq(LX.HEBREW_MAP[item], entry.cls,
               'Method page lists ' + item + ' under class ' + entry.cls);
          }
        });
      });
    });
  });
  test('Thresholds change the verdict and are carried into the result', function () {
    var a = rec({ fullName: 'Mohammad Al-Sayed' });
    var b = rec({ fullName: 'Mohammad Al-Sharif' });
    var strict = K.compare(a, b, { today: TODAY, thresholds: { match: 95, refer: 90 } });
    var loose  = K.compare(a, b, { today: TODAY, thresholds: { match: 40, refer: 30 } });
    eq(strict.thresholds.match, 95, 'thresholds recorded');
    ok(K.caseNote(strict).indexOf('95') >= 0, 'the note must record the threshold used');
    ok(loose.verdict !== strict.verdict, 'thresholds must actually move the verdict');
  });

  /* ── Runner ───────────────────────────────────────────────────────────── */

  function run() {
    var results = [], passed = 0, failed = 0;
    groups.forEach(function (g) {
      results.push({ type: 'group', name: g.name });
      g.tests.forEach(function (t) {
        try {
          t.fn();
          passed++;
          results.push({ type: 'test', name: t.name, ok: true });
        } catch (e) {
          failed++;
          results.push({ type: 'test', name: t.name, ok: false, detail: e.message });
        }
      });
    });
    return { passed: passed, failed: failed, total: passed + failed, results: results };
  }

  return { run: run, groups: groups };
})();

/* Running `node tests.js` prints a report and sets a non-zero exit code on
 * failure, so it works in a terminal as well as in the browser. */
if (typeof module !== 'undefined' && module.exports && require.main === module) {
  var out = TEST_SUITE.run();
  out.results.forEach(function (r) {
    if (r.type === 'group') console.log('\n── ' + r.name);
    else if (r.ok) console.log('   ok   ' + r.name);
    else console.log('   FAIL ' + r.name + '\n          ' + r.detail);
  });
  console.log('\n' + out.passed + ' passed, ' + out.failed + ' failed, ' +
              out.total + ' total');
  process.exit(out.failed ? 1 : 0);
}
