/*
 * lexicon.js — the linguistic data the engine runs on.
 *
 * Nothing here executes logic; it is all tables. Keeping them separate from
 * engine.js means the data can be reviewed by someone who knows Arabic naming
 * without reading any code, which is the point.
 *
 * Sources are public: standard Arabic and Hebrew orthography, the transliteration
 * conventions used across passports and civil registries in the region, and
 * ICAO Doc 9303 for the document-number field. No proprietary list is used.
 */

/* ── The shared class alphabet ────────────────────────────────────────────
 *
 * Every script maps into THIS alphabet. That is what makes it possible to
 * compare an Arabic string to a Latin one directly: both become sequences of
 * the same class codes, and the comparison never sees the original letters.
 *
 * Codes are single characters purely so skeletons stay short and readable in
 * the UI (محمد and "Mohammad" both render as "MHMD").
 */
const CLS = {
  B: 'B',   // b, p        ب  ב פּ      Arabic has no p; foreign p is written ب
  F: 'F',   // f, v, ph    ف  פ
  M: 'M',   // m           م  מ
  N: 'N',   // n           ن  נ
  L: 'L',   // l           ل  ל
  R: 'R',   // r           ر  ר
  H: 'H',   // h, kh       ح خ ه  ח ה   the spec's first collapse
  K: 'K',   // k, q, c     ق ك  ק כ
  J: 'J',   // j, g        ج  ג        Gamal/Jamal is one name
  G: 'G',   // gh          غ
  D: 'D',   // d           د ض  ד
  Z: 'Z',   // z, dh       ذ ز ظ  ז
  T: 'T',   // t           ت ط  ט ת
  S: 'S',   // s, th, ts   س ص ث  ס צ
  X: 'X',   // sh          ش  ש
  W: 'W',   // w, long u/o و  ו       weak
  Y: 'Y',   // y, long i/e ي  י       weak
  A: 'A',   // vowel, hamza, ayin  ا ء ع  א ע   weak
};

/* Weak classes are carried in the skeleton but are cheap to insert or delete.
 * Arabic writes long vowels with ا و ي and writes no short vowels at all, so
 * whether a given vowel survives into a Latin spelling is close to arbitrary.
 * ع (ayin) and ء (hamza) are consonants in Arabic that routinely vanish in
 * transliteration — علي becomes "Ali", not "Aali" — so they are weak too. */
const WEAK = new Set([CLS.A, CLS.W, CLS.Y]);

/* Latin digraphs whose sound depends on whose spelling convention wrote them.
 * "ch" is the only real one: it is /x/ in Hebrew- and German-influenced
 * spelling (Chaim חיים, Baruch ברוך, Chalil خليل) and /ʃ/ in French-influenced
 * spelling, which is how a great many Arabic names reached Latin script
 * (Rachid رشيد, Cherif شريف, Aicha عائشة). It is filed under H, the /x/
 * reading, and marked uncertain so it stays cheap against ش as well.
 *
 * "sh" and "kh" are NOT in here. They are unambiguous, and leaving them out is
 * what stops Shalil and Khalil collapsing into each other. */
const LATIN_UNCERTAIN = new Set(['ch']);

/* Pairs that are not the same class but are a routine transliteration slip.
 * Charged at half the cost of an unrelated substitution. */
const NEAR_CLASSES = [
  [CLS.S, CLS.T, 'th is written for both ث and ت'],
  [CLS.K, CLS.H, 'kh, and Hebrew כ, sit between the two classes'],
  [CLS.K, CLS.S, 'soft c is read as s, hard c as k'],
  [CLS.D, CLS.Z, 'ض is written d or dh — Ramadan, Ramadhan'],
  [CLS.B, CLS.F, 'Hebrew ב is b or v, פ is p or f'],
  [CLS.X, CLS.S, 'Hebrew ש is sh or s'],
  [CLS.X, CLS.H, 'Latin ch is /x/ in one convention and sh in another'],
  [CLS.J, CLS.G, 'j, g and gh overlap across conventions'],
  [CLS.K, CLS.G, 'ق and غ are both written q or gh'],
  [CLS.W, CLS.F, 'v is written with و or with ف'],
  // Hebrew has no letter for غ, so records write plain ר for it (the geresh that
  // would mark it is routinely omitted). Israeli ר is a uvular fricative and غ is
  // a velar one — close enough that this is a spelling slip, not a different name.
  [CLS.R, CLS.G, 'Hebrew ר stands in for غ — Hebrew has no letter for it'],
  [CLS.Y, CLS.A, 'י carries both a consonant and a vowel'],
  [CLS.W, CLS.A, 'ו carries both a consonant and a vowel'],
];

