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
      'Arabic harakat, tanwin, shadda and tatweel; Hebrew niqqud; Latin accents. All ' +
      'optional in writing and almost never present in a system record, so all removed ' +
      'before comparison. The Hebrew geresh is not among them — it is a letter modifier, ' +
      'handled under HEB-1.',
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
  'LAT-1': {
    name: 'Ambiguous Latin digraph',
    description:
      'Latin "ch" does not say which sound it stands for. In Hebrew- and German-influenced ' +
      'spelling it is /x/ — Chaim חיים, Baruch ברוך, Chalil خليل — and in French-influenced ' +
      'spelling, which is how a great many Arabic names reached Latin script, it is sh: ' +
      'Rachid رشيد, Cherif شريف. It is read as /x/ and marked uncertain, so it stays cheap ' +
      'against ش and ש as well. The softening applies only where the two classes were ' +
      'already a plausible slip: uncertainty about which letter was written does not make ' +
      'an unrelated letter a match. Note that "sh" and "kh" are not ambiguous and get none ' +
      'of this, which is what keeps Shalil and Khalil apart.',
  },
  'WEAK-1': {
    name: 'Weak letter added or dropped',
    description:
      'Arabic writes no short vowels and marks long ones with ا و ي; ع and ء routinely ' +
      'vanish in transliteration. Whether such a letter survives into a Latin spelling ' +
      'is close to arbitrary, so adding or dropping one is charged at half rate.',
  },
  'HEB-1': {
    name: 'Hebrew geresh is a letter modifier',
    description:
      'Hebrew has no letters for several Arabic consonants, so Israeli orthography marks ' +
      'them with a geresh: ג׳ is j, ר׳ is gh, ת׳ is th, ד׳ is dh, צ׳ is ch. It is a letter, ' +
      'not an optional diacritic, and is read before single letters — removing it would ' +
      'collapse each of those onto the wrong sound.',
  },
  'HEB-2': {
    name: 'Word-final ה is uncertain',
    description:
      'A Hebrew name ending in ה gives no way to tell whether it renders the silent Arabic ' +
      'ة (Shehadeh, Salameh) or the pronounced ه (Abdullah, Taha). Rather than guess, the ' +
      'letter matches an Arabic h for free and costs only a quarter to drop — the one ' +
      'handling that gets both families right instead of trading one for the other.',
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
  'DATE-1': {
    name: 'Not a valid date',
    description:
      'A date field is not a real calendar date — a bad month or day, or a shape other ' +
      'than YYYY-MM-DD. It cannot be compared, and a malformed date is a defect in the ' +
      'record rather than an agreeing value, so it refers.',
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
  'EXP-4': {
    name: 'Expiry dates not comparable',
    description:
      'The records describe different classes of document, which expire on their own ' +
      'schedules. There is nothing to compare, so the difference neither supports nor ' +
      'undermines the match. An expired document still caps the outcome under EXP-1.',
  },
  'ID-CHK': {
    name: 'Israeli ID check digit',
    description:
      'The Israeli identity number carries a published check digit over the first eight ' +
      'digits, weighted 1,2,1,2,1,2,1,2 with products above nine reduced by nine, summing ' +
      'to a multiple of ten. Verifiable arithmetic, not a format guess. Applies to the ' +
      'Israeli driving licence as well, which carries the same number — see NUM-4.',
  },
  'FMT-1': {
    name: 'Document number format',
    description:
      'Length and character-set sanity for the stated document type. ICAO Doc 9303 ' +
      'allows up to nine alphanumeric characters in the passport number field. The ' +
      'passport check digit is not in the printed number — it is in the machine-readable ' +
      'zone — so without an MRZ this is a format check and nothing more.',
  },
  'MRZ-1': {
    name: 'MRZ check digits',
    description:
      'Each MRZ field carries a check digit under ICAO Doc 9303: weight the characters ' +
      '7, 3, 1 repeating, sum, take modulo 10. This is what turns the document number ' +
      'from "plausibly formatted" into arithmetically verified, and it is the reason the ' +
      'MRZ is worth transcribing at all.',
  },
  'MRZ-2': {
    name: 'MRZ composite check digit',
    description:
      'A final check digit computed over every field that already carries one. Altering ' +
      'a single field and its own digit to match still fails this one, so the composite ' +
      'is the check that catches a tampered zone rather than a typing slip.',
  },
  'MRZ-3': {
    name: 'MRZ agrees with the printed record',
    description:
      'The machine-readable zone is compared against the values entered from the visual ' +
      'part of the same document. A disagreement between the two halves of one document ' +
      'is a genuine finding — it is where transcription errors and alterations show up.',
  },
  'MRZ-4': {
    name: 'MRZ not readable',
    description:
      'The zone could not be parsed as TD3 (two lines of forty-four) or TD1 (three lines ' +
      'of thirty). Reported as unread rather than guessed at — a half-parsed MRZ is worse ' +
      'than none.',
  },
  'NUM-1': {
    name: 'Document numbers agree',
    description: 'Both records cite the same document number.',
  },
  'NUM-2': {
    name: 'Document numbers differ',
    description:
      'Both records describe the same class of document but cite different numbers. One ' +
      'person can hold two — a renewal, a replacement — so this refers rather than fails.',
  },
  'NUM-3': {
    name: 'Document numbers not comparable',
    description:
      'The records describe different classes of document, so the two numbers are ' +
      'identifiers from different namespaces rather than two versions of one. Nothing ' +
      'follows from their being different, and the comparison rests on the other fields. ' +
      'Capping here would fire on every cross-document check, and an alarm that always ' +
      'sounds tells a reviewer nothing.',
  },
  'NUM-4': {
    name: 'Shared identifier scheme',
    description:
      'Israel issues the driving licence against the identity number of its holder and ' +
      'prints that number as the licence number, so an ID card and a driving licence for ' +
      'one person cite the same nine digits. These two classes of document therefore do ' +
      'share an identifier namespace and their numbers are compared rather than set aside ' +
      'under NUM-3 — a disagreement between them is a real discrepancy. Deliberately ' +
      'narrow: it is a fact about one country, gated on both records being Israeli and on ' +
      'exactly this pair of document types. An Israeli passport carries its own number and ' +
      'is not part of this, and the two documents still expire on their own schedules, so ' +
      'EXP-4 continues to apply to the dates.',
  },
  'TYPE-1': {
    name: 'Document type',
    description: 'Whether both records describe the same class of document.',
  },
  'CTRY-1': {
    name: 'Issuing country',
    description: 'Whether both records name the same issuing authority.',
  },
  'SEX-1': {
    name: 'Sex',
    description:
      'Whether the two records record the same sex. It matters because it is the one ' +
      'discriminator a consonant-skeleton name match is blind to: the feminine ending is ' +
      'silent in Arabic — فاطمة is Fatima, not Fatimat — so the skeleton correctly drops ' +
      'it, which also collapses Samir onto Samira and Karim onto Karima. Those are ' +
      'different people; a recorded sex is what separates them, so a disagreement caps the ' +
      'outcome. Only M and F are compared; a blank or unspecified value asserts nothing ' +
      'and cannot lower a verdict.',
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

  /* ── Provenance ───────────────────────────────────────────────────────── */

  'OCR-1': {
    name: 'Machine-read and unconfirmed',
    description:
      'A value was read off the printed side of a document by optical character ' +
      'recognition, where nothing carries a check digit and no arithmetic can confirm it, ' +
      'and no human has accepted it. The outcome is capped until one does. Optical ' +
      'recognition proposes values into the form; it is never part of the decision, and ' +
      'text nobody has looked at is not evidence.',
  },
  'OCR-2': {
    name: 'Machine-read and validated',
    description:
      'A value was read from the machine-readable zone and its ICAO Doc 9303 check digits ' +
      'verify, so the transcription is confirmed by arithmetic rather than by eye. The ' +
      'machine-readable zone is the only part of a document able to prove its own reading, ' +
      'which is why values from it need no separate confirmation.',
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
