/*
 * method.js — the Method page.
 *
 * Prose, plus two placeholders that app.js fills from lexicon.js and rules.js:
 * the equivalence classes and the rule registry are RENDERED FROM THE DATA THE
 * ENGINE RUNS ON, not written out here by hand. Documentation that is generated
 * from the code cannot quietly stop being true.
 */

var METHOD_PROSE = [
'<div class="method-prose">',

'<h2>The problem</h2>',

'<p>Arabic names do not survive transliteration. There is no single official way to write ',
'an Arabic name in Latin letters, so the same person accumulates a different spelling in ',
'every system that has ever recorded them:</p>',

'<table class="translit">',
'<tr><td><bdi>محمد السيد</bdi></td><td>passport, Arabic</td></tr>',
'<tr><td><bdi>מוחמד אלסייד</bdi></td><td>Israeli ID or bank record, Hebrew</td></tr>',
'<tr><td><bdi>Mohammad Al-Sayed</bdi></td><td>international record, Latin</td></tr>',
'<tr><td><bdi>Muhammed Elsayed</bdi></td><td>airline booking</td></tr>',
'<tr><td><bdi>Mohamed Sayed</bdi></td><td>older record, particle dropped</td></tr>',
'</table>',

'<p>Compared as strings, those five score close to zero against each other. A verification ',
'queue built on string comparison therefore throws false mismatches all day, and a human ',
'adjudicates every one of them. That human has to know three things that no string ',
'comparison knows:</p>',

'<ul>',
'<li><bdi>ه</bdi>, <bdi>خ</bdi> and <bdi>ح</bdi> are three different Arabic letters that all ',
'collapse to <em>h</em> in Latin.</li>',
'<li>Arabic writes no short vowels, so Mohammad, Muhammed and Mohamed are one consonant ',
'skeleton — M-H-M-D — wearing three different sets of vowels.</li>',
'<li><em>al-</em> and <em>el-</em> are the definite article. They are not part of the ',
'surname, and one system will carry them while the next drops them.</li>',
'</ul>',

'<p>This tool encodes that knowledge as rules.</p>',

'<h2>Why there is no model in the decision path</h2>',

'<p>A verification decision has to be explainable to an auditor and reproducible on demand. ',
'A model that returns 0.83 with no account of where the 0.83 came from cannot be audited, ',
'cannot be appealed, and cannot be shown to have treated two customers consistently.</p>',

'<p>So the engine is rule-based, and every point it awards or docks names the rule that ',
'produced it. Running the same two records with the same thresholds on the same date ',
'reproduces the same result and the same case note, exactly. A side effect of that choice ',
'is that there is no API key, no backend and no model to call — the page you are reading ',
'does all of its work in your browser, and nothing you type into it leaves the tab. The one ',
'probabilistic component, the document reader described further down, sits deliberately ',
'outside the decision and cannot move a verdict.</p>',

'<h2>The pipeline</h2>',

'<ol>',
'<li><strong>Detect the script</strong> of each token — Arabic, Hebrew or Latin.</li>',
'<li><strong>Handle particles.</strong> Strip the definite article, including the ',
'assimilated forms; remove patronymic markers; and join compound names. Nothing is ever ',
'dropped silently — every change is reported with the rule that made it.</li>',
'<li><strong>Reduce to a consonant skeleton.</strong> Every script maps into one shared ',
'alphabet of sound classes, which is what makes an Arabic string directly comparable to a ',
'Latin one. The comparison never sees the original letters.</li>',
'<li><strong>Match tokens independently of order</strong>, because given, father and family ',
'name do not appear in a stable order across systems. Distance is measured on the ',
'skeletons, never on the raw text.</li>',
'<li><strong>Aggregate by role.</strong> The given name and the family name carry more ',
'weight than a middle patronymic, because those are the positions that identify the ',
'person.</li>',
'</ol>',

'<p>A checklist then runs over the other fields — expiry, date of birth, sex, document ',
'number, issuing country, address. Those checks <strong>can only lower the verdict, never ',
'raise it</strong>. This matters: an expired document is not worth minus fifteen points, it ',
'is a condition that stops the check. Blending everything into a single number would be both ',
'less realistic and harder to defend.</p>',

'<p><strong>Sex is the field that separates a name a consonant skeleton cannot.</strong> ',
'The feminine ending is silent in Arabic — <bdi>فاطمة</bdi> is Fatima, not Fatimat — so the ',
'skeleton drops it, which is right for Fatima and also collapses <em>Samir</em> onto ',
'<em>Samira</em> and <em>Karim</em> onto <em>Karima</em>. Those are different people, and ',
'nothing in the name tells them apart; a recorded sex does, so a disagreement caps the ',
'outcome. Only M and F are compared — a blank sex asserts nothing and cannot lower a ',
'verdict. It is the one discriminator the name match is structurally blind to, which is ',
'exactly why it is worth carrying.</p>',

'<p>Dates are validated, not trusted. A field that is not a real calendar date — a bad ',
'month or day, the 29th of February in a common year — is a defect in the record, so it is ',
'reported and sent to review rather than quietly treated as an agreeing value. And the ',
'machine-readable zone carries a nationality in three-letter form (ISR) that is checked ',
'against the record\'s two-letter country (IL) once the two code systems are bridged, so a ',
'zone that belongs to a different country than the record claims is caught.</p>',

'<p>One exception, and it is a local one. Israel issues the driving licence against the ',
'identity number of its holder and prints that number as the licence number, so an Israeli ',
'ID card and an Israeli driving licence for one person cite <em>the same nine digits</em>. ',
'Those two do share an identifier namespace, so their numbers are compared after all and a ',
'disagreement between them is a real discrepancy — and the identity number check digit can ',
'be verified on the licence as readily as on the card. The rule is gated on both records ',
'being Israeli and on exactly that pair of document types: an Israeli passport carries its ',
'own number and is not part of it, and the two documents still expire on their own ',
'schedules, so their dates remain incomparable.</p>',

'<p>They can also decline to say anything. Where the two records describe <em>different ',
'classes of document</em> — a passport against an ID card, which is the ordinary case in ',
'verification rather than the exception — the two document numbers are identifiers from ',
'different namespaces, and the expiry dates run on unrelated schedules. Neither is a ',
'mismatch, so neither is held against the comparison. <strong>Absent evidence is not ',
'adverse evidence.</strong> An alarm that fires on every cross-document check tells a ',
'reviewer nothing, and a reviewer who learns to dismiss it will dismiss the one that ',
'mattered. Within a single class of document a differing number still goes to review, and an ',
'expired document still caps whatever else is true.</p>',

'<h2>Sound classes</h2>',

'<p>Letters that share a class are treated as the same sound and cost nothing to ',
'substitute. Classes marked weak are dropped from the skeleton entirely, because Arabic ',
'writes no short vowels and marks long ones with letters that Latin spellings render ',
'arbitrarily.</p>',

'<div class="classes" id="method-classes"></div>',

'<h2>The Hebrew side</h2>',

'<p>All six directions work the same way, because every script reduces into the one class ',
'alphabet above — Arabic against Hebrew runs through exactly the same code as Arabic against ',
'Latin. Hebrew matters here for a specific reason: an Israeli identity card is printed in ',
'Hebrew <em>and</em> Arabic, while the bank record behind it was keyed by a clerk from one of ',
'the two. The same person is <bdi>محمد السيد</bdi> and <bdi>מוחמד אלסייד</bdi> in the same ',
'wallet.</p>',

'<p>Three things about Hebrew are not shared with the other two scripts.</p>',

'<h3>The geresh is a letter, not a mark</h3>',

'<p>Hebrew has no letters for several Arabic consonants, so Israeli orthography marks them by ',
'adding a geresh: <bdi>ג׳</bdi> is j, <bdi>ר׳</bdi> is gh, <bdi>ת׳</bdi> is th, <bdi>ד׳</bdi> ',
'is dh, <bdi>צ׳</bdi> is ch as in <em>church</em>. It looks like punctuation and is not — ',
'treating it as a diacritic ',
'and stripping it collapses each of those onto the wrong sound. It is read before single ',
'letters, the same way <em>kh</em> is read before <em>k</em> in the Latin mapper.</p>',

'<h3>Latin ch does not say which sound it is</h3>',

'<p><em>sh</em> is <bdi>ش</bdi> and <bdi>ש</bdi>. <em>kh</em> is <bdi>خ</bdi>. Neither is in ',
'any doubt. <em>ch</em> is, and it is the one Latin digraph that genuinely is: in Hebrew- ',
'and German-influenced spelling it is /x/ — Chaim <bdi>חיים</bdi>, Baruch <bdi>ברוך</bdi>, ',
'Chalil <bdi>خليل</bdi> — while in French-influenced spelling, which is how a great many ',
'Arabic names first reached Latin script, it is sh: Rachid <bdi>رشيد</bdi>, Cherif ',
'<bdi>شريف</bdi>, Aicha <bdi>عائشة</bdi>. Nothing in the string says which convention wrote ',
'it.</p>',

'<p>So it is not filed with <em>sh</em>. It is read as /x/, with <bdi>ح خ ه</bdi> and ',
'<bdi>ח ה</bdi>, and marked <strong>uncertain</strong> — the same treatment as a word-final ',
'Hebrew <bdi>ה</bdi> below, and for the same reason. An uncertain letter is cheap against ',
'the classes it plausibly stood for, so Chalil still meets <bdi>شادي</bdi>-style sheen ',
'spellings at close range. It is deliberately not made cheap against <em>everything</em>: ',
'uncertainty about which letter was written must not turn an unrelated letter into a match. ',
'And because <em>sh</em> and <em>kh</em> carry none of this, Shalil and Khalil stay apart.</p>',

'<h3>A final ה could be either of two Arabic letters</h3>',

'<p>Arabic distinguishes <bdi>ة</bdi>, which is silent, from <bdi>ه</bdi>, which is ',
'pronounced. Hebrew writes both as a final <bdi>ה</bdi> and gives no way to tell them apart. ',
'Dropping it would fix one family of names and break the other:</p>',

'<table class="translit">',
'<tr><td><bdi>شحادة</bdi> / <bdi>שחאדה</bdi></td><td>silent ة — the ה must be droppable</td></tr>',
'<tr><td><bdi>سلامة</bdi> / <bdi>סלאמה</bdi></td><td>silent ة — the ה must be droppable</td></tr>',
'<tr><td><bdi>عبدالله</bdi> / <bdi>עבדאללה</bdi></td><td>pronounced ه — the ה must be kept</td></tr>',
'<tr><td><bdi>طه</bdi> / <bdi>טאהה</bdi></td><td>pronounced ه — the ה must be kept</td></tr>',
'</table>',

'<p>So the letter is not dropped and not kept. It is marked <em>uncertain</em>: it matches an ',
'Arabic h for nothing, and costs a quarter to delete. Both families then come out right, ',
'which neither of the simpler answers manages. The same applies to a trailing <em>h</em> in ',
'Latin — Shehadeh ends in a silent ة, Salah ends in a pronounced ح, and the spelling does not ',
'say which.</p>',

'<h3>ר stands in for a letter Hebrew does not have</h3>',

'<p>There is no Hebrew letter for <bdi>غ</bdi>, so records write <bdi>ר</bdi> — with the ',
'geresh in careful transcription, and usually without it in practice. Where the geresh is ',
'present the two match outright. Where it has been dropped, <bdi>غانم</bdi> against ',
'<bdi>ראנם</bdi> is charged as a near-miss and lands on <strong>review</strong> rather than ',
'match.</p>',

'<p>That is deliberate. Without the mark, the Hebrew spelling genuinely does not distinguish ',
'Ghanem from a name actually spelled with ר, and the same is true of <bdi>ת</bdi> for both t ',
'and th. Sending an ambiguous pair to review is the honest answer; scoring it as a match ',
'would be inventing a distinction the record does not contain.</p>',

'<h2>What this approach cannot do</h2>',

'<div class="limitation">',
'<h3>Mohammad and Mahmoud have the same consonants</h3>',
'<p>Drop the vowels from both and each reduces to M-H-M-D. No consonant-skeleton method ',
'can tell them apart — and they are two of the most common names in the region, so ',
'reporting them as one person would manufacture false matches at scale. In a KYC queue ',
'that failure is far more serious than the false mismatch this tool was built to fix.</p>',
'<p>Two controls sit above the skeleton to catch it. First, a table of the most common ',
'given names with their attested spellings across the three scripts: a hit there is ',
'authoritative in both directions, so Mohammad and Mahmoud are reported as <em>two ',
'different known names</em> rather than as two distant strings. Second, for names outside ',
'that table, the first vowel — which survives transliteration better than any other — holds ',
'a pair back from a clean match when it conflicts, without failing it outright.</p>',
'<p>Names outside the table with colliding consonants and agreeing first vowels remain a ',
'genuine limitation, and this is the right place to say so rather than to hide it.</p>',
'</div>',

'<p>Other boundaries worth stating plainly: there is no OCR, so the machine-readable zone is ',
'typed rather than scanned, and there is no chip or physical authentication — the tool ',
'checks whether a document is <em>internally consistent</em>, not whether it is genuine. ',
'There is no sanctions or PEP screening. Address comparison is deliberately shallow.</p>',

'<h2>The machine-readable zone</h2>',

'<p>The two or three lines at the foot of a passport or the back of an ID card are worth ',
'transcribing for one reason: they carry check digits. Under ICAO Doc 9303 each field is ',
'weighted 7, 3, 1 repeating, summed, and reduced modulo ten. The printed passport number has ',
'no check digit of its own — it lives here — so without the zone the engine can only say a ',
'number is plausibly formatted. With it, a transcription error fails arithmetic.</p>',

'<p>A final <em>composite</em> digit is computed across every field that already carries one. ',
'That is the one that matters: repairing a field and its own check digit together still ',
'fails the composite, so it catches an altered zone rather than only a typing slip.</p>',

'<p>The zone is then compared against the values keyed from the printed side of the same ',
'document — a record checked against <em>itself</em>, not against the other record. Two halves ',
'of one document that disagree is a finding in its own right, whatever the comparison ',
'concludes. And because the zone is always Latin, it supplies a second, independently ',
'transcribed form of the name when the printed name is Arabic or Hebrew, which goes through ',
'the same matcher as everything else.</p>',

'<p>Both TD3 (passports, two lines of forty-four) and TD1 (ID cards, three lines of thirty) ',
'are read. TD2 is recognised and declined rather than guessed at. Load a sample case and ',
'change any character in the zone to watch the digits fail.</p>',

'<h2>Reading a document image</h2>',

'<p>A document image can be read to fill the form in. It is worth being precise about where ',
'that sits, because it is the one part of this tool that is not deterministic.</p>',

'<p><strong>Optical character recognition takes no part in the decision.</strong> It proposes ',
'values into the form. A person accepts them. The engine then runs on what that person left ',
'in the fields, exactly as if they had typed it — the matching code does not reference the ',
'reader, does not know it exists, and produces identical output whether or not it has been ',
'loaded. There is a test that asserts precisely that.</p>',

'<p>The form stays the operator\'s, though. Every value the reader proposes can be edited or ',
'cleared, and what the reader saw is kept beside the field so it can be put back — clearing ',
'a field by accident should not mean scanning the document a second time. Restoring a value ',
'returns it to the reader\'s standing, not to a confirmed one: pressing a button to put a ',
'machine reading back is not a person vouching for it, and the outcome stays capped until ',
'someone does.</p>',

'<p>The reason is the claim at the top of this page. A verdict here is reproducible and ',
'explainable rule by rule. Optical recognition is a machine\'s best guess at what some pixels ',
'say; the moment a misread character could move a verdict, that claim would be gone. So the ',
'reader sits outside the boundary, which is also how document capture works in a real ',
'verification queue: the machine proposes, a human disposes, and the file records which was ',
'which.</p>',

'<h3>One part of a document can prove its own reading</h3>',

'<p>The machine-readable zone carries check digits. If the reader mistakes a character, the ',
'arithmetic fails and the tool says so rather than believing it. That gives two tiers of ',
'machine-read value, and they are not treated alike:</p>',

'<table class="translit">',
'<tr><td>Zone, check digits verify</td><td>confirmed by arithmetic — no second pair of eyes needed</td></tr>',
'<tr><td>Zone, check digits fail</td><td>a misread or a document that does not add up; reported either way</td></tr>',
'<tr><td>Printed page</td><td>nothing can validate it — capped at review until a human accepts it</td></tr>',
'</table>',

'<p>Because the zone repeats the name, date of birth, expiry and document number in a form ',
'that can be checked, it is preferred over the printed side wherever it reads. Guessing at ',
'printed text while a verified copy of the same data sits at the foot of the page would be ',
'the wrong way round.</p>',

'<h3>Correcting a misread, without guessing</h3>',

'<p>Every position in the zone has a fixed meaning, so the layout says which characters must ',
'be digits and which must be letters. A letter O sitting in the six positions that hold a date ',
'of birth is a misread zero — not a judgement call, and the correction is reported rather than ',
'applied silently. The check digits then confirm whether the correction was right, which is ',
'the part that makes it safe to do at all.</p>',

'<p>Two honest limitations. There is no published Tesseract model for OCR-B, the typeface the ',
'zone is set in, so this runs on the general English model with the character set restricted ',
'to the zone\'s own alphabet; a photograph taken at an angle in poor light will often not read ',
'at all. And the bundled specimen is a clean drawing rendered at high resolution, so it reads ',
'far more easily than a real photograph would — it demonstrates the pipeline, not the accuracy ',
'you would get in a branch. It ships as a fixed image rather than being drawn in your browser, ',
'because the filler character <bdi>&lt;</bdi> is exactly the glyph whose shape decides whether ',
'a zone reads at all, and rendering it here would make the result depend on which fonts you ',
'happen to have installed.</p>',

'<p>The image itself never leaves the browser, and neither does anything read from it.</p>',

'<h2>Screening a name against a list</h2>',

'<p>The compare tool asks whether two records are the same person. Screening asks whether a ',
'person is on a list — the same name engine, run against many entries instead of one. It is ',
'the task the transliteration problem hurts most: a watchlist is full of Arabic names, and ',
'the false positives a naive matcher throws are exactly what buries a compliance team.</p>',

'<p><strong>The machine escalates, a person dispositions.</strong> This mirrors the compare ',
'side&rsquo;s &ldquo;checks can only lower a verdict&rdquo;: screening never clears a name hit ',
'on its own. A result is cleared only when nothing scores above the threshold — and that ',
'threshold sits <em>below</em> the verification match bar, because a missed true match is ',
'worse than a reviewed false one, so the tool surfaces more and lets a human decide.</p>',

'<p>Secondary identifiers separate the real hit from the coincidence. A date of birth, sex or ',
'nationality present on <em>both</em> the query and the list entry can corroborate a hit and ',
'raise it to a strong match, or conflict and discount it. The discipline that matters: a ',
'discount can be made <strong>only on data that is present</strong>. A sanctions entry with ',
'no date of birth cannot be cleared on one, and a discounted hit is still surfaced for a ',
'person to confirm — never dropped silently.</p>',

'<p>A blocking index keeps it fast at real-list scale. Each entry name is keyed by its ',
'consonant skeleton and that skeleton one letter apart, so the expensive comparison runs only ',
'on plausible candidates rather than every entry. The key is script-independent — the ',
'skeleton is — so an Arabic query blocks against a Latin listing, and the index is proven ',
'never to drop a hit the exhaustive scan would find.</p>',

'<p>The reference lists are real, public data — sanctions lists are published to be screened ',
'against — attributed to their sources. A PEP hit is a signal for heightened due diligence, ',
'not a block, and is labelled as such. The query itself is never sent anywhere: it is matched ',
'here, in your browser, which is why the tool can sit on a public URL and never expose the ',
'name you screened.</p>',

'<h2>Every rule the engine can cite</h2>',

'<p>This table is generated from the same registry the engine runs on, so it cannot drift ',
'out of date. Every rule id that appears in a verdict resolves here.</p>',

'<table class="rules">',
'<thead><tr><th>Id</th><th>Rule</th><th>What it means</th></tr></thead>',
'<tbody id="method-rules"></tbody>',
'</table>',

'<h2>Sources and data</h2>',

'<p>Built from public material only: FATF guidance on customer due diligence, ICAO Doc 9303 ',
'for the machine-readable travel document number field, the published Israeli identity ',
'number check-digit scheme, and standard Arabic and Hebrew orthography. The known-name ',
'table contains ordinary given names in public use.</p>',

'<p>Every name, document number and address anywhere in this tool is synthetic. No real ',
'person, real document or real customer record appears in it, and no proprietary list, ',
'procedure or threshold from any employer is used or reproduced.</p>',

'</div>',
].join('\n');