const NEAR_LOOKUP = (function () {
  const m = new Map();
  NEAR_CLASSES.forEach(([a, b, note]) => {
    m.set(a + b, note);
    m.set(b + a, note);
  });
  return m;
})();

/* ── Arabic ─────────────────────────────────────────────────────────────── */

const ARABIC_MAP = {
  'ا': CLS.A, 'أ': CLS.A, 'إ': CLS.A, 'آ': CLS.A, 'ء': CLS.A, 'ؤ': CLS.A,
  'ئ': CLS.A, 'ع': CLS.A,
  // Alef maqsura is a final long vowel, not a consonant — مصطفى is "Mustafa".
  'ى': CLS.A,
  // Ta marbuta is silent in pause form: فاطمة is written "Fatima", not "Fatimat".
  'ة': CLS.A,
  'ب': CLS.B, 'پ': CLS.B,
  'ت': CLS.T, 'ط': CLS.T,
  'ث': CLS.S, 'س': CLS.S, 'ص': CLS.S,
  'ج': CLS.J,
  'ح': CLS.H, 'خ': CLS.H, 'ه': CLS.H,
  'د': CLS.D, 'ض': CLS.D,
  'ذ': CLS.Z, 'ز': CLS.Z, 'ظ': CLS.Z,
  'ر': CLS.R,
  'ش': CLS.X,
  'غ': CLS.G,
  'ف': CLS.F, 'ڤ': CLS.F,
  'ق': CLS.K, 'ك': CLS.K, 'گ': CLS.K,
  'ل': CLS.L,
  'م': CLS.M,
  'ن': CLS.N,
  'و': CLS.W,
  'ي': CLS.Y, 'ی': CLS.Y,
};

/* Harakat, tanwin, shadda, sukun, superscript alef, tatweel. Stripped before
 * mapping — they are optional in writing and almost never present in a record. */
const ARABIC_DIACRITICS = /[ً-ٰٟـۖ-ۭ]/g;

/* ── Hebrew ─────────────────────────────────────────────────────────────── */

const HEBREW_MAP = {
  'א': CLS.A, 'ע': CLS.A,
  'ב': CLS.B,
  'ג': CLS.J,
  'ד': CLS.D,
  'ה': CLS.H, 'ח': CLS.H,
  'ו': CLS.W,
  'ז': CLS.Z,
  'ט': CLS.T, 'ת': CLS.T,
  'י': CLS.Y,
  'כ': CLS.K, 'ך': CLS.K, 'ק': CLS.K,
  'ל': CLS.L,
  'מ': CLS.M, 'ם': CLS.M,
  'נ': CLS.N, 'ן': CLS.N,
  'ס': CLS.S, 'צ': CLS.S, 'ץ': CLS.S,
  'פ': CLS.F, 'ף': CLS.F,
  'ר': CLS.R,
  'ש': CLS.X,
};

/* Niqqud, cantillation and gershayim. The GERESH (U+05F3) is deliberately NOT
 * stripped here: in Israeli transliteration of Arabic it is a letter modifier,
 * not an optional mark. ג׳ is j, ר׳ is gh, ת׳ is th — removing it collapses each
 * of those onto the wrong sound. It is consumed by HEBREW_DIGRAPHS instead. */
const HEBREW_DIACRITICS = /[֑-ׇ״]/g;

/* Hebrew has no letters for several Arabic consonants, so Israeli orthography
 * marks them by adding a geresh to the nearest available letter. These pairs are
 * matched before single letters, exactly as the Latin digraphs are — and for the
 * same reason: ג׳ must not be read as ג followed by nothing. */
