/*
 * screening.js — DOM wiring for the screening page.
 *
 * All decision logic lives in engine.js (KYC.screen / KYC.screeningNote); this
 * file reads the query, calls the engine against the loaded list, and renders
 * what comes back. Shared helpers come from ui.js (UI.*).
 */

(function () {
  'use strict';

  const { $, $$, el, bdi, ruleTag } = UI;

  /* The list the page screens against. If the loader has produced real lists
   * (lists/live.js defines LIVE_WATCHLIST) they are used; otherwise the page
   * falls back to the synthetic sample. Either way the query stays in the
   * browser — only the reference list differs. */
  const LIVE = (typeof LIVE_WATCHLIST !== 'undefined') && LIVE_WATCHLIST.length;
  const LIST = LIVE ? LIVE_WATCHLIST
    : (typeof SAMPLE_WATCHLIST !== 'undefined') ? SAMPLE_WATCHLIST : [];
  const RISK = LIVE && typeof LIVE_COUNTRY_RISK !== 'undefined' ? LIVE_COUNTRY_RISK
    : (typeof SAMPLE_COUNTRY_RISK !== 'undefined') ? SAMPLE_COUNTRY_RISK : {};
  const META = (typeof LIVE_META !== 'undefined') ? LIVE_META : null;
  const INDEX = KYC.buildScreeningIndex(LIST);
  const IS_SAMPLE = !LIVE;

  const DEFAULT_HIT = 75;
  let lastResult = null;

  /* ── Query fields ────────────────────────────────────────────────────── */

  const SEXES = (typeof SEX_OPTIONS !== 'undefined') ? SEX_OPTIONS
    : [{ value: '', label: 'Unspecified' }, { value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }];

  const QUERY_DEFS = [
    { key: 'fullName',    label: 'Name',        type: 'text', dir: true,
      placeholder: 'As you hold it' },
    { key: 'dob',         label: 'Born',        type: 'date' },
    { key: 'sex',         label: 'Sex',         type: 'select', options: SEXES },
    // A free country code rather than a fixed list: a watchlist is global, so the
    // query must be able to carry any nationality, not just the compare tool's set.
    { key: 'nationality', label: 'Nationality', type: 'text', upper: true,
      placeholder: 'ISO code, e.g. SY' },
  ];

  function buildQueryFields() {
    const host = $('#query-fields');
    host.innerHTML = '';
    QUERY_DEFS.forEach((def) => {
      const id = 'q-' + def.key;
      const wrap = el('div', 'field');
      const label = el('label', 'field-label', def.label);
      label.setAttribute('for', id);
      wrap.appendChild(label);

      let input;
      if (def.type === 'select') {
        input = document.createElement('select');
        def.options.forEach((o) => {
          const opt = document.createElement('option');
          opt.value = o.value; opt.textContent = o.label;
          input.appendChild(opt);
        });
      } else {
        input = document.createElement('input');
        input.type = def.type;
        if (def.placeholder) input.placeholder = def.placeholder;
        if (def.dir) input.dir = 'auto';
      }
      input.id = id;
      input.name = id;
      wrap.appendChild(input);
      host.appendChild(wrap);
    });
  }

  function readQuery() {
    const q = {};
    QUERY_DEFS.forEach((def) => {
      let v = ($('#q-' + def.key).value || '').trim();
      if (def.upper) v = v.toUpperCase();
      q[def.key] = v;
    });
    return q;
  }
  function writeQuery(q) {
    QUERY_DEFS.forEach((def) => { $('#q-' + def.key).value = q[def.key] != null ? q[def.key] : ''; });
  }

  /* ── Sample scenarios ────────────────────────────────────────────────── */

  const SCENARIOS = {
    clearhit: {
      label: 'Clear hit',
      blurb: 'The same person on two lists — a detailed listing (strong) and a name-only one (potential).',
      q: { fullName: 'Mohammad Abdullah Al-Farsi', dob: '1975-06-20', sex: 'M', nationality: 'SY' },
    },
    alias: {
      label: 'Alias hit',
      blurb: 'Matches a recorded alias, not the primary name.',
      q: { fullName: 'Karim Shadid', nationality: 'RU' },
    },
    discounted: {
      label: 'False positive',
      blurb: 'Name matches, but the date of birth conflicts — discounted.',
      q: { fullName: 'Fatima Ali Al-Masri', dob: '1999-01-01', sex: 'F', nationality: 'EG' },
    },
    nodiscount: {
      label: 'Cannot discount',
      blurb: 'The entry carries no date of birth — nothing to discount on.',
      q: { fullName: 'Ahmad Nasser Al-Qasim', dob: '2000-01-01', sex: 'M', nationality: 'SY' },
    },
    pep: {
      label: 'PEP',
      blurb: 'A politically exposed person — heightened due diligence, not a block.',
      q: { fullName: 'Abdulrahman Kamal Al-Wazir', dob: '1963-05-05', sex: 'M', nationality: 'JO' },
    },
    clear: {
      label: 'Cleared',
      blurb: 'Nobody scores above the threshold — cleared.',
      q: { fullName: 'Jonathan Smith', dob: '1990-05-05', sex: 'M', nationality: 'GB' },
    },
  };

  function buildScenarioButtons() {
    const host = $('#scenario-buttons');
    host.innerHTML = '';
    Object.keys(SCENARIOS).forEach((key) => {
      const btn = el('button', null, SCENARIOS[key].label);
      btn.type = 'button';
      btn.dataset.scenario = key;
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', () => loadScenario(key));
      host.appendChild(btn);
    });
  }

  function loadScenario(key) {
    const s = SCENARIOS[key];
    if (!s) return;
    writeQuery(s.q);
    $$('#scenario-buttons button').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.scenario === key)));
    $('#scenario-blurb').textContent = s.blurb;
    runScreen();
  }

  function clearScreen() {
    writeQuery({});
    $$('#scenario-buttons button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    $('#scenario-blurb').textContent = '';
    lastResult = null;
    $('#screen-results').hidden = true;
  }

  /* ── Threshold ───────────────────────────────────────────────────────── */

  function readHit() { return Number($('#th-hit').value); }
  function syncHit() { $('#th-hit-out').textContent = $('#th-hit').value; }
  function resetHit() { $('#th-hit').value = DEFAULT_HIT; syncHit(); }

  /* ── Run ─────────────────────────────────────────────────────────────── */

  function doScreen(scroll) {
    const q = readQuery();
    if (!q.fullName) {
      $('#scenario-blurb').textContent = 'Enter a name to screen, or load a scenario above.';
      return;
    }
    lastResult = KYC.screen(q, INDEX, { thresholds: { hit: readHit() }, countryRisk: RISK });
    renderResults(lastResult);
    $('#note-text').value = KYC.screeningNote(lastResult);
    $('#copy-status').textContent = '';
    if (scroll) $('#screen-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function runScreen() { doScreen(true); }

  // Moving the threshold re-screens in place, so the shown result is never stale
  // against the slider (no scroll, so dragging does not yank the page around).
  function rescreenOnThreshold() {
    syncHit();
    if (lastResult) doScreen(false);
  }

  /* ── Render ──────────────────────────────────────────────────────────── */

  const BADGE = { STRONG: 'Strong match', POTENTIAL: 'Potential', DISCOUNTED: 'Discounted' };
  const BADGE_CLASS = { STRONG: 'strong', POTENTIAL: 'potential', DISCOUNTED: 'discounted' };

  function tokenCell(text, skeleton) {
    const cell = el('span', 'tok');
    cell.appendChild(bdi(text || '—'));
    if (skeleton) cell.appendChild(el('i', null, skeleton));
    return cell;
  }

  function renderResults(res) {
    const outer = $('#screen-results');
    outer.innerHTML = '';
    outer.hidden = false;

    const cleared = res.disposition === 'NO_MATCH';
    const card = el('div', 'result ' + (cleared ? 'cleared' : 'flagged'));
    outer.appendChild(card);

    const hero = el('div', 'result-hero');
    hero.appendChild(el('div', 'disposition-word',
      cleared ? 'No match — cleared' : 'Potential match'));
    hero.appendChild(el('div', 'screen-counts',
      res.screened + ' screened · ' + res.candidates + ' scored'));
    hero.appendChild(el('p', 'result-reason', res.dispositionReason));

    if (res.countryRisk) {
      const cr = el('p', 'country-risk risk-' + res.countryRisk.level);
      cr.dir = 'ltr';
      cr.appendChild(ruleTag('CRISK-1'));
      cr.appendChild(document.createTextNode(
        'Country risk: ' + res.countryRisk.country + ' is rated ' + res.countryRisk.level +
        (res.countryRisk.sources.length ? ' (' + res.countryRisk.sources.join('; ') + ')' : '') + '.'));
      hero.appendChild(cr);
    }

    const acts = el('div', 'result-actions');
    const noteBtn = el('button', 'btn btn-small', 'Screening note');
    noteBtn.type = 'button';
    noteBtn.addEventListener('click', () => UI.openSheet('sheet-note'));
    acts.appendChild(noteBtn);
    hero.appendChild(acts);
    card.appendChild(hero);

    if (res.hits.length) {
      const group = el('div', 'group');
      const head = el('div', 'group-head');
      head.appendChild(el('h3', null, res.hits.length === 1 ? '1 hit' : res.hits.length + ' hits'));
      group.appendChild(head);
      res.hits.forEach((h) => group.appendChild(renderHit(h, res.query.fullName)));
      card.appendChild(group);
    }

    card.appendChild(el('p', 'repro',
      `Engine ${res.engineVersion} · surfaced at ≥ ${res.thresholds.hit} · ${res.evaluatedOn}`));
  }

  const TYPE_LABEL = { sanction: 'Sanctions listing', pep: 'Politically exposed person' };

  function renderHit(h, queryName) {
    const item = el('div', 'item hit ' + BADGE_CLASS[h.classification]);

    // Headline: WHO was found — the listed entity — and the badge/score.
    const top = el('div', 'item-top');
    const listed = el('div', 'hit-listed');
    listed.appendChild(el('span', 'hit-listed-label', 'Listed'));
    const nm = bdi(h.primaryName || h.matchedName);
    nm.className = 'hit-listed-name';
    listed.appendChild(nm);
    top.appendChild(listed);

    const meta = el('div', 'item-meta');
    if (h.listType === 'pep') meta.appendChild(el('span', 'pep-tag', 'PEP'));
    meta.appendChild(el('span', 'hit-badge ' + BADGE_CLASS[h.classification], BADGE[h.classification]));
    meta.appendChild(el('span', 'score-cell', String(h.nameScore)));
    top.appendChild(meta);
    item.appendChild(top);

    // WHAT LIST it is on.
    const on = el('p', 'hit-on');
    on.appendChild(el('strong', null, TYPE_LABEL[h.listType] || h.listType));
    on.appendChild(document.createTextNode(
      ' · ' + [h.source, h.program].filter(Boolean).join(' · ')));
    item.appendChild(on);

    // WHY it is a hit: the name match (against the query, noting an alias), then
    // the secondary identifiers. LTR so a leading Arabic token cannot flip it.
    const nameLine = el('p', 'item-reason');
    nameLine.dir = 'ltr';
    nameLine.appendChild(ruleTag('SCR-1'));
    if (h.viaAlias) nameLine.appendChild(ruleTag('SCR-5'));
    let why = 'The name matches your query “' + (queryName || '') + '” at ' + h.nameScore +
              ' / 100';
    if (h.viaAlias) why += ', via the listed alias “' + h.matchedName + '”';
    why += '.';
    nameLine.appendChild(document.createTextNode(why));
    item.appendChild(nameLine);

    const secLine = el('p', 'item-reason');
    secLine.dir = 'ltr';
    const secRule = h.classification === 'DISCOUNTED' ? 'SCR-3'
                  : h.classification === 'STRONG' ? 'SCR-2' : null;
    if (secRule) secLine.appendChild(ruleTag(secRule));
    if (h.listType === 'pep') secLine.appendChild(ruleTag('SCR-6'));
    if (h.secondary.length) {
      const agree = h.secondary.filter((s) => s.status === 'corroborate')
        .map((s) => s.field.toLowerCase());
      const clash = h.secondary.filter((s) => s.status === 'conflict');
      const bits = [];
      if (agree.length) bits.push(agree.join(', ') + ' agree' + (agree.length === 1 ? 's' : ''));
      clash.forEach((s) => bits.push(s.field.toLowerCase() + ' conflicts (you have ' +
        (s.query || '—') + ', the list has ' + (s.entry || '—') + ')'));
      // Just the facts — the badge already says Strong / Discounted / PEP, so no
      // editorial tail on top of it. The conflicting values are the "why".
      let sentence = bits.join('; ') + '.';
      secLine.appendChild(document.createTextNode(sentence.charAt(0).toUpperCase() + sentence.slice(1)));
    } else {
      secLine.appendChild(document.createTextNode(
        'No date of birth, sex or nationality on both sides to corroborate or discount.'));
    }
    item.appendChild(secLine);

    // The name breakdown, one press away — same rule-cited detail as the compare tool.
    if (h.pairs && h.pairs.length) {
      const det = el('details', 'hit-breakdown');
      const sum = document.createElement('summary');
      sum.textContent = 'Why the name matched, token by token';
      det.appendChild(sum);
      h.pairs.forEach((p) => {
        const row = el('div', 'item');
        const rtop = el('div', 'item-top');
        const rt = el('div', 'pair-tokens');
        rt.appendChild(tokenCell(p.a, p.aSkeleton));
        rt.appendChild(el('span', 'arrow', '→'));
        rt.appendChild(tokenCell(p.b, p.bSkeleton));
        rtop.appendChild(rt);
        const rm = el('div', 'item-meta');
        rm.appendChild(el('span', 'score-cell', p.score == null ? '—' : String(p.score)));
        rtop.appendChild(rm);
        row.appendChild(rtop);
        const rr = el('p', 'item-reason');
        rr.dir = 'ltr';
        (p.rules || []).forEach((id) => rr.appendChild(ruleTag(id)));
        rr.appendChild(document.createTextNode(p.reason));
        row.appendChild(rr);
        det.appendChild(row);
      });
      item.appendChild(det);
    }
    return item;
  }

  /* ── Note actions ────────────────────────────────────────────────────── */

  function copyNote() {
    const ta = $('#note-text');
    navigator.clipboard.writeText(ta.value).then(
      () => { $('#copy-status').textContent = 'Copied.'; },
      () => { ta.select(); $('#copy-status').textContent = 'Select and copy (Ctrl+C).'; });
  }
  function downloadNote() {
    if (!lastResult) return;
    const disp = lastResult.disposition === 'NO_MATCH' ? 'cleared' : 'potential-match';
    UI.downloadText(`screening-${disp}-${lastResult.evaluatedOn}.txt`, $('#note-text').value);
    $('#copy-status').textContent = 'Downloaded.';
  }

  /* ── The loaded list, for the "View list" sheet ──────────────────────── */

  function renderListSheet() {
    const host = $('#list-body');
    if (!host) return;
    const sanctions = LIST.filter((e) => (e.type || 'sanction') !== 'pep').length;
    const peps = LIST.length - sanctions;
    const intro = el('div', 'method-prose');
    intro.appendChild(el('p', null,
      (IS_SAMPLE ? 'Synthetic sample list — every entry is invented and names no real person. '
                 : '') +
      LIST.length + ' entries (' + sanctions + ' sanctions, ' + peps + ' PEP).'));
    host.appendChild(intro);

    const table = el('table', 'rules');
    table.innerHTML = '<thead><tr><th>Name</th><th>Type</th><th>Source</th><th>DOB</th></tr></thead>';
    const tb = document.createElement('tbody');
    LIST.forEach((e) => {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.appendChild(bdi(e.name));
      if (e.aliases && e.aliases.length) {
        const a = el('span', 'muted-sm', '  aka ' + e.aliases.join(', '));
        a.dir = 'ltr'; td.appendChild(a);
      }
      tr.appendChild(td);
      tr.appendChild(el('td', null, (e.type || 'sanction')));
      tr.appendChild(el('td', null, e.source || ''));
      tr.appendChild(el('td', null, e.dob || '—'));
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    host.appendChild(table);
  }

  /* ── Init ────────────────────────────────────────────────────────────── */

  function init() {
    buildQueryFields();
    buildScenarioButtons();
    resetHit();
    UI.renderMethod();
    renderListSheet();
    UI.wireSheets();
    UI.wireRulePop();

    const sanctions = LIST.filter((e) => (e.type || 'sanction') !== 'pep').length;
    $('#list-summary').textContent =
      'against ' + LIST.length.toLocaleString() + ' entries (' + sanctions.toLocaleString() +
      ' sanctions, ' + (LIST.length - sanctions).toLocaleString() + ' PEP)';
    $('#data-pill').textContent = IS_SAMPLE
      ? 'Synthetic sample list'
      : 'Live lists' + (META && META.generatedOn ? ' · ' + META.generatedOn : '');

    // The sample scenarios are written against the synthetic list; on a live
    // build they would mostly just clear, so hide them.
    if (!IS_SAMPLE) {
      $('#scenario-buttons').hidden = true;
      $('#scenario-blurb').hidden = true;
    }

    $('#screen-form').addEventListener('submit', (e) => { e.preventDefault(); runScreen(); });
    $('#clear-screen').addEventListener('click', clearScreen);
    $('#copy-note').addEventListener('click', copyNote);
    $('#download-note').addEventListener('click', downloadNote);
    $('#th-hit').addEventListener('input', rescreenOnThreshold);
    $('#th-reset').addEventListener('click', resetHit);

    $('#engine-version-footer').textContent = 'Engine ' + KYC.VERSION;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
