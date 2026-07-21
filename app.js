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

  /* Where each field's value came from, per record. Only machine-read fields
   * are tracked; anything absent was typed, which is the default and needs no
   * disclosure. Editing a field by hand always returns it to 'typed'. */
  const provenance = { a: {}, b: {} };
  const pendingProposals = { a: [], b: [] };

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

      // Any manual edit clears machine-read provenance for that field: once a
      // human has changed it, it is their value, not the scanner's.
      input.addEventListener('input', () => {
        if (provenance[side][def.key]) {
          delete provenance[side][def.key];
          renderSourceChips(side);
        }
      });

      host.appendChild(wrap);
    });
  }

  /* ── Reading a document image ────────────────────────────────────────────
   *
   * This only ever writes into the form. The engine is called later, on
   * whatever the operator has left in the fields — see ocr.js for why the
   * separation matters.
   */

  const PROV_CHIP = {
    'mrz-validated': { text: 'MRZ ✓', cls: 'ok',
      title: 'Read from the machine-readable zone; check digits verify.' },
    'ocr-unconfirmed': { text: 'OCR ?', cls: 'warn',
      title: 'Read from the printed page. Nothing validates it — confirm before relying on it.' },
    'confirmed': { text: 'OCR ✓', cls: 'info',
      title: 'Read from the printed page and confirmed by you.' },
  };

  function renderSourceChips(side) {
    FIELD_DEFS.forEach((def) => {
      const el = $(`#${side}-${def.key}`);
      if (!el) return;
      const label = el.parentElement.querySelector('label');
      if (!label) return;
      const existing = label.querySelector('.src-chip');
      if (existing) existing.remove();

      const state = provenance[side][def.key];
      if (!state || !PROV_CHIP[state]) return;
      const chip = document.createElement('span');
      chip.className = 'src-chip ' + PROV_CHIP[state].cls;
      chip.textContent = PROV_CHIP[state].text;
      chip.title = PROV_CHIP[state].title;
      label.appendChild(chip);
    });
  }

  function buildCapturePanel(side) {
    const fieldset = $(`fieldset[data-record="${side}"]`);
    const panel = document.createElement('div');
    panel.className = 'capture';
    panel.innerHTML =
      '<div class="capture-actions">' +
        '<label class="capture-btn">Read from document image' +
          `<input type="file" accept="image/*" id="${side}-image" hidden>` +
        '</label>' +
        `<button type="button" class="link-btn" data-specimen="${side}">Try the specimen</button>` +
      '</div>' +
      `<p class="field-hint capture-note">Read here in your browser; the image is never ` +
        `uploaded. Filling the form only — the reader takes no part in the decision.</p>` +
      `<div class="capture-status" id="${side}-ocr-status" role="status"></div>` +
      `<div class="proposals" id="${side}-proposals" hidden></div>`;

    fieldset.insertBefore(panel, $(`[data-fields="${side}"]`));

    $(`#${side}-image`).addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) readImage(side, e.target.files[0]);
      e.target.value = '';
    });
    $(`[data-specimen="${side}"]`).addEventListener('click', () => readSpecimen(side));
  }

  function setStatus(side, text, cls) {
    const el = $(`#${side}-ocr-status`);
    el.textContent = text || '';
    el.className = 'capture-status' + (cls ? ' ' + cls : '');
  }

  /* The bundled schematic, fed through exactly the same path as a photograph.
   *
   * A pre-rendered image rather than the SVG rasterised here: an SVG is drawn
   * with whatever fonts the viewer happens to have, and the filler character
   * '<' is precisely the glyph whose shape decides whether the zone reads at
   * all. Rendering it on the visitor's machine would make the demo depend on
   * their font stack, so everyone gets the same pixels instead. specimen.svg
   * remains in the repo as the editable source.
   *
   * A clean vector render is still far easier to read than a phone photo, so
   * this demonstrates the pipeline rather than real-world accuracy. */
  function readSpecimen(side) {
    setStatus(side, 'Loading the specimen…');
    fetch('specimen.png')
      .then((r) => { if (!r.ok) throw new Error('specimen.png not found'); return r.blob(); })
      .then((blob) => readImage(side, new File([blob], 'specimen.png', { type: 'image/png' })))
      .catch((e) => setStatus(side, e.message, 'bad'));
  }

  function readImage(side, file) {
    if (typeof OCR === 'undefined') {
      setStatus(side, 'The reader could not be loaded.', 'bad');
      return;
    }
    $(`#${side}-proposals`).hidden = true;
    setStatus(side, 'Starting the reader… (first run loads it, which takes a moment)');

    OCR.readDocument(file, {
      onProgress: (status, p) => {
        setStatus(side, status.replace(/_/g, ' ') + ' — ' + Math.round(p * 100) + '%');
      },
    }).then((res) => {
      if (!res.ok) { setStatus(side, res.error, 'bad'); return; }
      pendingProposals[side] = res.proposals;

      // Everything read goes straight into the form, because that is what this
      // is for — but nothing the check digits do not cover counts as confirmed
      // until a person says so. Until then the verdict is capped, which is the
      // four-eyes step made mechanical rather than remembered.
      res.proposals.forEach((p) => applyProposal(side, p));
      renderProposals(side, res);

      const val = res.proposals.filter((p) => p.validated).length;
      const pending = res.proposals.length - val;
      setStatus(side,
        `Read ${res.proposals.length} field(s); ${val} confirmed by check digit` +
        (pending ? `, ${pending} awaiting your confirmation.` : '.'),
        pending ? 'warn' : 'ok');
    }).catch((e) => setStatus(side, 'Could not read that image: ' + e.message, 'bad'));
  }

  function labelForField(key) {
    const d = FIELD_DEFS.filter((f) => f.key === key)[0];
    return d ? d.label.replace(' (optional)', '') : key;
  }

  function renderProposals(side, res) {
    const host = $(`#${side}-proposals`);
    host.innerHTML = '';
    host.hidden = false;

    const head = document.createElement('div');
    head.className = 'proposals-head';
    head.innerHTML = '<strong>Read from the document</strong>';
    const acceptAll = document.createElement('button');
    acceptAll.type = 'button';
    acceptAll.className = 'btn btn-small';
    acceptAll.textContent = 'Confirm all';
    acceptAll.addEventListener('click', () => {
      res.proposals.forEach((p) => confirmProposal(side, p));
      renderProposals(side, res);
    });
    head.appendChild(acceptAll);
    host.appendChild(head);

    res.proposals.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'proposal' + (p.validated ? ' validated' : '');

      const main = document.createElement('div');
      main.className = 'proposal-main';
      const name = document.createElement('span');
      name.className = 'proposal-field';
      name.textContent = labelForField(p.field);
      main.appendChild(name);

      const val = document.createElement('bdi');
      val.className = 'proposal-value';
      val.textContent = p.field === 'mrz' ? p.value.split('\n')[0] + '…' : p.value;
      main.appendChild(val);

      const tag = document.createElement('span');
      tag.className = 'src-chip ' + (p.validated ? 'ok' : 'warn');
      tag.textContent = p.validated ? 'check digit ✓' : 'unvalidated';
      main.appendChild(tag);
      row.appendChild(main);

      const note = document.createElement('p');
      note.className = 'proposal-note';
      note.textContent = p.note;
      row.appendChild(note);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-small';
      // Validated values need no confirmation; unvalidated ones are already in
      // the form but do not count until someone accepts them.
      // No provenance at all means the operator has since edited the field by
      // hand, so it is their value and needs no confirmation from anyone.
      const state = provenance[side][p.field];
      btn.textContent = state === 'mrz-validated' ? 'Verified'
                      : state === 'confirmed' ? 'Confirmed'
                      : !state ? 'Edited by you'
                      : 'Confirm';
      btn.disabled = state !== 'ocr-unconfirmed';
      btn.addEventListener('click', () => {
        confirmProposal(side, p);
        renderProposals(side, res);
      });
      row.appendChild(btn);

      host.appendChild(row);
    });

    if (res.mrz && res.mrz.corrections && res.mrz.corrections.length) {
      const fix = document.createElement('p');
      fix.className = 'proposal-note corrections';
      fix.textContent =
        'Corrected ' + res.mrz.corrections.length + ' character(s) whose position in the ' +
        'zone requires a digit or a letter: ' +
        res.mrz.corrections.map((c) => `line ${c.line} col ${c.pos} ${c.from}→${c.to}`)
          .join(', ') + '. The check digits then verified, which is what confirms the fix.';
      host.appendChild(fix);
    }
  }

  /* Fill a field from what was read. Only used on the initial read. */
  function applyProposal(side, p) {
    const el = $(`#${side}-${p.field}`);
    if (!el) return;
    el.value = p.value;
    // Values the check digits cover are confirmed by arithmetic; everything
    // else is in the form but does not count until a person says so.
    provenance[side][p.field] = p.validated ? 'mrz-validated' : 'ocr-unconfirmed';
    renderSourceChips(side);
  }

  /* Confirm whatever is in the field NOW — deliberately not the value that was
   * originally read. An operator who corrects a misread and then confirms it
   * must not have their correction thrown away, which is exactly what
   * re-applying the proposal would do. */
  function confirmProposal(side, p) {
    if (!provenance[side][p.field]) return;   // already edited by hand: it is theirs
    provenance[side][p.field] = 'confirmed';
    renderSourceChips(side);
  }

  function readRecord(side) {
    const rec = {};
    FIELD_DEFS.forEach((def) => {
      rec[def.key] = ($(`#${side}-${def.key}`).value || '').trim();
    });
    return rec;
  }

  function writeRecord(side, rec) {
    // Loading a record replaces every value, so nothing on it is machine-read
    // any more.
    provenance[side] = {};
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
    ['a', 'b'].forEach(renderSourceChips);
    $('#sample-blurb').textContent = c.blurb;
  }

  function clearAll() {
    writeRecord('a', EMPTY_RECORD);
    writeRecord('b', EMPTY_RECORD);
    $$('.sample-btn').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    $('#sample-blurb').textContent = '';
    lastResult = null;
    $('#verdict').hidden = true;
    ['a', 'b'].forEach((side) => {
      provenance[side] = {};
      pendingProposals[side] = [];
      renderSourceChips(side);
      const pr = $(`#${side}-proposals`); if (pr) pr.hidden = true;
      setStatus(side, '');
    });
  }

  /* ── Modals ──────────────────────────────────────────────────────────── */

  function openModal(id) {
    const d = document.getElementById(id);
    if (d && typeof d.showModal === 'function') d.showModal();
  }

  function wireModals() {
    $$('[data-open]').forEach((b) =>
      b.addEventListener('click', () => openModal(b.dataset.open)));
    $$('dialog').forEach((d) => {
      d.querySelectorAll('[data-close]').forEach((b) =>
        b.addEventListener('click', () => d.close()));
      // Clicking the backdrop closes it. The dialog element reports clicks on
      // the backdrop as clicks on itself, so compare against the target.
      d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    });
  }

  /* ── Rule popover ────────────────────────────────────────────────────────
   *
   * Every score in this tool cites a rule, and that claim is only worth
   * anything if the reader can actually find out what the rule says. Press any
   * id and it tells you, anchored where you pressed rather than buried in a
   * native tooltip nobody discovers.
   */

  let popAnchor = null;

  function hideRulePop() {
    const pop = $('#rule-pop');
    pop.hidden = true;
    if (popAnchor) popAnchor.setAttribute('aria-expanded', 'false');
    popAnchor = null;
  }

  function showRulePop(anchor, id) {
    const rule = RULES[id];
    if (!rule) return;
    const pop = $('#rule-pop');

    pop.innerHTML = '';
    const idEl = document.createElement('span');
    idEl.className = 'pop-id';
    idEl.textContent = id;
    const nameEl = document.createElement('span');
    nameEl.className = 'pop-name';
    nameEl.textContent = rule.name;
    const descEl = document.createElement('span');
    descEl.className = 'pop-desc';
    descEl.textContent = rule.description;
    pop.append(idEl, nameEl, descEl);

    pop.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    // Keep it on screen: prefer left-aligned to the id, shift in if it would
    // overflow, and point the arrow back at whatever was pressed.
    let left = r.left + window.scrollX;
    const maxLeft = window.scrollX + document.documentElement.clientWidth - w - 12;
    if (left > maxLeft) left = Math.max(window.scrollX + 12, maxLeft);
    pop.style.left = left + 'px';
    pop.style.top = (r.bottom + window.scrollY + 8) + 'px';
    pop.style.setProperty('--arrow',
      Math.max(10, Math.min(w - 18, r.left + window.scrollX - left + 8)) + 'px');

    anchor.setAttribute('aria-expanded', 'true');
    popAnchor = anchor;
  }

  function wireRulePop() {
    document.addEventListener('click', (e) => {
      const chip = e.target.closest ? e.target.closest('.rule-id') : null;
      if (chip) {
        if (popAnchor === chip) { hideRulePop(); return; }
        hideRulePop();
        showRulePop(chip, chip.dataset.rule);
        return;
      }
      if (!e.target.closest || !e.target.closest('#rule-pop')) hideRulePop();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideRulePop(); });
    window.addEventListener('resize', hideRulePop);
    window.addEventListener('scroll', hideRulePop, { passive: true });
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

    lastResult = KYC.compare(a, b, {
      thresholds: readThresholds(),
      provenance: provenance,
    });

    renderVerdict(lastResult);
    renderNote(lastResult);
    $('#verdict').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ── Rendering: verdict ──────────────────────────────────────────────── */

  const BANNER_CLASS = { MATCH: 'match', REFER: 'refer', NO_MATCH: 'nomatch' };
  const BANNER_TEXT  = { MATCH: 'MATCH', REFER: 'REFER', NO_MATCH: 'NO MATCH' };

  function ruleTag(id) {
    const span = document.createElement('span');
    span.className = 'rule-id';
    span.textContent = id;
    span.dataset.rule = id;
    span.setAttribute('role', 'button');
    span.setAttribute('tabindex', '0');
    span.setAttribute('aria-expanded', 'false');
    span.title = RULES[id] ? RULES[id].name : id;
    span.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); span.click(); }
    });
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
    const outer = $('#verdict');
    outer.innerHTML = '';
    outer.hidden = false;

    const host = document.createElement('div');
    host.className = 'finding ' + BANNER_CLASS[res.verdict];
    outer.appendChild(host);

    /* The finding, stamped. */
    const top = document.createElement('div');
    top.className = 'finding-top';

    const stamp = document.createElement('div');
    stamp.className = 'stamp';
    stamp.textContent = BANNER_TEXT[res.verdict];
    top.appendChild(stamp);

    const gist = document.createElement('div');
    gist.className = 'finding-gist';

    const score = document.createElement('div');
    score.className = 'finding-score';
    score.innerHTML = 'Name score <b>' + res.nameScore + '</b> / 100';
    gist.appendChild(score);

    // The bar plus the two thresholds it was judged against, so the decision is
    // legible without reading the sentence underneath.
    const meter = document.createElement('div');
    meter.className = 'meter';
    const bar = document.createElement('i');
    bar.style.width = Math.max(2, res.nameScore) + '%';
    meter.appendChild(bar);
    [['refer', res.thresholds.refer], ['match', res.thresholds.match]].forEach(([label, at]) => {
      const tick = document.createElement('u');
      tick.style.left = at + '%';
      tick.dataset.label = label + ' ' + at;
      tick.title = 'Threshold: ' + label + ' at ' + at;
      meter.appendChild(tick);
    });
    gist.appendChild(meter);

    const sub = document.createElement('p');
    sub.className = 'finding-reason';
    sub.textContent = res.verdictReason;
    gist.appendChild(sub);
    top.appendChild(gist);

    const acts = document.createElement('div');
    acts.className = 'finding-actions';
    const noteBtn = document.createElement('button');
    noteBtn.type = 'button';
    noteBtn.className = 'btn btn-small';
    noteBtn.textContent = 'Case note';
    noteBtn.addEventListener('click', () => openModal('modal-note'));
    acts.appendChild(noteBtn);
    top.appendChild(acts);

    host.appendChild(top);

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

    /* Reproducibility line — everything needed to run this again. */
    const foot = document.createElement('p');
    foot.className = 'repro';
    foot.textContent =
      `Engine ${res.engineVersion} · thresholds match \u2265 ${res.thresholds.match}, ` +
      `refer \u2265 ${res.thresholds.refer} · evaluated ${res.evaluatedOn} · ` +
      'the same inputs and thresholds always produce this same finding.';
    host.appendChild(foot);
  }

  /* ── Rendering: case note ────────────────────────────────────────────── */

  function renderNote(res) {
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
    buildCapturePanel('a');
    buildCapturePanel('b');
    writeRecord('a', EMPTY_RECORD);
    writeRecord('b', EMPTY_RECORD);
    buildSampleButtons();
    renderMethod();
    resetThresholds();

    wireModals();
    wireRulePop();

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
