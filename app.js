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

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* Mixed-script text goes inside <bdi> so an Arabic token cannot reorder the
     Latin around it. Without this the breakdown scrambles. */
  function bdi(text) {
    const n = document.createElement('bdi');
    n.textContent = text;
    return n;
  }

  const FIELD_DEFS = [
    { key: 'fullName',  label: 'Name',       type: 'text',   dir: true,
      placeholder: 'As printed on the record' },
    { key: 'dob',       label: 'Born',       type: 'date' },
    { key: 'sex',       label: 'Sex',        type: 'select', options: SEX_OPTIONS },
    { key: 'docType',   label: 'Document',   type: 'select', options: DOC_TYPES },
    { key: 'docNumber', label: 'Number',     type: 'text',   placeholder: '310256789' },
    { key: 'expiry',    label: 'Expires',    type: 'date' },
    { key: 'country',   label: 'Issued by',  type: 'select', options: COUNTRIES },
    { key: 'address',   label: 'Address',    type: 'text',   dir: true,
      placeholder: 'Street, city' },
    // The zone is long, fixed-width and optional, so it folds away rather than
    // holding six lines of height open on a form nobody has filled in yet.
    { key: 'mrz',       label: 'Machine-readable zone', type: 'mrz', rows: 3,
      placeholder: 'Optional — paste the MRZ lines' },
  ];

  let lastResult = null;

  /* Where each field's value came from, per record. Only machine-read fields
   * are tracked; anything absent was typed, which is the default and needs no
   * disclosure. Editing a field by hand always returns it to 'typed'. */
  const provenance = { a: {}, b: {} };

  /* What the reader last returned, per record. Kept so the panel can be redrawn
   * as the operator edits, and so a value read from the document can be put
   * back after it has been changed or cleared. */
  const lastRead = { a: null, b: null };
  const proposalSig = { a: '', b: '' };

  /* ── Field construction ──────────────────────────────────────────────── */

  function buildFields(side) {
    const host = $(`[data-fields="${side}"]`);
    host.innerHTML = '';

    FIELD_DEFS.forEach((def) => {
      const id = `${side}-${def.key}`;
      let wrap, labelEl, input;

      if (def.type === 'mrz') {
        wrap = el('details', 'field field-mrz');
        const summary = document.createElement('summary');
        labelEl = el('span', 'field-label', def.label);
        summary.appendChild(labelEl);
        wrap.appendChild(summary);

        input = document.createElement('textarea');
        input.rows = def.rows;
        input.spellcheck = false;
        // A fixed-width Latin format. Pinning LTR keeps the columns aligned
        // even when the rest of the record is Arabic, and no soft wrap keeps a
        // 44-character line one line.
        input.dir = 'ltr';
        input.wrap = 'off';
        input.placeholder = def.placeholder;
        // The summary text is not a <label for>, so give the textarea its own
        // accessible name rather than leaving a screen reader to guess.
        input.setAttribute('aria-label', def.label + ', record ' + side.toUpperCase());
        wrap.appendChild(input);
      } else {
        wrap = el('div', 'field');
        labelEl = el('label', 'field-label', def.label);
        labelEl.setAttribute('for', id);
        wrap.appendChild(labelEl);

        if (def.type === 'select') {
          input = document.createElement('select');
          def.options.forEach((opt) => {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            input.appendChild(o);
          });
        } else {
          input = document.createElement('input');
          input.type = def.type;
          if (def.placeholder) input.placeholder = def.placeholder;
          // Names and addresses may be Arabic, Hebrew or Latin. dir="auto" lets
          // the browser pick direction from the first strong character, so
          // right-to-left text is not rendered backwards.
          if (def.dir) input.dir = 'auto';
        }
        wrap.appendChild(input);
      }

      input.id = id;
      input.name = id;
      input.dataset.side = side;
      input.dataset.key = def.key;

      // Any manual edit clears machine-read provenance for that field: once a
      // human has changed it, it is their value, not the scanner's.
      input.addEventListener('input', () => {
        if (provenance[side][def.key]) {
          delete provenance[side][def.key];
          renderSourceChips(side);
        }
        // The panel's buttons describe each field's current state, so they go
        // stale the moment a field is touched. Redrawn only when a state
        // actually changes, not on every keystroke.
        refreshProposals(side);
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
    'mrz-validated': { text: 'MRZ', cls: 'ok',
      title: 'Read from the machine-readable zone; check digits verify.' },
    'ocr-unconfirmed': { text: 'unconfirmed', cls: 'warn',
      title: 'Read from the printed page. Nothing validates it — confirm before relying on it.' },
    'confirmed': { text: 'confirmed', cls: 'info',
      title: 'Read from the printed page and confirmed by you.' },
  };

  function renderSourceChips(side) {
    FIELD_DEFS.forEach((def) => {
      const input = $(`#${side}-${def.key}`);
      if (!input) return;
      const holder = input.closest('.field').querySelector('.field-label');
      if (!holder) return;
      const existing = holder.querySelector('.src-chip');
      if (existing) existing.remove();

      const state = provenance[side][def.key];
      if (!state || !PROV_CHIP[state]) return;
      const chip = el('span', 'src-chip ' + PROV_CHIP[state].cls, PROV_CHIP[state].text);
      chip.title = PROV_CHIP[state].title;
      holder.appendChild(chip);
    });
  }

  function wireCapture(side) {
    $(`#${side}-image`).addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) readImage(side, e.target.files[0]);
      // Clear it, or choosing the same file twice fires no second change event.
      e.target.value = '';
    });
    $(`[data-specimen="${side}"]`).addEventListener('click', () => readSpecimen(side));

    // Dropping a file is the other way people expect to hand an image to a
    // page. Same entry point as the picker, so there is one code path.
    const zone = $(`[data-capture="${side}"]`);
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };

    ['dragenter', 'dragover'].forEach((type) =>
      zone.addEventListener(type, (e) => { stop(e); zone.classList.add('dragging'); }));

    ['dragleave', 'dragend'].forEach((type) =>
      zone.addEventListener(type, (e) => {
        stop(e);
        // dragleave fires when crossing onto a child too, so only drop the
        // highlight once the pointer has actually left the panel.
        if (!zone.contains(e.relatedTarget)) zone.classList.remove('dragging');
      }));

    zone.addEventListener('drop', (e) => {
      stop(e);
      zone.classList.remove('dragging');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type)) {
        setStatus(side, 'That is not an image file.', 'bad');
        return;
      }
      readImage(side, file);
    });
  }

  function setStatus(side, text, cls) {
    const node = $(`#${side}-ocr-status`);
    node.textContent = text || '';
    node.className = 'capture-status' + (cls ? ' ' + cls : '');
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
    setStatus(side, 'Starting the reader — the first run has to load it.');

    OCR.readDocument(file, {
      onProgress: (status, p) => {
        setStatus(side, status.replace(/_/g, ' ') + ' — ' + Math.round(p * 100) + '%');
      },
    }).then((res) => {
      if (!res.ok) { setStatus(side, res.error, 'bad'); return; }

      // Everything read goes straight into the form, because that is what this
      // is for — but nothing the check digits do not cover counts as confirmed
      // until a person says so. Until then the verdict is capped, which is the
      // four-eyes step made mechanical rather than remembered.
      lastRead[side] = res;
      res.proposals.forEach((p) => applyProposal(side, p));
      renderProposals(side, res);

      const val = res.proposals.filter((p) => p.validated).length;
      const pending = res.proposals.length - val;
      setStatus(side,
        `Read ${res.proposals.length} field(s) · ${val} verified by check digit` +
        (pending ? ` · ${pending} awaiting you` : ''),
        pending ? 'warn' : 'ok');
    }).catch((e) => setStatus(side, 'Could not read that image: ' + e.message, 'bad'));
  }

  function labelForField(key) {
    const d = FIELD_DEFS.filter((f) => f.key === key)[0];
    return d ? d.label : key;
  }

  /* Redraw only when a row's state has actually changed. The input event fires
   * on every keystroke, and rebuilding the panel each time is both wasteful and
   * a way to lose a button under the pointer mid-click. */
  function refreshProposals(side) {
    if (!lastRead[side]) return;
    const sig = lastRead[side].proposals.map((p) => {
      const node = $(`#${side}-${p.field}`);
      return (provenance[side][p.field] || 'typed') +
             (node && node.value === p.value ? ':same' : ':differs');
    }).join('|');
    if (sig === proposalSig[side]) return;
    renderProposals(side, lastRead[side]);
  }

  function renderProposals(side, res) {
    const host = $(`#${side}-proposals`);
    host.innerHTML = '';
    host.hidden = false;

    const head = el('div', 'proposals-head');
    head.appendChild(el('span', '', 'Read from the document'));
    const acceptAll = el('button', 'btn btn-small', 'Confirm all');
    acceptAll.type = 'button';
    acceptAll.addEventListener('click', () => {
      res.proposals.forEach((p) => confirmProposal(side, p));
      renderProposals(side, res);
    });
    head.appendChild(acceptAll);
    host.appendChild(head);

    res.proposals.forEach((p) => {
      const row = el('div', 'proposal' + (p.validated ? ' validated' : ''));

      const main = el('div', 'proposal-main');
      main.appendChild(el('span', 'proposal-field', labelForField(p.field)));
      const val = bdi(p.field === 'mrz' ? p.value.split('\n')[0] + '…' : p.value);
      val.className = 'proposal-value';
      main.appendChild(val);
      main.appendChild(el('span', 'src-chip ' + (p.validated ? 'ok' : 'warn'),
        p.validated ? 'check digit ✓' : 'unvalidated'));
      row.appendChild(main);

      // One control per row, and which one depends on where the field now
      // stands relative to what was read:
      //
      //   mrz-validated    Verified   arithmetic already settled it
      //   confirmed        Confirmed  a person has signed off on it
      //   ocr-unconfirmed  Confirm    in the form, not yet counted
      //   edited, differs  Restore    put the document's value back
      //   edited, matches  Confirm    typed back to what was read
      //
      // The Restore case is the one that has to exist. An operator who clears
      // or overtypes a field by accident has otherwise lost what the document
      // said, with no way back short of scanning it again.
      const state = provenance[side][p.field];
      const node = $(`#${side}-${p.field}`);
      const differs = !node || node.value !== p.value;

      const btn = el('button', 'btn btn-small',
        state === 'mrz-validated' ? 'Verified'
        : state === 'confirmed'   ? 'Confirmed'
        : state                   ? 'Confirm'
        : differs                 ? 'Restore'
        : 'Confirm');
      btn.type = 'button';
      btn.disabled = state === 'mrz-validated' || state === 'confirmed';
      btn.title = differs && !state
        ? 'Put back what the document said: ' + p.value.split('\n').join(' / ')
        : '';
      btn.addEventListener('click', () => {
        // Restoring hands the field back to the machine, so it returns to the
        // machine's provenance — verified by check digit, or awaiting a person
        // again. It does not arrive confirmed just because someone pressed a
        // button to put it back.
        if (!state && differs) applyProposal(side, p);
        else confirmProposal(side, p);
        renderProposals(side, res);
      });
      row.appendChild(btn);

      row.appendChild(el('p', 'proposal-note', p.note));
      host.appendChild(row);
    });

    if (res.mrz && res.mrz.corrections && res.mrz.corrections.length) {
      host.appendChild(el('p', 'proposal-note corrections',
        'Corrected ' + res.mrz.corrections.length + ' character(s) whose position in the ' +
        'zone requires a digit or a letter: ' +
        res.mrz.corrections.map((c) => `line ${c.line} col ${c.pos} ${c.from}→${c.to}`)
          .join(', ') + '. The check digits then verified, which is what confirms the fix.'));
    }

    proposalSig[side] = res.proposals.map((p) => {
      const node = $(`#${side}-${p.field}`);
      return (provenance[side][p.field] || 'typed') +
             (node && node.value === p.value ? ':same' : ':differs');
    }).join('|');
  }

  /* Fill a field from what was read — on the first read, and again whenever
   * the operator asks for the document's value back. */
  function applyProposal(side, p) {
    const node = $(`#${side}-${p.field}`);
    if (!node) return;
    node.value = p.value;
    // Values the check digits cover are confirmed by arithmetic; everything
    // else is in the form but does not count until a person says so.
    provenance[side][p.field] = p.validated ? 'mrz-validated' : 'ocr-unconfirmed';
    if (p.field === 'mrz') { const d = node.closest('details'); if (d) d.open = true; }
    renderSourceChips(side);
  }

  /* Confirm whatever is in the field NOW — deliberately not the value that was
   * originally read. An operator who corrects a misread and then confirms it
   * must not have their correction thrown away, which is exactly what
   * re-applying the proposal would do. */
  function confirmProposal(side, p) {
    const state = provenance[side][p.field];
    const node = $(`#${side}-${p.field}`);
    const matchesRead = !!node && node.value === p.value;

    // Awaiting confirmation is the ordinary case. A field the operator has
    // since typed themselves can also be confirmed, but only while it still
    // agrees with what the document said: confirming a value the document
    // never carried would record a machine reading that never happened.
    if (state !== 'ocr-unconfirmed' && !(state === undefined && matchesRead)) return;
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
      const node = $(`#${side}-${def.key}`);
      node.value = rec[def.key] != null ? rec[def.key] : '';
    });
  }

  /* ── Sample cases ────────────────────────────────────────────────────── */

  function buildSampleButtons() {
    const host = $('#sample-buttons');
    host.innerHTML = '';

    Object.keys(SAMPLE_CASES).forEach((key) => {
      const btn = el('button', null, SAMPLE_CASES[key].label);
      btn.type = 'button';
      btn.dataset.case = key;
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', () => loadCase(key));
      host.appendChild(btn);
    });
  }

  function loadCase(key) {
    const c = SAMPLE_CASES[key];
    if (!c) return;

    writeRecord('a', c.a);
    writeRecord('b', c.b);

    $$('#sample-buttons button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.case === key));
    });
    ['a', 'b'].forEach(renderSourceChips);
    $('#sample-blurb').textContent = c.blurb;
  }

  /* Is there anything a Clear would actually throw away? A blank form is not
   * worth a confirmation prompt; a form someone has filled in is. */
  function formHasContent() {
    return ['a', 'b'].some((side) =>
      FIELD_DEFS.some((def) => {
        const v = ($(`#${side}-${def.key}`).value || '').trim();
        return v && v !== EMPTY_RECORD[def.key];
      }));
  }

  function clearAll() {
    // Confirm only when there is real input to lose, so one misclick cannot
    // wipe a filled-in comparison — but an empty form clears without friction.
    if (formHasContent() && !window.confirm('Clear both records and the finding?')) return;
    writeRecord('a', EMPTY_RECORD);
    writeRecord('b', EMPTY_RECORD);
    $$('#sample-buttons button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    $('#sample-blurb').textContent = '';
    lastResult = null;
    $('#verdict').hidden = true;
    ['a', 'b'].forEach((side) => {
      provenance[side] = {};
      lastRead[side] = null;
      proposalSig[side] = '';
      renderSourceChips(side);
      const pr = $(`#${side}-proposals`); if (pr) pr.hidden = true;
      setStatus(side, '');
    });
  }

  /* ── Sheets ──────────────────────────────────────────────────────────── */

  function openSheet(id) {
    const d = document.getElementById(id);
    if (d && typeof d.showModal === 'function') d.showModal();
  }

  function wireSheets() {
    $$('[data-open]').forEach((b) =>
      b.addEventListener('click', () => openSheet(b.dataset.open)));
    $$('dialog').forEach((d) => {
      $$('[data-close]', d).forEach((b) => b.addEventListener('click', () => d.close()));
      // Clicking the backdrop closes it. The dialog element reports backdrop
      // clicks as clicks on itself, so compare against the target.
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
    $('#rule-pop').hidden = true;
    if (popAnchor) popAnchor.setAttribute('aria-expanded', 'false');
    popAnchor = null;
  }

  function showRulePop(anchor, id) {
    const rule = RULES[id];
    if (!rule) return;
    const pop = $('#rule-pop');

    pop.innerHTML = '';
    pop.append(el('span', 'pop-id', id),
               el('span', 'pop-name', rule.name),
               el('span', 'pop-desc', rule.description));

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
    return { match: Number($('#th-match').value), refer: Number($('#th-refer').value) };
  }

  function syncThresholdOutputs() {
    const t = readThresholds();
    // The refer threshold can never sit above the match threshold, or the bands
    // become incoherent. Clamp rather than letting the user build a broken scale.
    if (t.refer >= t.match) $('#th-refer').value = Math.max(20, t.match - 1);
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
      $('#sample-blurb').textContent = 'Enter a name in both records, or load a sample above.';
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

  /* ── Rendering: the finding ──────────────────────────────────────────── */

  const BANNER_CLASS = { MATCH: 'match', REFER: 'refer', NO_MATCH: 'nomatch' };
  const BANNER_TEXT  = { MATCH: 'Match', REFER: 'Refer', NO_MATCH: 'No match' };

  function ruleTag(id) {
    const span = el('span', 'rule-id', id);
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

  /* English prose with quoted Arabic or Hebrew islands inside it. Pinning the
     paragraph to LTR stops a reason that happens to BEGIN with an Arabic token
     from flipping the entire sentence. */
  function reasonLine(finding) {
    const p = el('p', 'item-reason');
    p.dir = 'ltr';
    (finding.rules || []).forEach((id) => p.appendChild(ruleTag(id)));
    p.appendChild(document.createTextNode(finding.reason));
    return p;
  }

  function tokenCell(text, skeleton) {
    const cell = el('span', 'tok');
    cell.appendChild(bdi(text || '—'));
    if (skeleton) cell.appendChild(el('i', null, skeleton));
    return cell;
  }

  function renderVerdict(res) {
    const outer = $('#verdict');
    outer.innerHTML = '';
    outer.hidden = false;

    const card = el('div', 'result ' + BANNER_CLASS[res.verdict]);
    outer.appendChild(card);

    /* The answer, and the number behind it. */
    const hero = el('div', 'result-hero');
    hero.appendChild(el('div', 'verdict-word', BANNER_TEXT[res.verdict]));

    const score = el('div', 'score', String(res.nameScore));
    score.appendChild(el('span', null, ' / 100'));
    hero.appendChild(score);
    hero.appendChild(el('div', 'score-label', 'Name score'));

    // The bar carries the two thresholds it was judged against, so which side
    // of the line the score fell on is visible without reading the sentence.
    const meter = el('div', 'meter');
    const bar = document.createElement('i');
    bar.style.width = Math.max(2, res.nameScore) + '%';
    meter.appendChild(bar);
    [res.thresholds.refer, res.thresholds.match].forEach((at) => {
      const tick = document.createElement('u');
      tick.style.left = at + '%';
      tick.dataset.at = at;
      meter.appendChild(tick);
    });
    hero.appendChild(meter);

    hero.appendChild(el('p', 'result-reason', res.verdictReason));

    const acts = el('div', 'result-actions');
    const noteBtn = el('button', 'btn btn-small', 'Case note');
    noteBtn.type = 'button';
    noteBtn.addEventListener('click', () => openSheet('sheet-note'));
    acts.appendChild(noteBtn);
    hero.appendChild(acts);

    card.appendChild(hero);

    /* Anything that capped the outcome comes first: it overrode the score. */
    if (res.hardStops.length) {
      const stops = el('div', 'group stops');
      const head = el('div', 'group-head');
      const h = el('h3', null, 'Capped the outcome ');
      if (res.capRule) h.appendChild(ruleTag(res.capRule));   // CAP-1: the capping mechanism itself
      head.appendChild(h);
      head.appendChild(el('span', null, 'these can only lower it'));
      stops.appendChild(head);

      res.hardStops.forEach((hs) => {
        const item = el('div', 'item' + (hs.cap === 'NO_MATCH' ? ' bad' : ''));
        item.appendChild(reasonLine({ rules: [hs.rule], reason: hs.reason }));
        stops.appendChild(item);
      });
      card.appendChild(stops);
    }

    /* Name comparison — the part this tool exists for, so it stays open. */
    const nameGroup = el('div', 'group');
    const nameHead = el('div', 'group-head');
    const nameH = el('h3', null, 'Name ');
    // AGG-1: with more than one token the score is a weighted aggregate, so the
    // rule that weights it is cited on the section rather than left implicit.
    if (res.name.aggregated) nameH.appendChild(ruleTag('AGG-1'));
    nameHead.appendChild(nameH);
    nameHead.appendChild(el('span', null,
      res.name.pairs.length + (res.name.pairs.length === 1 ? ' token' : ' tokens')));
    nameGroup.appendChild(nameHead);

    res.name.preprocessing.forEach((f) => {
      const item = el('div', 'item');
      const top = el('div', 'item-top');
      top.appendChild(tokenCell(f.subject));
      item.appendChild(top);
      item.appendChild(reasonLine(f));
      nameGroup.appendChild(item);
    });

    res.name.pairs.forEach((p) => {
      const item = el('div', 'item');

      const top = el('div', 'item-top');
      const toks = el('div', 'pair-tokens');
      toks.appendChild(tokenCell(p.a, p.aSkeleton));
      toks.appendChild(el('span', 'arrow', '→'));
      toks.appendChild(tokenCell(p.b, p.bSkeleton));
      top.appendChild(toks);

      const meta = el('div', 'item-meta');
      meta.appendChild(el('span', 'role', p.role));
      meta.appendChild(el('span', 'score-cell', p.score == null ? '—' : String(p.score)));
      top.appendChild(meta);
      item.appendChild(top);

      item.appendChild(reasonLine(p));
      nameGroup.appendChild(item);
    });
    card.appendChild(nameGroup);

    /* Field checks fold: six rows of agreement is not what anyone opened this
       page to read, but it has to stay one click away. */
    const checks = el('details', 'group group-fold');
    const summary = document.createElement('summary');
    summary.appendChild(document.createTextNode('Field checks'));
    // Counting what was flagged rather than what agreed: "agree" would be a
    // stretch for a check whose result is Plausible or Not comparable.
    const flagged = res.checks.filter((c) => c.status === 'warn' || c.status === 'bad').length;
    summary.appendChild(el('span', 'sum',
      res.checks.length + ' checks · ' + (flagged ? flagged + ' flagged' : 'none flagged')));
    checks.appendChild(summary);

    res.checks.forEach((c) => {
      const item = el('div', 'item');

      const top = el('div', 'item-top');
      const vals = el('div', 'vals');
      vals.dir = 'ltr';
      vals.appendChild(el('strong', null, c.field));
      vals.appendChild(document.createTextNode(' '));
      vals.appendChild(bdi(c.a || '—'));
      vals.appendChild(el('span', 'arrow', '→'));
      vals.appendChild(bdi(c.b || '—'));
      top.appendChild(vals);

      const meta = el('div', 'item-meta');
      meta.appendChild(el('span', 'flag ' + c.status, c.statusLabel));
      top.appendChild(meta);
      item.appendChild(top);

      item.appendChild(reasonLine(c));
      checks.appendChild(item);
    });
    card.appendChild(checks);

    /* Everything needed to run this again and get the same answer. */
    card.appendChild(el('p', 'repro',
      `Engine ${res.engineVersion} · match ≥ ${res.thresholds.match}, ` +
      `refer ≥ ${res.thresholds.refer} · ${res.evaluatedOn}`));
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
        // The clipboard API needs a secure context; opening the file straight
        // from disk does not always qualify. Fall back to selecting the text.
        ta.select();
        $('#copy-status').textContent = 'Select and copy (Ctrl+C).';
      }
    );
  }

  /* Save the note as a text file. Built and revoked entirely in the page — the
   * note never leaves the browser, same as everything else here. */
  function downloadNote() {
    const text = $('#note-text').value;
    if (!text) return;
    const verdict = lastResult ? lastResult.verdict.toLowerCase().replace('_', '-') : 'note';
    const date = lastResult ? lastResult.evaluatedOn : new Date().toISOString().slice(0, 10);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kyc-note-${verdict}-${date}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    $('#copy-status').textContent = 'Downloaded.';
  }

  /* ── Rendering: how it works ─────────────────────────────────────────── */

  function renderMethod() {
    const host = $('#method-body');
    host.innerHTML = METHOD_PROSE;

    /* The equivalence classes and the rule table are generated from the same
       data the engine runs on, so this page cannot drift out of date. */
    const chips = $('#method-classes');
    if (chips) {
      EQUIVALENCE_DISPLAY.forEach((c) => {
        const div = el('div', 'class-chip');
        const b = bdi(c.members);
        // Isolation alone is not enough here. These strings list Arabic, then
        // Hebrew, then Latin, and <bdi> takes its direction from the first
        // strong character — which is Arabic, flipping the whole line to RTL
        // and showing the three groups in reverse. Forcing LTR keeps them in
        // the authored order while each Arabic run still renders right-to-left
        // internally, which is what we want.
        b.dir = 'ltr';
        div.appendChild(b);
        div.appendChild(el('span', 'cls', 'class ' + c.cls + ' — ' + c.note));
        chips.appendChild(div);
      });
    }

    const rulesBody = $('#method-rules');
    if (rulesBody) {
      Object.keys(RULES).forEach((id) => {
        const tr = document.createElement('tr');
        const td1 = document.createElement('td');
        td1.appendChild(ruleTag(id));
        tr.appendChild(td1);
        tr.appendChild(el('td', null, RULES[id].name));
        tr.appendChild(el('td', null, RULES[id].description));
        rulesBody.appendChild(tr);
      });
    }
  }

  /* ── Init ────────────────────────────────────────────────────────────── */

  function init() {
    ['a', 'b'].forEach((side) => {
      buildFields(side);
      wireCapture(side);
      writeRecord(side, EMPTY_RECORD);
    });
    buildSampleButtons();
    renderMethod();
    resetThresholds();

    wireSheets();
    wireRulePop();

    $('#records-form').addEventListener('submit', (e) => {
      e.preventDefault();
      runCheck();
    });
    $('#clear-all').addEventListener('click', clearAll);
    $('#copy-note').addEventListener('click', copyNote);
    $('#download-note').addEventListener('click', downloadNote);
    $('#th-reset').addEventListener('click', resetThresholds);
    $('#th-match').addEventListener('input', syncThresholdOutputs);
    $('#th-refer').addEventListener('input', syncThresholdOutputs);

    $('#engine-version-footer').textContent = 'Engine ' + KYC.VERSION;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