const HEBREW_DIGRAPHS = {
  'ג׳': CLS.J,   // jim   ج — plain ג is already J, but be explicit
  'ז׳': CLS.Z,   // zh
  'צ׳': CLS.X,   // ch
  'ש׳': CLS.X,   // sh
  'ר׳': CLS.G,   // ghayn غ — the common Israeli rendering
  'ע׳': CLS.G,   // ghayn غ — the other rendering
  'ת׳': CLS.S,   // tha   ث
  'ד׳': CLS.Z,   // dhal  ذ
  'ח׳': CLS.H,   // kha   خ
  'ט׳': CLS.Z,   // zha   ظ
  'ס׳': CLS.X,   // sh, occasionally
};

/* ── Latin ──────────────────────────────────────────────────────────────── */

/* Digraphs are tried before single letters, longest first. This is the whole
 * difficulty of the Latin mapper: Arabic script is near-deterministic, one
 * letter to one class, but Latin is ambiguous and "kh" must not be read as
 * k followed by h. */
const LATIN_DIGRAPHS = {
  'kh': CLS.H,
  'sh': CLS.X,
  'ch': CLS.H,
  'th': CLS.S,
  'dh': CLS.Z,
  'gh': CLS.G,
  'ph': CLS.F,
  'ck': CLS.K,
  'ts': CLS.S,
  // Vowel digraphs. ay/ai/ei/ey stand for ي and aw/au/ou for و, so they map to
  // those consonant classes rather than to a plain vowel — Sayed is سيد, and
  // Zainab is زينب, with a real ي in the middle.
  'aa': CLS.A, 'ee': CLS.Y, 'ii': CLS.Y, 'oo': CLS.W, 'uu': CLS.W,
  'ai': CLS.Y, 'ay': CLS.Y, 'ei': CLS.Y, 'ey': CLS.Y,
  'au': CLS.W, 'aw': CLS.W, 'ou': CLS.W,
};

const LATIN_MAP = {
  // Single vowels are always vowels. Only the letters w and y are consonantal,
  // which matters word-initially: the i in "Ibrahim" is a vowel and must drop,
  // or it would not agree with إبراهيم.
  'a': CLS.A, 'e': CLS.A, 'i': CLS.A, 'o': CLS.A, 'u': CLS.A,
  'b': CLS.B, 'p': CLS.B,
  'c': CLS.K, 'k': CLS.K, 'q': CLS.K,
  'd': CLS.D,
  'f': CLS.F, 'v': CLS.F,
  'g': CLS.J, 'j': CLS.J,
  'h': CLS.H,
  'l': CLS.L,
  'm': CLS.M,
  'n': CLS.N,
  'r': CLS.R,
  's': CLS.S,
  't': CLS.T,
  'w': CLS.W,
  'x': CLS.K,
  'y': CLS.Y,
  'z': CLS.Z,
  "'": CLS.A, '’': CLS.A, '`': CLS.A, 'ʿ': CLS.A, 'ʼ': CLS.A,
};

/* Latin letters carrying diacritics, folded before mapping. */
const LATIN_FOLD = {
  'á':'a','à':'a','â':'a','ä':'a','ã':'a','å':'a','ā':'a',
  'é':'e','è':'e','ê':'e','ë':'e','ē':'e',
  'í':'i','ì':'i','î':'i','ï':'i','ī':'i',
  'ó':'o','ò':'o','ô':'o','ö':'o','õ':'o','ō':'o',
  'ú':'u','ù':'u','û':'u','ü':'u','ū':'u',
  'ñ':'n','ç':'c','ş':'s','ș':'s','ğ':'g','ţ':'t','ț':'t','ḥ':'h','ṣ':'s',
  'ḍ':'d','ṭ':'t','ẓ':'z','š':'sh','ž':'z','ć':'c','č':'c',
};

/* First-vowel groups. The first vowel of a name survives transliteration better
 * than any other vowel — Mohammad and Muhammed both begin Mo-/Mu-, Mahmoud
 * begins Ma-. It is not decisive, so the engine uses it only to hold a pair
 * back from a clean match, never to fail one outright. */
