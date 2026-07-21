# Arabic name matching for KYC

**[Open the tool →](https://duraamkashkush.github.io/kyc-name-match/)**  ·  **[Run the test suite →](https://duraamkashkush.github.io/kyc-name-match/tests.html)**

Paste two identity records, get a match / refer / no-match decision, and a written reason for
every point awarded or docked. Deterministic, rule-based, and entirely client-side.

---

## The problem

Arabic names do not survive transliteration. There is no single official way to write an
Arabic name in Latin letters, so the same person accumulates a different spelling in every
system that has ever recorded them:

| Written | Where it comes from |
|---|---|
| محمد السيد | passport, Arabic |
| מוחמד אלסייד | Israeli ID or bank record, Hebrew |
| Mohammad Al-Sayed | international record, Latin |
| Muhammed Elsayed | airline booking |
| Mohamed Sayed | older record, particle dropped |

Compared as strings, those five score close to zero against each other. A verification queue
built on string comparison therefore throws false mismatches all day, and a human adjudicates
every one of them.

That human has to know three things no string comparison knows:

- The letters **ح**, **خ** and **ه** are three different Arabic consonants that all collapse
  to a single *h* in Latin.
- Arabic writes no short vowels, so Mohammad, Muhammed and Mohamed are **one consonant
  skeleton — M-H-M-D — wearing three different sets of vowels**.
- The particles *al-* and *el-* are the definite article. They are not part of the surname,
  and one system will carry them while the next drops them.

This tool encodes that knowledge as rules. Load the **Transliteration mismatch** sample and
you can watch an Arabic passport match a Latin system record, with every step named.

## Why there is no model in the decision path

A verification decision has to be explainable to an auditor and reproducible on demand. A
model that returns `0.83` with no account of where the `0.83` came from cannot be audited,
cannot be appealed, and cannot be shown to have treated two customers consistently.

So the engine is rule-based, and **every score names the rule that produced it**:

```
mohammad   mahmoud   given    0    [LEX-2]  "mohammad" is Muhammad and "mahmoud" is
MHMD       MHMD                             Mahmoud — two different names, not two
                                            spellings of one. Their consonants alone
                                            do not separate them.
```

Note both skeletons read `MHMD`. They are genuinely identical — and the engine still refuses
the match, and says why.

A side effect of that design choice: no API key, no backend, no model to call. Everything
runs in the browser and nothing typed into the page leaves the tab.

The one probabilistic component in the project sits deliberately outside that boundary. A
document image can be read to *fill the form in*, but the reader takes no part in the
decision — it proposes values, a human accepts them, and the engine scores what the human
left behind. `engine.js` does not reference it and returns identical output whether or not it
is loaded, which is asserted by a test.

## How it works

```
tokenise → normalise → particles → skeleton → compare → align → aggregate
                                                                    ↓
                                          checklist over the other fields,
                                          which can only LOWER the verdict
```

**Particles.** Strip the definite article — including the assimilated forms, since الشريف is
written *Ash-Sharif* as often as *Al-Sharif*. Remove patronymic markers (*bin*, *ibn*,
*bint*). Join compound names: **عبد is half of a name, not a particle** — عبد الرحمن is one
given name written *Abdulrahman*, *Abdel Rahman* or *Abd al-Rahman*, and stripping the عبد
destroys it. Nothing is ever dropped silently.

**Skeleton.** All three scripts map into one shared alphabet of sound classes, which is what
makes an Arabic string directly comparable to a Latin one — the comparison never sees the
original letters. Vowels are dropped, because Arabic does not write them and charging edit
distance for them would fail the very cases this tool exists to pass.

**All six directions, not just Arabic→Latin.** Because every script reduces into that one
alphabet, Arabic↔Hebrew runs through the same code as Arabic↔Latin. This matters in Israel
specifically: an identity card is printed in Hebrew *and* Arabic, and the bank record behind
it was keyed from one of the two. Hebrew brings three problems the other scripts don't have —
the geresh is a letter rather than a diacritic (ג׳ is j, ר׳ is gh, ת׳ is th); a final ה
renders both the silent Arabic ة and the pronounced ه with nothing to tell them apart; and ר
stands in for غ, which Hebrew has no letter for. Measured across 35 names in all three
scripts, the mean score is 99 in every direction.

**Alignment.** Tokens are matched independently of order, because given, father and family
name are not in a stable order across systems. A reordering is recorded, not penalised. A
patronymic present in one record and absent from the other — the most common benign
difference in this data — is noted and weighted lightly rather than treated as a
contradiction.

**Checklist.** Expiry, date of birth, document number, issuing country, address. These can
only lower the verdict, never raise it: an expired document is not worth minus fifteen
points, it is a condition that stops the check. Date of birth distinguishes a genuine
discrepancy from a keying error — `1994-03-07` against `1994-07-03` is a day/month
transposition and says so.

**Machine-readable zone.** Optional, and the only field that can be verified rather than
merely compared. The printed passport number carries no check digit — it lives in the MRZ —
so ICAO Doc 9303 arithmetic (weights 7-3-1, modulo 10) turns "plausibly formatted" into
verified. The composite digit spans every field that already carries one, so repairing a
field *and* its own digit still fails. TD3 (passports) and TD1 (ID cards) are both read; the
parser is tested against the published ICAO specimen. The zone is checked against the printed
side of the *same* document — two halves of one document that disagree is a finding on its
own — and, being always Latin, it supplies a second transcription of the name when the
printed name is Arabic.

## What this approach cannot do

Drop the vowels from **Mohammad** and **Mahmoud** and both reduce to `M-H-M-D`. No
consonant-skeleton method can separate them, and they are two of the most common names in
the region — so reporting them as one person would manufacture false matches at scale. In a
KYC queue that failure is considerably more serious than the false mismatch the tool was
built to fix.

Two controls sit above the skeleton. A table of common given names with their attested
spellings across the three scripts, which is authoritative in both directions. And, for names
outside that table, the first vowel — the one vowel that tends to survive transliteration —
holds a pair back from a clean match when it conflicts, without failing it outright.

Names outside the table with colliding consonants *and* agreeing first vowels remain a real
limitation. It is documented on the Method page rather than hidden.

Also out of scope by design: no document authentication, no sanctions or PEP screening, no
persistence. Address comparison is deliberately shallow and can never decide an outcome on
its own.

## Reading a document image

A photograph of a document can be read to fill the form in. Where that sits is the whole
design:

**It takes no part in the decision.** OCR proposes values; a person accepts them; the engine
scores what the person left in the fields. `engine.js` does not reference the reader, does
not know it exists, and returns identical output whether or not it is loaded — asserted by a
test, and enforced structurally because the Node suite never loads it. A verdict here has to
be reproducible, and a machine's best guess at some pixels cannot be allowed to move one.

**The zone can prove its own reading.** The MRZ carries check digits, so a misread fails
arithmetic and is reported rather than believed. That gives two tiers, treated differently:

| source | validated by | treatment |
|---|---|---|
| zone, check digits verify | arithmetic | confirmed; no second pair of eyes needed |
| zone, check digits fail | arithmetic | reported as misread-or-altered |
| printed page | nothing | **capped at refer until a human accepts it** |

**Misreads are corrected without guessing.** Every position in the zone has a fixed meaning,
so a letter `O` sitting in the six positions that hold a date of birth is a misread `0` — not
a judgement call. Corrections are reported, and the check digits then confirm whether they
were right. A real alteration still fails, because changing one digit to another is not a
character-class error and the corrector leaves it alone.

Honest limits: there is no published Tesseract model for OCR-B, so this runs the general
English model with the character set restricted to the zone's own alphabet, and an angled
photo in poor light often will not read at all. The bundled specimen is a clean vector
drawing — it demonstrates the pipeline, not the accuracy you would get in a branch. The
specimen uses **UTO / Utopia**, the fictional state from ICAO Doc 9303 itself, so nothing in
this repo resembles a real country's document. The image never leaves the browser.

## Tests

```
node tests.js
```

105 assertions, no framework, no test runner. The same file runs in the browser at
[tests.html](https://duraamkashkush.github.io/kyc-name-match/tests.html).

Roughly half of them exist to hold the engine **back**. An engine tuned to match aggressively
across transliterations will happily match two different people, so the suite asserts that
Mohammad ≠ Mahmoud, Hassan ≠ Hussein, Khaled ≠ Khalil — alongside asserting that محمد السيد,
מוחמד אלסייד, *Mohammad Al-Sayed* and *Muhammed Elsayed* all match each other.

Two tests exist specifically to catch a plausible wrong fix. One asserts that Abdullah and
Taha still score 100 across Arabic and Hebrew: the obvious way to handle a final ה is to drop
it, which fixes Shehadeh and Salameh and silently breaks those two, because Hebrew writes the
silent ة and the pronounced ه identically. The other compares the Method page's published
sound-class table against the maps the engine actually runs on — that drifted once during
development, which is why it is now a test.

## The data is synthetic

Every name, document number, address and machine-readable zone in this repository is invented.
No real person, real document or real customer record appears anywhere in it. The Israeli ID
numbers and the MRZ strings in the sample cases were constructed with arithmetically valid
check digits so the validation rules have something real to verify; they correspond to no
issued document. The one exception is the ICAO Doc 9303 specimen used in the tests, which is
the published example from the standard itself.

Built from public sources only: FATF guidance on customer due diligence, ICAO Doc 9303 for the
travel-document number field, the published Israeli identity number check-digit scheme, and
standard Arabic and Hebrew orthography.

## Running it locally

No build step. The matching engine has no dependencies at all; the optional document reader
uses Tesseract, vendored under `vendor/` and loaded only if you actually click to read an
image. Clone it and open `index.html`, or serve the directory:

```
python -m http.server 8000
```

| File | |
|---|---|
| `engine.js` | the matching engine — pure functions, no DOM |
| `mrz.js` | ICAO Doc 9303 machine-readable zone parsing and check digits |
| `ocr.js` | reads a document image to pre-fill the form — outside the decision path |
| `vendor/` | Tesseract, third-party and unmodified, loaded only on demand |
| `lexicon.js` | sound classes, particle tables, known names |
| `rules.js` | the rule registry every score cites |
| `app.js` | DOM wiring only |
| `tests.js` | the assertions |
