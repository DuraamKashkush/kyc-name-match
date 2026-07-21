# Arabic name matching for KYC

**[Open the tool →](https://omrankashkosh-coder.github.io/kyc-name-match/)**  ·  **[Run the test suite →](https://omrankashkosh-coder.github.io/kyc-name-match/tests.html)**

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

- **ه**, **خ** and **ح** are three different Arabic letters that all collapse to *h* in Latin.
- Arabic writes no short vowels, so Mohammad, Muhammed and Mohamed are **one consonant
  skeleton — M-H-M-D — wearing three different sets of vowels**.
- *al-* and *el-* are the definite article. They are not part of the surname, and one system
  will carry them while the next drops them.

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

A side effect of that design choice: no API key, no backend, no network call. Everything runs
in the browser and nothing typed into the page leaves the tab.

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

Also out of scope by design: no OCR, no document authentication, no sanctions or PEP
screening, no persistence. Address comparison is deliberately shallow and can never decide an
outcome on its own.

## Tests

```
node tests.js
```

71 assertions, no framework, no dependencies. The same file runs in the browser at
[tests.html](https://omrankashkosh-coder.github.io/kyc-name-match/tests.html).

Roughly half of them exist to hold the engine **back**. An engine tuned to match aggressively
across transliterations will happily match two different people, so the suite asserts that
Mohammad ≠ Mahmoud, Hassan ≠ Hussein, Khaled ≠ Khalil — alongside asserting that محمد السيد,
מוחמד אלסייד, *Mohammad Al-Sayed* and *Muhammed Elsayed* all match each other.

One test compares the Method page's published sound-class table against the maps the engine
actually runs on. That drifted once during development, which is why it is now a test.

## The data is synthetic

Every name, document number and address in this repository is invented. No real person, real
document or real customer record appears anywhere in it. The Israeli ID numbers in the sample
cases carry arithmetically valid check digits so the validation rule has something real to
verify, and correspond to no issued document.

Built from public sources only: FATF guidance on customer due diligence, ICAO Doc 9303 for the
travel-document number field, the published Israeli identity number check-digit scheme, and
standard Arabic and Hebrew orthography.

## Running it locally

No build step and no dependencies. Clone it and open `index.html`, or serve the directory:

```
python -m http.server 8000
```

| File | |
|---|---|
| `engine.js` | the matching engine — pure functions, no DOM |
| `lexicon.js` | sound classes, particle tables, known names |
| `rules.js` | the rule registry every score cites |
| `app.js` | DOM wiring only |
| `tests.js` | the assertions |
