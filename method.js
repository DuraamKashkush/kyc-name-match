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
'is that there is no API key, no backend and no network call — the page you are reading ',
'does all of its work in your browser, and nothing you type into it leaves the tab.</p>',

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

'<p>A checklist then runs over the other fields — expiry, date of birth, document number, ',
'issuing country, address. Those checks <strong>can only lower the verdict, never raise ',
'it</strong>. This matters: an expired document is not worth minus fifteen points, it is a ',
'condition that stops the check. Blending everything into a single number would be both ',
'less realistic and harder to defend.</p>',

'<h2>Sound classes</h2>',

'<p>Letters that share a class are treated as the same sound and cost nothing to ',
'substitute. Classes marked weak are dropped from the skeleton entirely, because Arabic ',
'writes no short vowels and marks long ones with letters that Latin spellings render ',
'arbitrarily.</p>',

'<div class="classes" id="method-classes"></div>',

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
