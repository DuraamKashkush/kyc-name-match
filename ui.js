/*
 * ui.js — DOM helpers shared by the compare page (app.js) and the screening
 * page (screening.js). Extracted so the rule popover, the sheet wiring and the
 * method-page rendering exist once, not twice.
 *
 * Depends on globals loaded before it: RULES (rules.js), METHOD_PROSE
 * (method.js), EQUIVALENCE_DISPLAY (lexicon.js). Exposes window.UI.
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
     Latin around it. Without this a breakdown line scrambles. */
  function bdi(text) {
    const n = document.createElement('bdi');
    n.textContent = text;
    return n;
  }

  /* A rule id rendered as a control that explains itself when pressed. Every
     score in the tool cites a rule; this is what lets a reader find out what the
     rule says. */
  function ruleTag(id) {
    const span = el('span', 'rule-id', id);
    span.dataset.rule = id;
    span.setAttribute('role', 'button');
    span.setAttribute('tabindex', '0');
    span.setAttribute('aria-expanded', 'false');
    span.title = (typeof RULES !== 'undefined' && RULES[id]) ? RULES[id].name : id;
    span.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); span.click(); }
    });
    return span;
  }

  /* ── Rule popover ────────────────────────────────────────────────────────
   * Press any rule id and it tells you what the rule says, anchored where you
   * pressed rather than buried in a native tooltip nobody discovers. */

  let popAnchor = null;

  function hideRulePop() {
    const pop = $('#rule-pop');
    if (!pop) return;
    pop.hidden = true;
    if (popAnchor) popAnchor.setAttribute('aria-expanded', 'false');
    popAnchor = null;
  }

  function showRulePop(anchor, id) {
    const rule = (typeof RULES !== 'undefined') ? RULES[id] : null;
    const pop = $('#rule-pop');
    if (!rule || !pop) return;

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

  /* ── Sheets (dialogs) ─────────────────────────────────────────────────── */

  function openSheet(id) {
    const d = document.getElementById(id);
    if (d && typeof d.showModal === 'function') d.showModal();
  }

  function wireSheets() {
    $$('[data-open]').forEach((b) =>
      b.addEventListener('click', () => openSheet(b.dataset.open)));
    $$('dialog').forEach((d) => {
      $$('[data-close]', d).forEach((b) => b.addEventListener('click', () => d.close()));
      // Clicking the backdrop closes it. The dialog reports backdrop clicks as
      // clicks on itself, so compare against the target.
      d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    });
  }

  /* ── Method page ─────────────────────────────────────────────────────────
   * The equivalence classes and the rule table are generated from the same data
   * the engine runs on, so the page cannot drift out of date. Shared because
   * both pages carry the same "How it works" sheet. */
  function renderMethod() {
    const host = $('#method-body');
    if (!host || typeof METHOD_PROSE === 'undefined') return;
    host.innerHTML = METHOD_PROSE;

    const chips = $('#method-classes');
    if (chips && typeof EQUIVALENCE_DISPLAY !== 'undefined') {
      EQUIVALENCE_DISPLAY.forEach((c) => {
        const div = el('div', 'class-chip');
        const b = bdi(c.members);
        // <bdi> takes direction from the first strong character (Arabic), which
        // would flip the Arabic/Hebrew/Latin groups into reverse order. Forcing
        // LTR keeps the authored order while each Arabic run still renders RTL.
        b.dir = 'ltr';
        div.appendChild(b);
        div.appendChild(el('span', 'cls', 'class ' + c.cls + ' — ' + c.note));
        chips.appendChild(div);
      });
    }

    const rulesBody = $('#method-rules');
    if (rulesBody && typeof RULES !== 'undefined') {
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

  /* Save arbitrary text as a downloaded file, built and revoked in the page —
     it never leaves the browser. Used for both case notes and screening notes. */
  function downloadText(filename, text) {
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  window.UI = {
    $: $, $$: $$, el: el, bdi: bdi, ruleTag: ruleTag,
    wireRulePop: wireRulePop, openSheet: openSheet, wireSheets: wireSheets,
    renderMethod: renderMethod, downloadText: downloadText,
  };
})();
