/*
 * engine.js — the matching engine.
 *
 * No DOM access, no network, no randomness, no clock reads except the single
 * evaluation date passed in by the caller. Given the same two records, the same
 * thresholds and the same evaluation date, this file returns the same result
 * forever. That is the requirement it is built to: a verification decision has
 * to be reproducible on demand and explainable to someone who was not there.
 *
 * There is deliberately no model in the decision path. A score of 0.83 with no
 * account of where it came from cannot be audited, so every number this file
 * produces is accompanied by the id of the rule that produced it.
 *
 * Pipeline:
 *   tokenise → normalise → particles → skeleton → compare → align → aggregate
 *   then a checklist over the remaining fields, which can only LOWER the verdict.
 */

var KYC = (function () {
  'use strict';

  /* Loaded as globals in the browser, required in Node for the test runner. */
  var L = (typeof module !== 'undefined' && module.exports)
    ? require('./lexicon.js') : null;
  var CLS_              = L ? L.CLS : CLS;
  var WEAK_             = L ? L.WEAK : WEAK;
  var NEAR_LOOKUP_      = L ? L.NEAR_LOOKUP : NEAR_LOOKUP;
  var ARABIC_MAP_       = L ? L.ARABIC_MAP : ARABIC_MAP;
  var ARABIC_DIA_       = L ? L.ARABIC_DIACRITICS : ARABIC_DIACRITICS;
  var HEBREW_MAP_       = L ? L.HEBREW_MAP : HEBREW_MAP;
  var HEBREW_DIA_       = L ? L.HEBREW_DIACRITICS : HEBREW_DIACRITICS;
  var LATIN_DIGRAPHS_   = L ? L.LATIN_DIGRAPHS : LATIN_DIGRAPHS;
  var LATIN_MAP_        = L ? L.LATIN_MAP : LATIN_MAP;
  var LATIN_FOLD_       = L ? L.LATIN_FOLD : LATIN_FOLD;
  var VOWEL_GROUPS_     = L ? L.VOWEL_GROUPS : VOWEL_GROUPS;
  var ART_HYPH_         = L ? L.ARTICLE_HYPHENATED : ARTICLE_HYPHENATED;
  var ART_PLAIN_        = L ? L.ARTICLE_PLAIN : ARTICLE_PLAIN;
  var ART_ASSIM_        = L ? L.ARTICLE_ASSIMILATED : ARTICLE_ASSIMILATED;
  var ART_AR_           = L ? L.ARTICLE_ARABIC : ARTICLE_ARABIC;
  var ART_HE_           = L ? L.ARTICLE_HEBREW : ARTICLE_HEBREW;
  var JOIN_LAT_         = L ? L.JOINERS_LATIN : JOINERS_LATIN;
  var JOIN_AR_          = L ? L.JOINERS_ARABIC : JOINERS_ARABIC;
  var JOIN_HE_          = L ? L.JOINERS_HEBREW : JOINERS_HEBREW;
  var PAT_LAT_          = L ? L.PATRONYMIC_LATIN : PATRONYMIC_LATIN;
  var PAT_AR_           = L ? L.PATRONYMIC_ARABIC : PATRONYMIC_ARABIC;
  var PAT_HE_           = L ? L.PATRONYMIC_HEBREW : PATRONYMIC_HEBREW;
  var KNOWN_            = L ? L.KNOWN_LOOKUP : KNOWN_LOOKUP;
  var canonLabel_       = L ? L.canonicalLabel : canonicalLabel;

  var VERSION = '1.0.0';

  /* ── Edit costs ────────────────────────────────────────────────────────
   *
   * These four numbers are the entire tuning surface of the engine. They are
   * constants rather than learned weights so that a reader can check them.
   *
   * A weak letter costs a quarter because Arabic writes no short vowels at all
   * and marks long ones with ا و ي — whether a vowel survives into a Latin
   * spelling is close to arbitrary, and charging full price for it would fail
   * exactly the transliteration cases this tool exists to pass.
   */
  var COST = {
    SAME:          0,     // same sound class — no audible difference
    NEAR_SUB:      0.5,   // routine transliteration slip
    WEAK_INDEL:    0.25,  // a vowel appears in one spelling and not the other
    WEAK_SUB:      0.25,  // one vowel written for another
    STRONG_INDEL:  1,     // a consonant is present in one name and absent
    UNRELATED_SUB: 1,     // two genuinely different consonants
  };

  /* Role weights. Given and family carry the identification; a middle
   * patronymic is routinely present in one system and absent from the other. */
  var ROLE_WEIGHT = { given: 0.40, family: 0.40, middle: 0.20 };

  /* A middle token present in only one record is normal, not contradictory, so
   * it costs a flat few points rather than scoring zero at full weight. */
  var UNMATCHED_MIDDLE_PENALTY = 4;

  /* Below this, two tokens are not preferred as a greedy pair. Tokens left over
   * are still paired positionally afterwards, so a pair that scores zero is
   * shown with its reason rather than silently dropped. */
  var PAIR_FLOOR = 0.45;

  /* Where consonants agree but the first vowels point at different names, the
   * pair is held here. Below the default match threshold on purpose: the engine
   * should refer such a pair to a human, not wave it through. */
  var VOWEL_CONFLICT_CAP = 0.78;

  var VERDICT_ORDER = { NO_MATCH: 0, REFER: 1, MATCH: 2 };

  /* ── Script detection ──────────────────────────────────────────────────── */

  var RE_ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
  var RE_HEBREW = /[֐-׿יִ-ﭏ]/;

  function detectScript(text) {
    if (RE_ARABIC.test(text)) return 'arabic';
    if (RE_HEBREW.test(text)) return 'hebrew';
    return 'latin';
  }

  /* ── Normalisation ─────────────────────────────────────────────────────── */

  function normalizeToken(raw) {
    var t = String(raw).trim();
    var script = detectScript(t);

    if (script === 'arabic') {
      t = t.replace(ARABIC_DIA_, '');
    } else if (script === 'hebrew') {
      t = t.replace(HEBREW_DIA_, '');
    } else {
      t = t.toLowerCase();
      t = t.replace(/[^\u0000-\u007f]/g, function (ch) {
        return Object.prototype.hasOwnProperty.call(LATIN_FOLD_, ch)
          ? LATIN_FOLD_[ch] : ch;
      });
    }
    // Strip punctuation that carries no sound. Hyphens and apostrophes are kept
    // at this stage because the article rules need to see them.
    t = t.replace(/[.,;:_"“”()\[\]]/g, '');
    return t;
  }

  function tokenize(fullName) {
    if (!fullName) return [];
    return String(fullName)
      .split(/[\s،؛]+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  /* ── Skeleton ──────────────────────────────────────────────────────────── */

  /* Reduce a token to a sequence of sound classes. Every script maps into the
   * SAME class alphabet, which is what makes an Arabic string comparable to a
   * Latin one — the comparison never sees the original letters.
   *
   * Returns both the full class sequence and the consonant skeleton. Only the
   * skeleton is compared; the full sequence is kept so the engine can say when
   * dropping a vowel is what made two spellings agree. */
  function skeletonParts(token) {
    var script = detectScript(token);
    var t = normalizeToken(token).replace(/[-'’`ʿʼ]/g, function (m) {
      // An apostrophe in Latin transliteration usually stands for hamza or ayin.
      return script === 'latin' ? "'" : '';
    });
    var codes = [];
    var i;

    if (script === 'arabic' || script === 'hebrew') {
      var map = script === 'arabic' ? ARABIC_MAP_ : HEBREW_MAP_;
      for (i = 0; i < t.length; i++) {
        var c = map[t[i]];
        if (c) codes.push(c);
      }
    } else {
      // Longest match first: "kh" must not be read as k followed by h. This is
      // the only genuinely ambiguous mapper of the three.
      i = 0;
      while (i < t.length) {
        var two = t.substr(i, 2);
        if (Object.prototype.hasOwnProperty.call(LATIN_DIGRAPHS_, two)) {
          codes.push(LATIN_DIGRAPHS_[two]);
          i += 2;
          continue;
        }
        var one = t[i];
        if (Object.prototype.hasOwnProperty.call(LATIN_MAP_, one)) {
          codes.push(LATIN_MAP_[one]);
        }
        i += 1;
      }
    }

    // Collapse doubled classes. Arabic marks gemination with shadda on a single
    // letter, so "Mohammad" and محمد must not differ by the doubled m.
    var full = [];
    for (i = 0; i < codes.length; i++) {
      if (i === 0 || codes[i] !== codes[i - 1]) full.push(codes[i]);
    }

    /* Reduce to consonants. This is the step that makes the whole thing work:
     * Arabic writes no short vowels at all, so a Latin spelling always carries
     * vowels its Arabic original never had. Comparing anything but consonants
     * means charging edit distance for a difference that does not exist in the
     * name — "Mohammad" against محمد would never agree.
     *
     * و and ي are the exception. Word-initially they are true consonants
     * (Walid, Yousef) and are kept; anywhere else they are long vowels
     * (Mahmoud, Nour) and go. ا, ء and ع always go — علي is simply "Ali".
     *
     * The cost of this is real and is documented on the Method page: dropping
     * vowels makes Mohammad and Mahmoud identical. That is what the known-name
     * table above the skeleton exists to catch. */
    var cons = full.filter(function (c, idx) {
      if (c === CLS_.A) return false;
      if (c === CLS_.W || c === CLS_.Y) return idx === 0;
      return true;
    });

    return { full: full.join(''), cons: cons.join('') };
  }

  /* The consonant skeleton — what the comparison actually runs on. */
  function skeleton(token) {
    return skeletonParts(token).cons;
  }

  /* The first vowel of a Latin spelling. Arabic and Hebrew do not write short
   * vowels, so this returns null for them — and the comparison that uses it only
   * fires when BOTH sides are known. */
  function firstVowelGroup(token) {
    if (detectScript(token) !== 'latin') return null;
    var t = normalizeToken(token);
    for (var i = 0; i < t.length; i++) {
      if (Object.prototype.hasOwnProperty.call(VOWEL_GROUPS_, t[i])) {
        return VOWEL_GROUPS_[t[i]];
      }
    }
    return null;
  }

  /* ── Weighted edit distance over class codes ───────────────────────────── */

  function substitutionCost(x, y) {
    if (x === y) return { cost: COST.SAME, rule: 'CLS-1' };
    if (NEAR_LOOKUP_.has(x + y)) return { cost: COST.NEAR_SUB, rule: 'CLS-2' };
    if (WEAK_.has(x) && WEAK_.has(y)) return { cost: COST.WEAK_SUB, rule: 'WEAK-1' };
    return { cost: COST.UNRELATED_SUB, rule: 'SKEL-3' };
  }

  function indelCost(x) {
    return WEAK_.has(x)
      ? { cost: COST.WEAK_INDEL, rule: 'WEAK-1' }
      : { cost: COST.STRONG_INDEL, rule: 'SKEL-3' };
  }

  /* Levenshtein over the class alphabet with a backtrace, so the engine can say
   * WHICH rule priced each difference rather than only reporting a total. */
  function skeletonDistance(s1, s2) {
    var n = s1.length, m = s2.length;
    var d = [], op = [];
    var i, j;

    for (i = 0; i <= n; i++) { d[i] = [i === 0 ? 0 : 0]; op[i] = ['']; }
    d[0][0] = 0;
    for (i = 1; i <= n; i++) { d[i][0] = d[i - 1][0] + indelCost(s1[i - 1]).cost; op[i][0] = 'del'; }
    for (j = 1; j <= m; j++) { d[0][j] = d[0][j - 1] + indelCost(s2[j - 1]).cost; op[0][j] = 'ins'; }

    for (i = 1; i <= n; i++) {
      for (j = 1; j <= m; j++) {
        var sub = d[i - 1][j - 1] + substitutionCost(s1[i - 1], s2[j - 1]).cost;
        var del = d[i - 1][j] + indelCost(s1[i - 1]).cost;
        var ins = d[i][j - 1] + indelCost(s2[j - 1]).cost;
        var best = Math.min(sub, del, ins);
        d[i][j] = best;
        op[i][j] = best === sub ? 'sub' : (best === del ? 'del' : 'ins');
      }
    }

    // Walk back to find out which rules actually fired.
    var rules = {}, notes = [];
    i = n; j = m;
    while (i > 0 || j > 0) {
      var o = (i > 0 && j > 0) ? op[i][j] : (i > 0 ? 'del' : 'ins');
      if (o === 'sub') {
        var sc = substitutionCost(s1[i - 1], s2[j - 1]);
        if (sc.cost > 0) { rules[sc.rule] = true; notes.push(s1[i - 1] + '/' + s2[j - 1]); }
        else if (s1[i - 1] === s2[j - 1]) { rules['CLS-1'] = true; }
        i--; j--;
      } else if (o === 'del') {
        rules[indelCost(s1[i - 1]).rule] = true;
        notes.push('-' + s1[i - 1]);
        i--;
      } else {
        rules[indelCost(s2[j - 1]).rule] = true;
        notes.push('+' + s2[j - 1]);
        j--;
      }
    }

    return { cost: d[n][m], rules: Object.keys(rules), notes: notes.reverse() };
  }

  /* ── Token comparison ──────────────────────────────────────────────────── */

  function lookupKnown(token) {
    var t = normalizeToken(token).replace(/[-'’`ʿʼ\s]/g, '');
    return KNOWN_.get(t) || null;
  }

  /* Compare two name tokens. Returns a score in 0..1, the rules that produced
   * it, and a sentence a human can read. */
  function compareTokens(a, b) {
    if (!a || !b) {
      return { score: 0, rules: ['MISS-1'], reason: 'One record has no token here.' };
    }

    /* Layer 1 — the known-name table. Authoritative in both directions. */
    var ka = lookupKnown(a), kb = lookupKnown(b);
    if (ka && kb) {
      if (ka === kb) {
        return {
          score: 1,
          rules: ['LEX-1'],
          reason: '"' + a + '" and "' + b + '" are both attested spellings of ' +
                  canonLabel_(ka) + '.',
        };
      }
      return {
        score: 0,
        rules: ['LEX-2'],
        reason: '"' + a + '" is ' + canonLabel_(ka) + ' and "' + b + '" is ' +
                canonLabel_(kb) + ' — two different names, not two spellings of one. ' +
                'Their consonants alone do not separate them.',
      };
    }

    /* Layer 2 — the consonant skeleton. */
    var pa = skeletonParts(a), pb = skeletonParts(b);
    var s1 = pa.cons, s2 = pb.cons;
    if (!s1.length && !s2.length) {
      return { score: 0, rules: ['MISS-1'], reason: 'Neither token yields a skeleton.' };
    }

    if (s1 === s2) {
      // Note when it was the vowels that differed, since that is the entire
      // premise of the tool and the reader should see it happening.
      var vowelsDiffered = pa.full !== pb.full;
      var res = {
        score: 1,
        rules: vowelsDiffered ? ['SKEL-1', 'WEAK-1'] : ['SKEL-1'],
        reason: '"' + a + '" and "' + b + '" reduce to the same consonant skeleton ' +
                s1 + '.' + (vowelsDiffered
                  ? ' They are spelled differently (' + pa.full + ' against ' + pb.full +
                    '), but the difference is entirely in vowels, which Arabic does not ' +
                    'write.'
                  : ''),
      };
      return applyVowelCheck(res, a, b);
    }

    var dist = skeletonDistance(s1, s2);
    var maxLen = Math.max(s1.length, s2.length);
    var score = Math.max(0, 1 - dist.cost / maxLen);

    var rules = [score >= 0.6 ? 'SKEL-2' : 'SKEL-3'].concat(
      dist.rules.filter(function (r) { return r !== 'SKEL-3'; })
    );

    var reason;
    if (score >= 0.6) {
      reason = '"' + a + '" (' + s1 + ') and "' + b + '" (' + s2 + ') differ by ' +
               dist.cost + ' against a length of ' + maxLen + ' — ' +
               describeNotes(dist.notes) + '.';
    } else {
      reason = '"' + a + '" (' + s1 + ') and "' + b + '" (' + s2 + ') do not reduce to ' +
               'comparable sounds; the difference is substantive, not orthographic.';
    }

    return applyVowelCheck({ score: round2(score), rules: rules, reason: reason }, a, b);
  }

  function describeNotes(notes) {
    if (!notes.length) return 'no substantive change';
    var shown = notes.slice(0, 4).join(', ');
    return notes.length > 4 ? shown + ', …' : shown;
  }

  /* The first-vowel tiebreaker. Holds a pair back from a clean match when the
   * consonants agree but the vowels point at different names. Never fails a pair
   * on its own — it can only cap. */
  function applyVowelCheck(result, a, b) {
    if (result.score < 0.9) return result;
    var va = firstVowelGroup(a), vb = firstVowelGroup(b);
    if (!va || !vb || va === vb) return result;

    return {
      score: VOWEL_CONFLICT_CAP,
      rules: result.rules.concat(['VOW-1']),
      reason: result.reason + ' The consonants agree but the first vowels do not (' +
              va + ' against ' + vb + '), which is the one vowel that tends to survive ' +
              'transliteration — held back from a clean match.',
    };
  }

  /* ── Particles ─────────────────────────────────────────────────────────── */

  function isJoiner(tok) {
    var n = normalizeToken(tok).replace(/[-'’]/g, '');
    return JOIN_LAT_.indexOf(n) >= 0 || JOIN_AR_.indexOf(n) >= 0 ||
           JOIN_HE_.indexOf(n) >= 0;
  }

  function isPatronymic(tok) {
    var n = normalizeToken(tok).replace(/[-'’]/g, '');
    return PAT_LAT_.indexOf(n) >= 0 || PAT_AR_.indexOf(n) >= 0 ||
           PAT_HE_.indexOf(n) >= 0;
  }

  function stripArticle(tok, isFirst, findings) {
    var t = tok;

    // A token that is itself a known name is never treated as carrying an
    // article. This is what stops "Ali" being reduced to "i" and الله to له.
    if (lookupKnown(t)) return t;

    var script = detectScript(t);

    if (script === 'arabic' && ART_AR_.test(t)) {
      findings.push({ rules: ['ART-1'], subject: tok,
        reason: 'Arabic definite article ال removed.' });
      return t.replace(ART_AR_, '');
    }
    if (script === 'hebrew' && ART_HE_.test(t)) {
      findings.push({ rules: ['ART-1'], subject: tok,
        reason: 'Hebrew definite article אל removed.' });
      return t.replace(ART_HE_, '');
    }

    if (script === 'latin') {
      if (ART_HYPH_.test(t)) {
        var m = t.match(ART_HYPH_);
        var isSun = !/^(a|e|u)l-/i.test(m[0]);
        findings.push({
          rules: [isSun ? 'ART-2' : 'ART-1'], subject: tok,
          reason: isSun
            ? 'Article "' + m[0] + '" removed — assimilated to the sun letter that follows.'
            : 'Definite article "' + m[0] + '" removed.',
        });
        return t.replace(ART_HYPH_, '');
      }
      // Unhyphenated forms are ambiguous with names that simply begin in al-/el-,
      // so they are only stripped away from the first position, where an article
      // is not expected.
      if (!isFirst && ART_ASSIM_.test(t)) {
        var ma = t.match(ART_ASSIM_);
        findings.push({ rules: ['ART-2'], subject: tok,
          reason: 'Article "' + ma[1] + ma[2] + '" removed — assimilated to the doubled ' +
                  'sun letter that follows.' });
        return t.replace(/^(a|e)([lnrstdz])/i, '');
      }
      if (!isFirst && ART_PLAIN_.test(t)) {
        findings.push({ rules: ['ART-1'], subject: tok,
          reason: 'Definite article "' + t.substr(0, 2) + '" removed.' });
        return t.replace(ART_PLAIN_, '');
      }
    }
    return t;
  }

  /* Run the particle layer over a full token list. Nothing is ever dropped
   * silently — every change returns a finding that names its rule. */
  function preprocessTokens(rawTokens) {
    var findings = [];
    var tokens = rawTokens.map(normalizeToken).filter(Boolean);
    var i;

    // 1. Join compound names. عبد is half of a name, not a particle.
    var joined = [];
    for (i = 0; i < tokens.length; i++) {
      if (isJoiner(tokens[i]) && i + 1 < tokens.length) {
        var merged = (tokens[i] + tokens[i + 1]).replace(/[-'’\s]/g, '');
        findings.push({
          rules: ['JOIN-1'], subject: tokens[i] + ' ' + tokens[i + 1],
          reason: '"' + tokens[i] + '" is part of the name that follows it, not a ' +
                  'particle — joined to "' + tokens[i + 1] + '" rather than stripped.',
        });
        joined.push(merged);
        i++;
      } else {
        joined.push(tokens[i]);
      }
    }

    // 2. Remove patronymic markers.
    var kept = [];
    for (i = 0; i < joined.length; i++) {
      if (isPatronymic(joined[i]) && joined.length > 1) {
        findings.push({
          rules: ['PAT-1'], subject: joined[i],
          reason: '"' + joined[i] + '" marks a patronymic ("son/daughter of") and is ' +
                  'carried inconsistently between systems — removed.',
        });
      } else {
        kept.push(joined[i]);
      }
    }

    // 3. Strip the definite article.
    var final = kept.map(function (t, idx) {
      return stripArticle(t, idx === 0, findings);
    }).filter(Boolean);

    return { tokens: final, original: kept, findings: findings };
  }

  /* ── Alignment ─────────────────────────────────────────────────────────── */

  function roleOf(index, total) {
    if (total === 1) return 'given';
    if (index === 0) return 'given';
    if (index === total - 1) return 'family';
    return 'middle';
  }

  /* Greedy highest-pair-first, with a deterministic tiebreak. Greedy rather than
   * globally optimal on purpose: it can be replayed by hand, step by step, and
   * being able to replay it is the product. */
  function alignTokens(ta, tb) {
    var matrix = [];
    ta.forEach(function (a, i) {
      tb.forEach(function (b, j) {
        var cmp = compareTokens(a, b);
        matrix.push({ i: i, j: j, cmp: cmp });
      });
    });

    matrix.sort(function (x, y) {
      if (y.cmp.score !== x.cmp.score) return y.cmp.score - x.cmp.score;
      if (x.i !== y.i) return x.i - y.i;
      return x.j - y.j;
    });

    var usedA = {}, usedB = {}, pairs = [];
    matrix.forEach(function (cell) {
      if (usedA[cell.i] || usedB[cell.j]) return;
      if (cell.cmp.score < PAIR_FLOOR) return;
      usedA[cell.i] = true;
      usedB[cell.j] = true;
      pairs.push(cell);
    });

    /* Second pass. Tokens that found no partner above the floor are paired off
     * by role and then by order, so that a genuine contradiction is SHOWN with
     * the rule that found it rather than disappearing into two separate
     * "unmatched" rows. This is what puts "Mohammad is not Mahmoud" on screen:
     * that pair scores zero, which is exactly the finding worth reporting. */
    var leftA = [], leftB = [];
    ta.forEach(function (_, i) { if (!usedA[i]) leftA.push(i); });
    tb.forEach(function (_, j) { if (!usedB[j]) leftB.push(j); });

    ['given', 'family', 'middle'].forEach(function (role) {
      leftA.slice().forEach(function (i) {
        if (usedA[i] || roleOf(i, ta.length) !== role) return;
        var j = leftB.find(function (jj) {
          return !usedB[jj] && roleOf(jj, tb.length) === role;
        });
        if (j === undefined) return;
        usedA[i] = true;
        usedB[j] = true;
        pairs.push({ i: i, j: j, cmp: compareTokens(ta[i], tb[j]) });
      });
    });

    pairs.sort(function (x, y) { return x.i - y.i; });
    return { pairs: pairs, usedA: usedA, usedB: usedB };
  }

  /* ── Name comparison ───────────────────────────────────────────────────── */

  function compareNames(nameA, nameB) {
    var pa = preprocessTokens(tokenize(nameA));
    var pb = preprocessTokens(tokenize(nameB));
    var ta = pa.tokens, tb = pb.tokens;
    var preprocessing = pa.findings.concat(pb.findings);

    if (!ta.length || !tb.length) {
      return {
        score: 0,
        pairs: [{
          a: nameA || '', b: nameB || '', role: '—', score: null,
          rules: ['MISS-1'],
          reason: 'A name is missing from one of the records, so no comparison is possible.',
        }],
        preprocessing: preprocessing,
        unmatchedMiddles: 0,
      };
    }

    var aligned = alignTokens(ta, tb);
    var rows = [], weighted = 0, totalWeight = 0, unmatchedMiddles = 0;

    aligned.pairs.forEach(function (p) {
      var role = roleOf(p.i, ta.length);
      var roleB = roleOf(p.j, tb.length);
      var rules = p.cmp.rules.slice();
      var reason = p.cmp.reason;

      // Position moved between the records. Recorded, not penalised — given,
      // father and family name are not in a stable order across systems.
      if (role !== roleB) {
        rules.push('ORD-1');
        reason += ' Matched out of position (' + role + ' in A, ' + roleB + ' in B); ' +
                  'name order is not stable across systems, so this is recorded rather ' +
                  'than charged.';
      }

      var weight = ROLE_WEIGHT[role];
      if (role === 'middle') {
        weight = ROLE_WEIGHT.middle / Math.max(1, countMiddles(ta.length));
      }

      weighted += p.cmp.score * weight;
      totalWeight += weight;

      rows.push({
        a: ta[p.i], b: tb[p.j], role: role, score: Math.round(p.cmp.score * 100),
        aSkeleton: skeleton(ta[p.i]), bSkeleton: skeleton(tb[p.j]),
        rules: rules, reason: reason,
      });
    });

    // Tokens left over on either side.
    ta.forEach(function (tok, i) {
      if (aligned.usedA[i]) return;
      var role = roleOf(i, ta.length);
      rows.push(unmatchedRow(tok, '', role, 'A'));
      if (role === 'middle') { unmatchedMiddles++; }
      else { totalWeight += ROLE_WEIGHT[role]; }
    });
    tb.forEach(function (tok, j) {
      if (aligned.usedB[j]) return;
      var role = roleOf(j, tb.length);
      rows.push(unmatchedRow('', tok, role, 'B'));
      if (role === 'middle') { unmatchedMiddles++; }
      else { totalWeight += ROLE_WEIGHT[role]; }
    });

    var raw = totalWeight > 0 ? (weighted / totalWeight) * 100 : 0;
    var score = Math.max(0, raw - unmatchedMiddles * UNMATCHED_MIDDLE_PENALTY);

    return {
      score: Math.round(score),
      pairs: rows,
      preprocessing: preprocessing,
      unmatchedMiddles: unmatchedMiddles,
    };
  }

  function countMiddles(total) { return Math.max(0, total - 2); }

  function unmatchedRow(a, b, role, side) {
    var isMiddle = role === 'middle';
    var other = side === 'A' ? 'B' : 'A';
    return {
      a: a, b: b, role: role, score: isMiddle ? null : 0,
      aSkeleton: a ? skeleton(a) : '', bSkeleton: b ? skeleton(b) : '',
      rules: [isMiddle ? 'TOK-1' : 'TOK-2'],
      reason: isMiddle
        ? '"' + (a || b) + '" appears in record ' + side + ' and not in record ' + other +
          '. A patronymic carried by one system and not the other is the most common ' +
          'benign difference in this data — noted, weighted lightly.'
        : '"' + (a || b) + '" appears in record ' + side + ' and has no counterpart in ' +
          'record ' + other + '. This is the ' + role + ' position, which identifies the ' +
          'person — treated as substantive.',
    };
  }

  /* ── Dates ─────────────────────────────────────────────────────────────── */

  function parseDate(s) {
    if (!s) return null;
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3], iso: s };
  }

  function checkDob(a, b) {
    var da = parseDate(a.dob), db = parseDate(b.dob);

    if (!da || !db) {
      return field('Date of birth', a.dob, b.dob, 'info', 'Not compared', ['MISS-1'],
        'A date of birth is missing, so no comparison is possible. Absence is reported, ' +
        'never scored as agreement.', 'REFER');
    }

    if (da.iso === db.iso) {
      var placeholder = da.m === 1 && da.d === 1;
      if (placeholder) {
        return field('Date of birth', a.dob, b.dob, 'info', 'Agrees (placeholder)',
          ['DOB-1', 'DOB-4'],
          'Both records carry the same date, but a first-of-January date is widely used ' +
          'where only the birth year was known. Treated as a year-only assertion.', null);
      }
      return field('Date of birth', a.dob, b.dob, 'ok', 'Agrees', ['DOB-1'],
        'Both records carry the same date of birth.', null);
    }

    if (da.y === db.y && da.m === db.d && da.d === db.m && da.m !== da.d) {
      return field('Date of birth', a.dob, b.dob, 'warn', 'Day/month transposed',
        ['DOB-SWAP'],
        'The two dates are the same numbers with day and month exchanged. This is a ' +
        'keying error between date conventions, not evidence of a different person — ' +
        'refer for confirmation against the source document rather than fail.', 'REFER');
    }

    if (da.y === db.y) {
      return field('Date of birth', a.dob, b.dob, 'warn', 'Year only', ['DOB-2'],
        'Same birth year, different day and month, and not a transposition.', 'REFER');
    }

    return field('Date of birth', a.dob, b.dob, 'bad', 'Differs', ['DOB-3'],
      'Different dates of birth with no recognised error pattern between them.', 'REFER');
  }

  function checkExpiry(a, b, today) {
    var ea = parseDate(a.expiry), eb = parseDate(b.expiry);
    if (!ea && !eb) {
      return field('Expiry', a.expiry, b.expiry, 'info', 'Not compared', ['MISS-1'],
        'No expiry date on either record.', null);
    }

    var expired = [];
    if (ea && ea.iso < today) expired.push('A');
    if (eb && eb.iso < today) expired.push('B');

    if (expired.length) {
      return field('Expiry', a.expiry, b.expiry, 'bad', 'Expired', ['EXP-1'],
        'The document on record ' + expired.join(' and ') + ' expired before the ' +
        'evaluation date of ' + today + '. An expired document cannot support a ' +
        'verification decision, so this caps the outcome whatever the name score.',
        'REFER');
    }

    if (ea && eb && ea.iso !== eb.iso) {
      return field('Expiry', a.expiry, b.expiry, 'warn', 'Differs', ['EXP-2'],
        'The records disagree about when the document expires, which usually means they ' +
        'describe two different documents.', 'REFER');
    }

    return field('Expiry', a.expiry, b.expiry, 'ok', 'Valid', ['EXP-3'],
      'Within validity as at ' + today + '.', null);
  }

  /* The Israeli identity number carries a published check digit. This is real
   * arithmetic on a real published scheme, not a format guess. */
  function israeliIdValid(num) {
    var digits = String(num).replace(/\D/g, '');
    if (digits.length !== 9) return null;
    var sum = 0;
    for (var i = 0; i < 9; i++) {
      var v = Number(digits[i]) * (i % 2 === 0 ? 1 : 2);
      if (v > 9) v -= 9;
      sum += v;
    }
    return sum % 10 === 0;
  }

  function checkDocNumber(a, b) {
    var out = [];
    var na = (a.docNumber || '').toUpperCase().replace(/\s/g, '');
    var nb = (b.docNumber || '').toUpperCase().replace(/\s/g, '');

    if (!na || !nb) {
      out.push(field('Document number', a.docNumber, b.docNumber, 'info', 'Not compared',
        ['MISS-1'], 'A document number is missing from one of the records.', 'REFER'));
    } else if (na === nb) {
      out.push(field('Document number', a.docNumber, b.docNumber, 'ok', 'Agrees',
        ['NUM-1'], 'Both records cite the same document number.', null));
    } else {
      out.push(field('Document number', a.docNumber, b.docNumber, 'warn', 'Differs',
        ['NUM-2'],
        'Different document numbers. This is legitimate where the records describe two ' +
        'different documents belonging to one person — a passport against a national ID ' +
        'card — so it refers rather than fails.', 'REFER'));
    }

    // Validation, per record, where a published scheme exists.
    [['A', a], ['B', b]].forEach(function (pair) {
      var side = pair[0], rec = pair[1];
      if (!rec.docNumber) return;

      if (rec.country === 'IL' && rec.docType === 'national_id') {
        var valid = israeliIdValid(rec.docNumber);
        if (valid === null) {
          out.push(field('ID check digit (' + side + ')', rec.docNumber, '', 'warn',
            'Wrong length', ['ID-CHK', 'FMT-1'],
            'An Israeli identity number is nine digits. This one is not, so the check ' +
            'digit cannot be evaluated.', 'REFER'));
        } else if (valid) {
          out.push(field('ID check digit (' + side + ')', rec.docNumber, '', 'ok',
            'Valid', ['ID-CHK'],
            'The ninth digit is the published check digit over the first eight and it ' +
            'verifies. The number is internally consistent.', null));
        } else {
          out.push(field('ID check digit (' + side + ')', rec.docNumber, '', 'bad',
            'Fails', ['ID-CHK'],
            'The check digit does not verify. The number as recorded cannot be a validly ' +
            'issued Israeli identity number, which points at a transcription error.',
            'REFER'));
        }
      } else if (rec.docType === 'passport') {
        var ok = /^[A-Z0-9]{6,9}$/.test((rec.docNumber || '').toUpperCase().replace(/\s/g, ''));
        out.push(field('Passport format (' + side + ')', rec.docNumber, '',
          ok ? 'ok' : 'warn', ok ? 'Plausible' : 'Implausible', ['FMT-1'],
          ok
            ? 'Within the nine alphanumeric characters ICAO Doc 9303 allows in the ' +
              'document-number field. Note that the passport check digit sits in the ' +
              'machine-readable zone, not in the printed number, so it cannot be ' +
              'verified from this field alone.'
            : 'Outside the nine alphanumeric characters ICAO Doc 9303 allows in the ' +
              'document-number field.',
          ok ? null : 'REFER'));
      }
    });

    return out;
  }

  function checkTypeAndCountry(a, b) {
    var out = [];
    var same = a.docType === b.docType;
    out.push(field('Document type', labelFor(a.docType), labelFor(b.docType),
      same ? 'ok' : 'info', same ? 'Same' : 'Differs', ['TYPE-1'],
      same
        ? 'Both records describe the same class of document.'
        : 'The records describe different classes of document. This is ordinary — a ' +
          'passport is checked against a system record created from an ID card — and is ' +
          'not treated as a discrepancy.',
      null));

    var sameC = a.country === b.country;
    out.push(field('Issuing country', a.country, b.country,
      sameC ? 'ok' : 'warn', sameC ? 'Same' : 'Differs', ['CTRY-1'],
      sameC
        ? 'Both records name the same issuing authority.'
        : 'The records name different issuing authorities. Worth confirming, but dual ' +
          'nationality and re-documentation both produce this legitimately.',
      null));
    return out;
  }

  /* Localities have the identical transliteration problem as people — Umm
   * al-Fahm, Um El Fahem and אום אל-פחם are one town — so the address reuses the
   * name engine. Weighted lightly; it can never decide an outcome. */
  var STREET_WORDS = ['st', 'str', 'street', 'rd', 'road', 'ave', 'avenue', 'blvd',
    'boulevard', 'apt', 'flat', 'floor', 'po', 'box', 'רחוב', 'רח', 'שדרות',
    'شارع', 'ش'];

  /* Strip house numbers and street-type words, leaving the part of an address
   * that actually identifies a place. Splits on the Arabic comma as well as the
   * ASCII one — عمان، الأردن uses U+060C, and missing that silently compared a
   * whole Arabic address against a bare Latin city name. */
  function localityOf(address) {
    if (!address) return '';
    return String(address)
      .replace(/[,،؛;]/g, ' ')
      .replace(/\d+/g, ' ')
      .split(/\s+/)
      .filter(function (w) {
        var n = normalizeToken(w).replace(/[-'’.]/g, '');
        return n && STREET_WORDS.indexOf(n) < 0;
      })
      .join(' ')
      .trim();
  }

  function checkAddress(a, b) {
    var la = localityOf(a.address), lb = localityOf(b.address);
    if (!la || !lb) {
      return field('Address', a.address, b.address, 'info', 'Not compared',
        ['MISS-1'], 'An address is missing from one of the records.', null);
    }

    var pa = preprocessTokens(tokenize(la)).tokens.join('');
    var pb = preprocessTokens(tokenize(lb)).tokens.join('');
    var sa = skeleton(pa), sb = skeleton(pb);

    var score;
    if (sa === sb) {
      score = 1;
    } else {
      var d = skeletonDistance(sa, sb);
      score = Math.max(0, 1 - d.cost / Math.max(sa.length, sb.length, 1));
    }
    var pct = Math.round(score * 100);

    return field('Address', la, lb,
      pct >= 80 ? 'ok' : (pct >= 50 ? 'warn' : 'info'),
      pct + '% similar', ['ADDR-1'],
      'House numbers and street-type words removed, then compared through the same ' +
      'skeleton engine used for names — place names transliterate exactly as ' +
      'inconsistently as people do (' + sa + ' against ' + sb + '). Weighted lightly; ' +
      'the address never decides an outcome on its own.',
      null);
  }

  function labelFor(v) {
    var map = {
      passport: 'Passport', national_id: 'National ID',
      residence_permit: 'Residence permit', drivers_license: "Driver's licence",
    };
    return map[v] || v || '';
  }

  function field(name, a, b, status, statusLabel, rules, reason, cap) {
    return {
      field: name, a: a || '', b: b || '', status: status, statusLabel: statusLabel,
      rules: rules, reason: reason, cap: cap || null,
    };
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  /* ── Top level ─────────────────────────────────────────────────────────── */

  function compare(recA, recB, opts) {
    opts = opts || {};
    var thresholds = opts.thresholds || { match: 85, refer: 60 };
    // The evaluation date is an input, not a clock read, so a run can be
    // reproduced later and still give the same answer.
    var today = opts.today || new Date().toISOString().slice(0, 10);

    var name = compareNames(recA.fullName, recB.fullName);

    var checks = []
      .concat([checkDob(recA, recB)])
      .concat([checkExpiry(recA, recB, today)])
      .concat(checkDocNumber(recA, recB))
      .concat(checkTypeAndCountry(recA, recB))
      .concat([checkAddress(recA, recB)]);

    /* Name score sets the provisional verdict. */
    var provisional;
    if (name.score >= thresholds.match) provisional = 'MATCH';
    else if (name.score >= thresholds.refer) provisional = 'REFER';
    else provisional = 'NO_MATCH';

    /* Checks can only lower it. */
    var verdict = provisional;
    var hardStops = [];
    checks.forEach(function (c) {
      if (!c.cap) return;
      hardStops.push({ rule: c.rules[0], cap: c.cap, reason: c.field + ': ' + c.reason });
      if (VERDICT_ORDER[c.cap] < VERDICT_ORDER[verdict]) verdict = c.cap;
    });

    var verdictReason = buildVerdictReason(provisional, verdict, name, thresholds);

    return {
      engineVersion: VERSION,
      evaluatedOn: today,
      thresholds: thresholds,
      recordA: recA,
      recordB: recB,
      nameScore: name.score,
      name: name,
      checks: checks,
      hardStops: hardStops,
      provisionalVerdict: provisional,
      verdict: verdict,
      verdictReason: verdictReason,
    };
  }

  function buildVerdictReason(provisional, verdict, name, th) {
    var base;
    if (provisional === 'MATCH') {
      base = 'The names score ' + name.score + ', at or above the match threshold of ' +
             th.match + '.';
    } else if (provisional === 'REFER') {
      base = 'The names score ' + name.score + ' — above the refer threshold of ' +
             th.refer + ' but below the match threshold of ' + th.match + '.';
    } else {
      base = 'The names score ' + name.score + ', below the refer threshold of ' +
             th.refer + '.';
    }

    if (verdict === provisional) {
      if (verdict === 'MATCH') {
        return base + ' No field check lowered this. The records describe the same person.';
      }
      if (verdict === 'REFER') {
        return base + ' A person should confirm this against the source document.';
      }
      return base + ' On the evidence in these two records, they do not describe the ' +
             'same person.';
    }

    return base + ' A field check lowered the outcome from ' + label(provisional) +
           ' to ' + label(verdict) + ' — see the capped conditions below. Checks can only ' +
           'lower a verdict, never raise it.';
  }

  function label(v) {
    return v === 'NO_MATCH' ? 'no match' : v.toLowerCase();
  }

  /* ── Case note ─────────────────────────────────────────────────────────── */

  /* The actual work-product. A verification decision is only useful if it can be
   * handed to someone else, so the same finding is restated as prose that names
   * every rule and records everything needed to reproduce the run. */
  function caseNote(res) {
    var L2 = [];
    var verdictWord = { MATCH: 'MATCH', REFER: 'REFER', NO_MATCH: 'NO MATCH' }[res.verdict];

    L2.push('IDENTITY RECORD COMPARISON — ' + verdictWord);
    L2.push('='.repeat(60));
    L2.push('');
    L2.push('Evaluated:   ' + res.evaluatedOn);
    L2.push('Engine:      ' + res.engineVersion + ' (deterministic, rule-based)');
    L2.push('Thresholds:  match >= ' + res.thresholds.match +
            ', refer >= ' + res.thresholds.refer);
    L2.push('Name score:  ' + res.nameScore + ' / 100');
    L2.push('');
    L2.push('RECORDS COMPARED');
    L2.push('-'.repeat(60));
    L2.push('A (identity document): ' + describeRecord(res.recordA));
    L2.push('B (system record):     ' + describeRecord(res.recordB));
    L2.push('');
    L2.push('FINDING');
    L2.push('-'.repeat(60));
    L2.push(wrap(res.verdictReason));
    L2.push('');

    if (res.name.preprocessing.length) {
      L2.push('NAME PREPROCESSING');
      L2.push('-'.repeat(60));
      res.name.preprocessing.forEach(function (f) {
        L2.push(wrap('[' + f.rules.join(', ') + '] ' + f.reason, '  '));
      });
      L2.push('');
    }

    L2.push('NAME COMPARISON');
    L2.push('-'.repeat(60));
    res.name.pairs.forEach(function (p) {
      var head = (p.a || '—') + '  vs  ' + (p.b || '—') +
                 '   [' + p.role + (p.score == null ? '' : ', ' + p.score + '/100') + ']';
      L2.push(head);
      L2.push(wrap('[' + p.rules.join(', ') + '] ' + p.reason, '     '));
    });
    L2.push('');

    L2.push('FIELD CHECKS');
    L2.push('-'.repeat(60));
    res.checks.forEach(function (c) {
      L2.push(c.field + ': ' + c.statusLabel);
      L2.push(wrap('[' + c.rules.join(', ') + '] ' + c.reason, '     '));
    });
    L2.push('');

    if (res.hardStops.length) {
      L2.push('CONDITIONS THAT CAPPED THE VERDICT');
      L2.push('-'.repeat(60));
      res.hardStops.forEach(function (h) {
        L2.push(wrap('[' + h.rule + '] caps at ' + h.cap.replace('_', ' ') +
                     ' — ' + h.reason, '  '));
      });
      L2.push('');
    }

    L2.push('-'.repeat(60));
    L2.push(wrap(
      'This comparison is rule-based and contains no model inference. Every score above ' +
      'names the rule that produced it. Re-running the same two records with the same ' +
      'thresholds and the same evaluation date reproduces this note exactly.'
    ));
    L2.push('Synthetic data — no real person or document is described here.');

    return L2.join('\n');
  }

  function describeRecord(r) {
    var bits = [r.fullName || '(no name)'];
    if (r.dob) bits.push('DOB ' + r.dob);
    if (r.docType) bits.push(labelFor(r.docType));
    if (r.docNumber) bits.push('no. ' + r.docNumber);
    if (r.country) bits.push(r.country);
    return bits.join(', ');
  }

  /* Wrap to a fixed width so the note pastes cleanly into a case management
   * system with a monospaced field. The indent is applied per line rather than
   * being part of the text, since splitting on whitespace would otherwise eat it
   * and leave only the first line indented. */
  function wrap(text, indent, width) {
    indent = indent || '';
    width = (width || 76) - indent.length;
    var words = String(text).trim().split(/\s+/);
    var lines = [], line = '';
    words.forEach(function (w) {
      if (!line.length) { line = w; return; }
      if ((line + ' ' + w).length > width) { lines.push(line); line = w; }
      else { line += ' ' + w; }
    });
    if (line.length) lines.push(line);
    return lines.map(function (l) { return indent + l; }).join('\n');
  }

  return {
    VERSION: VERSION,
    compare: compare,
    caseNote: caseNote,
    // Exposed for the test suite.
    skeleton: skeleton,
    compareTokens: compareTokens,
    compareNames: compareNames,
    preprocessTokens: preprocessTokens,
    tokenize: tokenize,
    detectScript: detectScript,
    israeliIdValid: israeliIdValid,
    localityOf: localityOf,
    firstVowelGroup: firstVowelGroup,
    skeletonDistance: skeletonDistance,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = KYC;
}