const VOWEL_GROUPS = { a: 'a', e: 'i', i: 'i', o: 'u', u: 'u' };

/* ── Particles ──────────────────────────────────────────────────────────── */

/* The definite article. Before a "sun letter" it assimilates in speech and the
 * spelling follows: الشريف is written Ash-Sharif as often as Al-Sharif. Matching
 * only "al-" and "el-" would miss a large share of real surnames. */
const ARTICLE_HYPHENATED = /^(a|e|u)(l|n|r|s|sh|t|th|d|z)-/i;
const ARTICLE_PLAIN      = /^(a|e)l(?=.{3,}$)/i;
const ARTICLE_ASSIMILATED = /^(a|e)([lnrstdz])\2(?=.{2,}$)/i;
const ARTICLE_ARABIC     = /^ال(?=.{2,}$)/;
const ARTICLE_HEBREW     = /^אל(?=.{2,}$)/;

/* عبد means "servant of" and is HALF OF A NAME, not a particle. عبد الرحمن is
 * one given name that records write as "Abdulrahman", "Abdel Rahman" or
 * "Abd al-Rahman". Stripping عبد destroys the name; the correct handling is to
 * join it to whatever follows. Same for أبو and أم, which head real family
 * names — Abu Sayed is a surname, not a description. */
const JOINERS_LATIN = ['abd', 'abdel', 'abdul', 'abdal', 'abu', 'abou', 'umm', 'um'];
const JOINERS_ARABIC = ['عبد', 'أبو', 'ابو', 'أم', 'ام'];
const JOINERS_HEBREW = ['עבד', 'אבו', 'אום', 'אם'];

/* Patronymic markers. These genuinely are separators — "bin Ahmad" means "son of
 * Ahmad" — and systems drop them inconsistently, so they are removed. The
 * removal is always reported; nothing disappears silently. */
const PATRONYMIC_LATIN = ['bin', 'ben', 'ibn', 'bint', 'binte', 'walad'];
const PATRONYMIC_ARABIC = ['بن', 'ابن', 'بنت'];
const PATRONYMIC_HEBREW = ['בן', 'בת'];

/* ── Known names ────────────────────────────────────────────────────────────
 *
 * The first matching layer, and the reason this engine does not report Mohammad
 * and Mahmoud as the same person. Both reduce to the consonants M-H-M-D once
 * vowels are dropped, so no skeleton method can separate them — but they are two
 * different, extremely common names, and conflating them would manufacture
 * exactly the false positive a KYC queue cannot tolerate.
 *
 * So: the most common given names are listed with their attested spellings
 * across the three scripts. A hit on this table is authoritative in both
 * directions — same entry means same name, different entry means different name.
 * Anything not listed falls through to skeleton matching, which is most surnames.
 *
 * These are ordinary given names in public use. The list contains no real
 * individual and is not derived from any customer data.
 */
