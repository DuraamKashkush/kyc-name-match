/*
 * rules.js — the rule registry.
 *
 * This is the spine of the whole tool. The engine may not award or dock a point
 * without citing an id from this table, and the Method page is rendered from
 * this table rather than written by hand, so the published documentation cannot
 * drift away from the code that actually runs.
 *
 * If you are auditing a verdict, every id in the breakdown resolves here.
 */

const RULES = {

  /* ── Normalisation and particles ──────────────────────────────────────── */

  'NORM-1': {
    name: 'Orthographic normalisation',
    description:
      'Arabic harakat, tanwin, shadda and tatweel; Hebrew niqqud and geresh; Latin ' +
      'accents. All optional in writing and almost never present in a system record, ' +
      'so all removed before comparison.',
  },
  'ART-1': {
    name: 'Definite article removed',
    description:
      'al-, el-, ul- and the Arabic ال / Hebrew אל prefixes are the definite article, ' +
      'not part of the surname. Removed before comparison and always reported.',
  },
  'ART-2': {
    name: 'Assimilated article removed',
    description:
      'Before a sun letter the article assimilates and the spelling follows it: ' +
      'الشريف is written Ash-Sharif as often as Al-Sharif. Matching only al-/el- would ' +
      'miss a large share of real surnames.',
  },
  'JOIN-1': {
    name: 'Compound name joined',
    description:
      'عبد ("servant of") is half of a given name, not a particle — عبد الرحمن is one ' +
      'name written Abdulrahman, Abdel Rahman or Abd al-Rahman. أبو and أم head real ' +
      'family names. These are joined to the following token, never stripped.',
  },
  'PAT-1': {
    name: 'Patronymic marker removed',
    description:
      'bin, ibn, bint and their Arabic and Hebrew equivalents mean "son/daughter of" ' +
      'and are genuine separators. Systems retain them inconsistently, so they are ' +
      'removed — and the removal is reported.',
  },

  /* ── Name matching ────────────────────────────────────────────────────── */

  'LEX-1': {
    name: 'Attested variants of one name',
    description:
      'Both spellings appear in the known-name table under the same entry. This is a ' +
      'direct statement that the two are the same name, not an inference from string ' +
      'distance.',
  },
  'LEX-2': {
    name: 'Two different known names',
    description:
      'Both spellings are in the table under DIFFERENT entries. Mohammad and Mahmoud ' +
      'both reduce to the consonants M-H-M-D, so no skeleton method can separate them; ' +
      'this rule does, and refuses the match outright.',
  },
  'SKEL-1': {
    name: 'Identical consonant skeleton',
    description:
      'The two tokens reduce to the same sequence of sound classes. This is the rule ' +
      'that carries محمد, מוחמד and "Muhammed" to the same place.',
  },
  'SKEL-2': {
    name: 'Near consonant skeleton',
    description:
      'Skeletons differ by a small weighted edit distance. Cost is charged against the ' +
      'class alphabet, not the raw letters, so a spelling difference that does not ' +
      'change the sound costs nothing.',
  },
  'SKEL-3': {
    name: 'Skeletons differ',
    description:
      'The tokens do not reduce to a comparable sequence of sounds. This is a ' +
      'substantive difference, not a spelling one.',
  },
  'CLS-1': {
    name: 'Equivalence class substitution',
    description:
      'Two letters in the same sound class — ح خ ه all become h, ق and ك both become ' +
      'k. Charged nothing, because the difference does not exist in the spoken name.',
  },
  'CLS-2': {
    name: 'Near-class substitution',
    description:
      'Classes that are not identical but are a routine transliteration slip, such as ' +
      'th for both ث and ت. Charged half of an unrelated substitution.',
  },
  'WEAK-1': {
    name: 'Weak letter added or dropped',
    description:
      'Arabic writes no short vowels and marks long ones with ا و ي; ع and ء routinely ' +
      'vanish in transliteration. Whether such a letter survives into a Latin spelling ' +
      'is close to arbitrary, so adding or dropping one is charged at half rate.',
  },
  'VOW-1': {
    name: 'First vowel conflicts',
    description:
      'Consonants agree but the first vowels belong to different groups — Mo-/Mu- ' +
      'against Ma-. The first vowel survives transliteration better than any other, so ' +
      'this holds a pair back from a clean match. It never fails one on its own.',
  },
  'ORD-1': {
    name: 'Token matched out of position',
    description:
      'Given, father and family name do not appear in a stable order across systems, so ' +
      'tokens are matched independently of position. A reordering is recorded rather ' +
      'than penalised as a mismatch.',
  },
  'TOK-1': {
    name: 'Middle token present in one record only',
    description:
      'A patronymic carried by one system and not the other is the single most common ' +
      'benign discrepancy in this data. Noted, weighted lightly, not treated as a ' +
      'contradiction.',
  },
  'TOK-2': {
    name: 'Given or family token unmatched',
    description:
      'An unmatched token in the first or last position is substantive: those are the ' +
      'two positions that identify the person and the family.',
  },

  /* ── Field checks ─────────────────────────────────────────────────────── */

  'DOB-1': {
    name: 'Date of birth agrees',
    description: 'Both records carry the same date of birth.',
  },
  'DOB-SWAP': {
    name: 'Day and month transposed',
    description:
      'The two dates are the same numbers with day and month exchanged — 1994-03-07 ' +
      'against 1994-07-03. A keying error between date conventions, not evidence of a ' +
      'different person. Referred for confirmation rather than failed.',
  },
  'DOB-2': {
    name: 'Year agrees, day and month do not',
    description:
      'Same birth year, different day and month, not a transposition. Common where only ' +
      'a birth year was originally recorded.',
  },
  'DOB-3': {
    name: 'Date of birth differs',
    description: 'Different dates of birth with no recognised error pattern between them.',
  },
  'DOB-4': {
    name: 'Placeholder date of birth',
    description:
      'A first-of-January date is widely used by registries where only the birth year ' +
      'was known. Treated as a year-only assertion rather than a precise date.',
  },
  'EXP-1': {
    name: 'Document expired',
    description:
      'The expiry date precedes the evaluation date. An expired document cannot support ' +
      'a verification decision, so this caps the outcome regardless of the name score.',
  },
  'EXP-2': {
    name: 'Expiry dates differ',
    description:
      'The two records disagree about when the document expires, which usually means ' +
      'they describe two different documents.',
  },
  'EXP-3': {
    name: 'Document within validity',
    description: 'The expiry date is in the future as at the evaluation date.',
  },
  'ID-CHK': {
    name: 'Israeli ID check digit',
    description:
      'The Israeli identity number carries a published check digit over the first eight ' +
      'digits, weighted 1,2,1,2,1,2,1,2 with products above nine reduced by nine, summing ' +
      'to a multiple of ten. Verifiable arithmetic, not a format guess.',
  },
  'FMT-1': {
    name: 'Document number format',
    description:
      'Length and character-set sanity for the stated document type. ICAO Doc 9303 ' +
      'allows up to nine alphanumeric characters in the passport number field. Note that ' +
      'the passport check digit lives in the machine-readable zone, not in the printed ' +
      'number, so it cannot be verified from this field alone.',
  },
  'NUM-1': {
    name: 'Document numbers agree',
    description: 'Both records cite the same document number.',
  },
  'NUM-2': {
    name: 'Document numbers differ',
    description:
      'Different document numbers. Legitimate where the records describe two different ' +
      'documents belonging to one person, so this refers rather than fails.',
  },
  'TYPE-1': {
    name: 'Document type',
    description: 'Whether both records describe the same class of document.',
  },
  'CTRY-1': {
    name: 'Issuing country',
    description: 'Whether both records name the same issuing authority.',
  },
  'ADDR-1': {
    name: 'Address locality',
    description:
      'The locality is compared through the same skeleton engine used for names, because ' +
      'place names have the identical problem — Umm al-Fahm, Um El Fahem and אום אל-פחם ' +
      'are one town. Weighted lightly and never able to decide an outcome on its own.',
  },
  'MISS-1': {
    name: 'Field missing',
    description:
      'A field is absent from one or both records, so no comparison is possible. Absence ' +
      'of evidence is reported as such and never scored as agreement.',
  },

  /* ── Aggregation ──────────────────────────────────────────────────────── */

  'AGG-1': {
    name: 'Weighted name score',
    description:
      'Token scores combined by role — the given name and the family name carry more ' +
      'weight than a middle patronymic, because those are the positions that identify ' +
      'the person.',
  },
  'CAP-1': {
    name: 'Verdict capped',
    description:
      'A field check lowered the outcome below what the name score alone would give. ' +
      'Checks can only lower a verdict, never raise it: an expired document is a ' +
      'condition that stops the check, not a deduction from a score.',
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RULES };
}
