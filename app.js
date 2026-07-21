/*
 * app.js — DOM wiring only.
 *
 * All decision logic lives in engine.js, which never touches the DOM. This file
 * reads inputs, calls the engine, and renders what comes back. If you want to
 * know how a verdict is reached, read engine.js — not this file.
 */

(function () {
  'use strict';

  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const FIELD_DEFS = [
    { key: 'fullName',  label: 'Full name',        type: 'text',   dir: true,
      placeholder: 'As printed on the record' },
    { key: 'dob',       label: 'Date of birth',    type: 'date' },
    { key: 'docType',   label: 'Document type',    type: 'select', options: DOC_TYPES },
    { key: 'docNumber', label: 'Document number',  type: 'text',
      placeholder: 'e.g. 310256789' },
    { key: 'expiry',    label: 'Expiry date',      type: 'date' },
    { key: 'country',   label: 'Issuing country',  type: 'select', options: COUNTRIES },
    { key: 'address',   label: 'Address',          type: 'text',   dir: true,
      placeholder: 'Street, city' },
    { key: 'mrz',       label: 'Machine-readable zone (optional)', type: 'textarea',
      rows: 3, mono: true,
      // Deliberately not a realistic MRZ: a specimen zone as placeholder text
      // reads as data the record already has, which is exactly the wrong thing
      // to show on an empty field.
      placeholder: 'Optional — paste the MRZ lines',
      hint: 'The lines at the foot of a passport or the back of an ID card. They carry ' +
            'ICAO 9303 check digits, so the document number can be verified rather than ' +
            'only format-checked.' },
  ];

  let lastResult = null;

  /* ── Field construction ──────────────────────────────────────────────── */

  function buildFields(side) {
    const host = $(`[data-fields="${side}"]`);
    host.innerHTML = '';

    FIELD_DEFS.forEach((def) => {
      const id = `${side}-${def.key}`;
      const wrap = document.createElement('div');
      wrap.className = 'field';

      const label = document.createElement('label');
      label.setAttribute('for', id);
      label.textContent = def.label;
      wrap.appendChild(label);

      let input;
      if (def.type === 'select') {
        input = document.createElement('select');
        def.options.forEach((opt) => {
          const o = document.createElement('option');
          o.value = opt.value;
          o.textContent = opt.label;
          input.appendChild(o);
        });
      } else if (def.type === 'textarea') {
        input = document.createElement('textarea');
        input.rows = def.rows || 3;
        input.spellcheck = false;
        // The MRZ is a fixed-width Latin format. Forcing LTR and monospace keeps
        // the columns aligned even when the rest of the record is Arabic.
        input.dir = 'ltr';
        // An MRZ line is a fixed 44 or 30 characters and means nothing rewrapped,
        // so scroll it sideways rather than folding it.
        input.wrap = 'off';
        if (def.mono) input.className = 'mono';
        if (def.placeholder) input.placeholder = def.placeholder;
      } else {
        input = document.createElement('input');
        input.type = def.type;
        if (def.placeholder) input.placeholder = def.placeholder;
        // Names and addresses may be Arabic, Hebrew or Latin. dir="auto" lets the
        // browser pick direction from the first strong character in the value, so
        // right-to-left text is not rendered backwards.
        if (def.dir) input.dir = 'auto';
      }
      input.id = id;
      input.name = id;
      input.dataset.side = side;
      input.dataset.key = def.key;
      wrap.appendChild(input);

      if (def.hint) {
        const hint = document.createElement('p');
        hint.className = 'field-hint';
        hint.textContent = def.hint;
        wrap.appendChild(hint);
      }

      host.appendChild(wrap);
    });
  }

  function readRecord(side) {
    const rec = {};
    FIELD_DEFS.forEach((def) => {
      rec[def.key] = ($(`#${side}-${def.key}`).value || '').trim();
    });
    return rec;
  }

  function writeRecord(side, rec) {
    FIELD_DEFS.forEach((def) => {
      const el = $(`#${side}-${def.key}`);
      el.value = rec[def.key] != null ? rec[def.key] : '';
    });
  }

  /* ── Sample cases ────────────────────────────────────────────────────── */

  function buildSampleButtons() {
    const host = $('#sample-buttons');
    host.innerHTML = '';

    Object.keys(SAMPLE_CASES).forEach((key) => {
      const c = SAMPLE_CASES[key];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sample-btn';
      btn.dataset.case = key;
      btn.setAttribute('aria-pressed', 'false');
      btn.textContent = c.label;
      btn.addEventListener('click', () => loadCase(key));
      host.appendChild(btn);
    });
  }

  function loadCase(key) {
    const c = SAMPLE_CASES[key];
    if (!c) return;

    writeRecord('a', c.a);
    writeRecord('b', c.b);

    $$('.sample-btn').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.case === key));
    });
    $('#sample-blurb').textContent = c.blurb;
  }

  function clearAll() {
    writeRecord('a', EMPTY_RECORD);
    writeRecord('b', EMPTY_RECORD);
    $$('.sample-btn').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    $('#sample-blurb').textContent = '';
    lastResult = null;
    showEmptyStates();
  }

  /* ── Tabs ────────────────────────────────────────────────────────────── */

  function showTab(name) {
    $$('.tab').forEach((t) => {
      t.setAttribute('aria-selected', String(t.dataset.tab === name));
    });
    $$('.panel').forEach((p) => {
      p.hidden = p.dataset.panel !== name;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showEmptyStates() {
    $('#verdict-empty').hidden = false;
    $('#verdict-body').hidden = true;
    $('#note-empty').hidden = false;
    $('#note-body').hidden = true;
  }

  /* ── Thresholds ──────────────────────────────────────────────────────── */

  const DEFAULT_THRESHOLDS = { match: 85, refer: 60 };

  function readThresholds() {
    return {
      match: Number($('#th-match').value),
      refer: Number($('#th-refer').value),
    };
  }

  function syncThresholdOutputs() {
    const t = readThresholds();
    // The refer threshold can never sit above the match threshold, or the bands
    // become incoherent. Clamp rather than letting the user build a broken scale.
    if (t.refer >= t.match) {
      $('#th-refer').value = Math.max(20, t.match - 1);
    }
    $('#th-match-out').textContent = $('#th-match').value;
    $('#th-refer-out').textContent = $('#th-refer').value;
  }

  function resetThresholds() {
    $('#th-match').value = DEFAULT_THRESHOLDS.match;
    $('#th-refer').value = DEFAULT_THRESHOLDS.refer;
    syncThresholdOutputs();
  }

  /* ── Run ─────────────────────────────────────────────────────────────── */

  function runCheck() {
    const a = readRecord('a');
    const b = readRecord('b');

    if (!a.fullName && !b.fullName) {
      $('#sample-blurb').textContent =
        'Enter a name in both records, or load one of the sample cases above.';
      return;
    }

    lastResult = KYC.compare(a, b, { thresholds: readThresholds() });

    renderVerdict(lastResult);
    renderNote(lastResult);
    showTab('verdict');
  }

  /* ── Rendering: verdict ──────────────────────────────────────────────── */

  const BANNER_CLASS = { MATCH: 'match', REFER: 'refer', NO_MATCH: 'nomatch' };
  const BANNER_TEXT  = { MATCH: 'MATCH', REFER: 'REFER', NO_MATCH: 'NO MATCH' };

  function ruleTag(id) {
    const span = document.createElement('span');
    span.className = 'rule-id';
    span.textContent = id;
    span.title = RULES[id] ? RULES[id].name + ' — ' + RULES[id].description : id;
    return span;
  }

  /* Mixed-script text goes inside <bdi> so an Arabic token cannot reorder the
     Latin around it. Without this the breakdown table scrambles. */
  function bdi(text) {
    const el = document.createElement('bdi');
    el.textContent = text;
    return el;
  }

  function reasonCell(finding) {
    const td = document.createElement('td');
    td.className = 'reason';
    // English prose with quoted Arabic or Hebrew islands inside it. Pinning the
    // paragraph to LTR stops a reason that happens to BEGIN with an Arabic token
    // from flipping the entire sentence.
    td.dir = 'ltr';
    (finding.rules || []).forEach((id) => td.appendChild(ruleTag(id)));
    td.appendChild(document.createTextNode(finding.reason));
    return td;
  }

  function renderVerdict(res) {
    const host = $('#verdict-body');
    host.innerHTML = '';
    $('#verdict-empty').hidden = true;
    host.hidden = false;

    /* Banner */
    const banner = document.createElement('div');
    banner.className = 'banner ' + BANNER_CLASS[res.verdict];

    const label = document.createElement('span');
    label.className = 'banner-label';
    label.textContent = BANNER_TEXT[res.verdict];
    banner.appendChild(label);

    const score = document.createElement('span');
    score.className = 'banner-score';
    score.textContent = `name score ${res.nameScore} / 100`;
    banner.appendChild(score);

    const sub = document.createElement('p');
    sub.className = 'banner-sub';
    sub.textContent = res.verdictReason;
    banner.appendChild(sub);
    host.appendChild(banner);

    /* Hard stops */
    if (res.hardStops.length) {
      const block = document.createElement('div');
      block.className = 'section-block';
      const h = document.createElement('h2');
      h.textContent = 'Conditions that capped the verdict';
      block.appendChild(h);

      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent =
        'These can only lower the outcome, never raise it. An expired document or a failed ' +
        'check digit is a condition that stops the check, not a deduction from a score.';
      block.appendChild(p);

      res.hardStops.forEach((hs) => {
        const div = document.createElement('div');
        div.className = 'hardstop' + (hs.cap === 'NO_MATCH' ? ' bad' : '');
        div.appendChild(ruleTag(hs.rule));
        div.appendChild(document.createTextNode(hs.reason));
        block.appendChild(div);
      });
      host.appendChild(block);
    }

    /* Name breakdown */
    const nameBlock = document.createElement('div');
    nameBlock.className = 'section-block';
    const nh = document.createElement('h2');
    nh.textContent = 'Name comparison';
    nameBlock.appendChild(nh);

    const np = document.createElement('p');
    np.className = 'muted';
    np.textContent =
      'Tokens are matched independently of order, on their consonant skeleton rather than ' +
      'their spelling. The skeleton is shown under each token.';
    nameBlock.appendChild(np);

    if (res.name.preprocessing.length) {
      const pre = document.createElement('table');
      pre.className = 'breakdown';
      pre.innerHTML =
        '<thead><tr><th>Preprocessing</th><th>Applied to</th></tr></thead>';
      const pbody = document.createElement('tbody');
      res.name.preprocessing.forEach((f) => {
        const tr = document.createElement('tr');
        const td1 = reasonCell(f);
        tr.appendChild(td1);
        const td2 = document.createElement('td');
        td2.className = 'tok';
        td2.appendChild(bdi(f.subject));
        tr.appendChild(td2);
        pbody.appendChild(tr);
      });
      pre.appendChild(pbody);
      nameBlock.appendChild(pre);
    }

    const table = document.createElement('table');
    table.className = 'breakdown';
    table.innerHTML =
      '<thead><tr><th>Record A</th><th>Record B</th><th>Role</th><th>Score</th>' +
      '<th>Finding</th></tr></thead>';
    const tbody = document.createElement('tbody');

    res.name.pairs.forEach((p) => {
      const tr = document.createElement('tr');

      const tdA = document.createElement('td');
      tdA.className = 'tok';
      tdA.appendChild(bdi(p.a || '—'));
      if (p.aSkeleton) {
        const s = document.createElement('span');
        s.className = 'skel';
        s.textContent = p.aSkeleton;
        tdA.appendChild(s);
      }
      tr.appendChild(tdA);

      const tdB = document.createElement('td');
      tdB.className = 'tok';
      tdB.appendChild(bdi(p.b || '—'));
      if (p.bSkeleton) {
        const s = document.createElement('span');
        s.className = 'skel';
        s.textContent = p.bSkeleton;
        tdB.appendChild(s);
      }
      tr.appendChild(tdB);

      const tdR = document.createElement('td');
      tdR.className = 'muted';
      tdR.textContent = p.role;
      tr.appendChild(tdR);

      const tdS = document.createElement('td');
      tdS.className = 'score-cell';
      tdS.textContent = p.score == null ? '—' : String(p.score);
      tr.appendChild(tdS);

      tr.appendChild(reasonCell(p));
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    nameBlock.appendChild(table);
    host.appendChild(nameBlock);

    /* Checklist on the other fields */
    const checkBlock = document.createElement('div');
    checkBlock.className = 'section-block';
    const ch = document.createElement('h2');
    ch.textContent = 'Field checks';
    checkBlock.appendChild(ch);

    const ctable = document.createElement('table');
    ctable.className = 'breakdown';
    ctable.innerHTML =
      '<thead><tr><th>Field</th><th>Record A</th><th>Record B</th><th>Result</th>' +
      '<th>Finding</th></tr></thead>';
    const cbody = document.createElement('tbody');

    res.checks.forEach((c) => {
      const tr = document.createElement('tr');

      const tdF = document.createElement('td');
      tdF.textContent = c.field;
      tr.appendChild(tdF);

      const tdA = document.createElement('td');
      tdA.className = 'tok';
      tdA.appendChild(bdi(c.a || '—'));
      tr.appendChild(tdA);

      const tdB = document.createElement('td');
      tdB.className = 'tok';
      tdB.appendChild(bdi(c.b || '—'));
      tr.appendChild(tdB);

      const tdS = document.createElement('td');
      tdS.className = 'flag ' + c.status;
      tdS.textContent = c.statusLabel;
      tr.appendChild(tdS);

      tr.appendChild(reasonCell(c));
      cbody.appendChild(tr);
    });

    ctable.appendChild(cbody);
    checkBlock.appendChild(ctable);
    host.appendChild(checkBlock);

    /* Reproducibility footer */
    const foot = document.createElement('p');
    foot.className = 'muted';
    foot.textContent =
      `Engine ${res.engineVersion} · thresholds match ≥ ${res.thresholds.match}, ` +
      `refer ≥ ${res.thresholds.refer} · evaluated ${res.evaluatedOn}. ` +
      'The same inputs and thresholds always produce this same result.';
    host.appendChild(foot);
  }

  /* ── Rendering: case note ────────────────────────────────────────────── */

  function renderNote(res) {
    $('#note-empty').hidden = true;
    $('#note-body').hidden = false;
    $('#note-text').value = KYC.caseNote(res);
    $('#copy-status').textContent = '';
  }

  function copyNote() {
    const ta = $('#note-text');
    navigator.clipboard.writeText(ta.value).then(
      () => { $('#copy-status').textContent = 'Copied.'; },
      () => {
        // Clipboard API needs a secure context; opening the file directly from
        // disk does not always qualify. Fall back to selecting the text.
        ta.select();
        $('#copy-status').textContent = 'Select and copy manually (Ctrl+C).';
      }
    );
  }

  /* ── Rendering: method page ──────────────────────────────────────────── */

  function renderMethod() {
    const host = $('#method-body');
    host.innerHTML = METHOD_PROSE;

    /* The equivalence classes and the rule table are generated from the same
       data the engine runs on, so this page cannot drift out of date. */
    const chips = $('#method-classes');
    if (chips) {
      EQUIVALENCE_DISPLAY.forEach((c) => {
        const div = document.createElement('div');
        div.className = 'class-chip';
        const b = document.createElement('bdi');
        // Isolation alone is not enough here. These strings list Arabic, then
        // Hebrew, then Latin, and <bdi> takes its direction from the first
        // strong character — which is Arabic, flipping the whole line to RTL and
        // displaying the three groups in reverse. Forcing LTR keeps them in the
        // authored order while each Arabic run still renders right-to-left
        // internally, which is what we want.
        b.dir = 'ltr';
        b.textContent = c.members;
        div.appendChild(b);
        const s = document.createElement('span');
        s.className = 'cls';
        s.textContent = 'class ' + c.cls + ' — ' + c.note;
        div.appendChild(s);
        chips.appendChild(div);
      });
    }

    const rulesBody = $('#method-rules');
    if (rulesBody) {
      Object.keys(RULES).forEach((id) => {
        const r = RULES[id];
        const tr = document.createElement('tr');
        const td1 = document.createElement('td');
        td1.appendChild(ruleTag(id));
        tr.appendChild(td1);
        const td2 = document.createElement('td');
        td2.textContent = r.name;
        tr.appendChild(td2);
        const td3 = document.createElement('td');
        td3.textContent = r.description;
        tr.appendChild(td3);
        rulesBody.appendChild(tr);
      });
    }
  }

  /* ── Init ────────────────────────────────────────────────────────────── */

  function init() {
    buildFields('a');
    buildFields('b');
    writeRecord('a', EMPTY_RECORD);
    writeRecord('b', EMPTY_RECORD);
    buildSampleButtons();
    renderMethod();
    resetThresholds();

    $$('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
    $$('[data-goto]').forEach((b) =>
      b.addEventListener('click', () => showTab(b.dataset.goto))
    );

    $('#records-form').addEventListener('submit', (e) => {
      e.preventDefault();
      runCheck();
    });
    $('#clear-all').addEventListener('click', clearAll);
    $('#copy-note').addEventListener('click', copyNote);
    $('#th-reset').addEventListener('click', resetThresholds);
    $('#th-match').addEventListener('input', syncThresholdOutputs);
    $('#th-refer').addEventListener('input', syncThresholdOutputs);

    $('#engine-version-footer').textContent = 'Engine ' + KYC.VERSION;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