const KNOWN_NAMES = {
  muhammad:    ['محمد', 'مُحمد', 'מוחמד', 'מחמד', 'מוחמט', 'מחמט',
                'mohammad', 'mohamed', 'muhammad',
                'muhammed', 'mohammed', 'mohamad', 'muhamad', 'mohammod', 'mohd'],
  mahmoud:     ['محمود', 'מחמוד', 'מוחמוד', 'מאחמוד',
                'mahmoud', 'mahmud', 'mahmood', 'mahmoudh', 'mehmood'],
  ahmad:       ['أحمد', 'احمد', 'אחמד', 'אחמט', 'אהמד',
                'ahmad', 'ahmed', 'ahmet', 'ahmadh'],
  ali:         ['علي', 'עלי', 'אלי', 'עאלי', 'ali', 'aly', 'alee', 'aali'],
  alaa:        ['علاء', 'אלאא', 'עלאא', 'עלא', 'alaa', 'ala', 'alaà', 'ala2'],
  hassan:      ['حسن', 'חסן', 'חאסן', 'הסן', 'hassan', 'hasan', 'hassane', 'hasson'],
  hussein:     ['حسين', 'חוסיין', 'חסין', 'חוסין',
                'hussein', 'hussain', 'husain', 'husein', 'hossein', 'hussien'],
  ibrahim:     ['إبراهيم', 'ابراهيم', 'אבראהים', 'איבראהים', 'אברהים',
                'ibrahim', 'ebrahim', 'ibraheem', 'brahim', 'ibrahem'],
  yousef:      ['يوسف', 'יוסף', 'יוסוף', 'יוסאף',
                'yousef', 'youssef', 'yusuf', 'yousuf', 'yusef', 'youcef'],
  khaled:      ['خالد', 'חאלד', 'ח׳אלד', 'כאלד', 'khaled', 'khalid', 'kaled', 'khalad'],
  khalil:      ['خليل', 'חליל', 'ח׳ליל', 'כליל', 'khalil', 'khaleel', 'kalil'],
  omar:        ['عمر', 'עומר', 'עמר', 'אומר', 'omar', 'umar', 'omer', 'oumar'],
  othman:      ['عثمان', 'עות׳מאן', 'עותמאן', 'עוסמאן',
                'othman', 'osman', 'uthman', 'usman'],
  saeed:       ['سعيد', 'סעיד', 'סאעיד', 'סעייד', 'saeed', 'said', 'sayeed', 'saied', 'sa3id'],
  salem:       ['سالم', 'סאלם', 'סלים', 'סאלים', 'סלם', 'salem', 'salim', 'saleem'],
  samir:       ['سمير', 'סמיר', 'סאמיר', 'סמייר', 'samir', 'sameer', 'samier'],
  tarek:       ['طارق', 'טארק', 'טאריק', 'תארק',
                'tarek', 'tariq', 'tarik', 'tareq', 'tarec'],
  nasser:      ['ناصر', 'נאסר', 'נאצר', 'נסר', 'nasser', 'nasir', 'naser', 'nassir'],
  jamal:       ['جمال', 'ג׳מאל', 'גמאל', 'ג׳אמל', 'jamal', 'gamal', 'jamaal', 'djamal'],
  kamal:       ['كمال', 'כמאל', 'כאמל', 'קמאל', 'kamal', 'kamel', 'kemal', 'kamaal'],
  fadi:        ['فادي', 'פאדי', 'פדי', 'fadi', 'fady'],
  rami:        ['رامي', 'ראמי', 'רמי', 'rami', 'ramy'],
  bilal:       ['بلال', 'בילאל', 'בלאל', 'bilal', 'belal', 'bilaal'],
  yaser:       ['ياسر', 'יאסר', 'יסר', 'יאסיר', 'yaser', 'yasser', 'yassir', 'yasir'],
  mustafa:     ['مصطفى', 'مصطفي', 'מוסטפא', 'מצטפא', 'מוסטאפא',
                'mustafa', 'mostafa', 'moustafa', 'mustapha'],
  abdullah:    ['عبدالله', 'עבדאללה', 'עבדאלה', 'עבדללה',
                'abdullah', 'abdallah', 'abdalla', 'abdulla', 'abdellah', 'abdalah'],
  abdulrahman: ['عبدالرحمن', 'עבדאלרחמן', 'עבדאלרחמאן', 'עבדולרחמן', 'עבדלרחמן',
                'abdulrahman', 'abdelrahman', 'abdurrahman',
                'abdalrahman', 'abderrahman', 'abdulrahmman'],
  abdulaziz:   ['عبدالعزيز', 'עבדאלעזיז', 'עבדולעזיז', 'עבדלעזיז', 'abdulaziz', 'abdelaziz', 'abdalaziz',
                'abdulazeez'],
  fatima:      ['فاطمة', 'فاطمه', 'פאטמה', 'פטמה', 'פאטמא',
                'fatima', 'fatma', 'fatimah', 'fatema'],
  mariam:      ['مريم', 'מרים', 'מריאם', 'מריים', 'mariam', 'maryam', 'mariem', 'meryem'],
  aisha:       ['عائشة', 'عايشة', 'עאישה', 'עאאישה', 'אישה', 'aisha', 'aysha', 'aicha', 'ayesha'],
  layla:       ['ليلى', 'ليلا', 'ליילא', 'לילא', 'ליילה', 'layla', 'laila', 'leila', 'lila'],
  nour:        ['نور', 'נור', 'נוור', 'נוואר', 'nour', 'noor', 'nur', 'noura'],
  zainab:      ['زينب', 'זינב', 'זיינב', 'זינאב', 'zainab', 'zaynab', 'zeinab', 'zeynab'],
  sara:        ['سارة', 'سارا', 'סארה', 'סארא', 'סרה', 'sara', 'sarah', 'saara'],
  huda:        ['هدى', 'هدا', 'הודא', 'הדא', 'הודה', 'huda', 'hoda', 'houda'],
  amal:        ['أمل', 'امل', 'אמל', 'אמאל', 'amal', 'amaal'],
  rana:        ['رنا', 'רנא', 'ראנא', 'ראנה', 'rana', 'ranaa'],
  dina:        ['دينا', 'דינה', 'דינא', 'dina', 'deena', 'dena'],
};

/* Flattened for lookup: every spelling points at its canonical id. */
const KNOWN_LOOKUP = (function () {
  const m = new Map();
  Object.keys(KNOWN_NAMES).forEach((canonical) => {
    KNOWN_NAMES[canonical].forEach((variant) => m.set(variant, canonical));
  });
  return m;
})();

/* Display label for a canonical id, for the explanation sentences. */
function canonicalLabel(id) {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/* ── For the Method page ────────────────────────────────────────────────── */

/* Rendered on the Method page directly from the tables above, so the
 * documentation cannot drift away from what the engine actually does. */
const EQUIVALENCE_DISPLAY = [
  { cls: 'H', members: 'ح خ ه · ח ה · h, kh, ch', note: 'all collapse to h in Latin' },
  { cls: 'T', members: 'ت ط · ט ת · t',       note: 'emphatic and plain t' },
  { cls: 'S', members: 'س ص ث · ס צ · s, th', note: 'th is written s or t' },
  { cls: 'K', members: 'ق ك · ק כ · k, q, c', note: 'q and k are interchangeable' },
  { cls: 'J', members: 'ج · ג · j, g',        note: 'Jamal and Gamal are one name' },
  { cls: 'Z', members: 'ذ ز ظ · ז · z, dh',   note: 'Ramadan, Ramadhan' },
  { cls: 'B', members: 'ب پ · ב · b, p',      note: 'Arabic has no p' },
  { cls: 'F', members: 'ف · פ · f, v, ph',    note: 'Arabic has no v' },
  { cls: 'X', members: 'ش · ש · sh',          note: 'sheen' },
  { cls: 'A', members: 'ا ء ع ة ى · א ע · vowels', note: 'weak — always dropped' },
  { cls: 'W', members: 'و · ו · w, o, u',     note: 'weak — vowel or consonant' },
  { cls: 'Y', members: 'ي · י · y, i, e',     note: 'weak — vowel or consonant' },
];

/* Node's test runner loads this file with require(); the browser loads it with
 * a plain <script> tag and picks the globals up off window. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CLS, WEAK, LATIN_UNCERTAIN, NEAR_CLASSES, NEAR_LOOKUP, ARABIC_MAP, ARABIC_DIACRITICS,
    HEBREW_MAP, HEBREW_DIACRITICS, HEBREW_DIGRAPHS,
    LATIN_DIGRAPHS, LATIN_MAP, LATIN_FOLD,
    VOWEL_GROUPS, ARTICLE_HYPHENATED, ARTICLE_PLAIN, ARTICLE_ASSIMILATED,
    ARTICLE_ARABIC, ARTICLE_HEBREW, JOINERS_LATIN, JOINERS_ARABIC, JOINERS_HEBREW,
    PATRONYMIC_LATIN, PATRONYMIC_ARABIC, PATRONYMIC_HEBREW, KNOWN_NAMES,
    KNOWN_LOOKUP, canonicalLabel, EQUIVALENCE_DISPLAY,
  };
}
