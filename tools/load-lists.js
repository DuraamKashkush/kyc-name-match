/*
 * tools/load-lists.js — build lists/live.js from real, public watchlists.
 *
 *   node tools/load-lists.js            # sanctions only (default)
 *   node tools/load-lists.js --peps     # also load PEPs (large; CC-BY-NC)
 *   node tools/load-lists.js --from foo.csv   # parse a local CSV instead of fetching
 *
 * Writes lists/live.js, which screening.html loads if present (else it falls
 * back to the synthetic sample). lists/live.js is git-ignored, so real lists are
 * never published by accident — to put them on the public site you force-add it
 * deliberately:  git add -f lists/live.js
 *
 * Source: OpenSanctions (data.opensanctions.org), which aggregates OFAC, UN, EU,
 * UK and more into one normalised schema, plus PEP data from public registers.
 * Licence CC-BY-NC 4.0 — free for personal/non-commercial use with attribution;
 * commercial/production use needs their licence. See SOURCES.md. The query you
 * screen is never sent anywhere; this script only downloads the public lists.
 *
 * No dependencies — Node 18+ (built-in fetch) and the standard library only.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ARGS = process.argv.slice(2);
const WANT_PEPS = ARGS.includes('--peps');
const FROM = (function () { const i = ARGS.indexOf('--from'); return i >= 0 ? ARGS[i + 1] : null; })();

// OpenSanctions "simple" CSV exports — one row per target, normalised columns.
const SRC = {
  sanctions: 'https://data.opensanctions.org/datasets/latest/sanctions/targets.simple.csv',
  peps:      'https://data.opensanctions.org/datasets/latest/peps/targets.simple.csv',
};

/* Minimal RFC-4180 CSV parser: handles quoted fields, embedded commas, quotes
 * and newlines. Returns an array of row-objects keyed by the header row. */
function parseCsv(text) {
  const rows = [];
  let field = '', row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift() || [];
  return rows.map(function (r) {
    const o = {};
    header.forEach(function (h, i) { o[h] = r[i] != null ? r[i] : ''; });
    return o;
  });
}

// OpenSanctions multi-valued fields are ';'-separated.
function multi(v) {
  return String(v || '').split(';').map(function (s) { return s.trim(); }).filter(Boolean);
}
function fullIsoDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '').trim()) ? v.trim() : '';
}

/* Map an OpenSanctions simple row → this tool's entry shape. Only Person rows
 * carry the name/DOB/nationality we screen on. */
function toEntry(row, type) {
  if (row.schema && row.schema !== 'Person') return null;
  const name = (row.name || '').trim();
  if (!name) return null;
  const aliases = multi(row.aliases).filter(function (a) { return a !== name; });
  const countries = multi(row.countries);
  return {
    id: row.id || '',
    source: 'OpenSanctions',
    type: type,
    program: multi(row.sanctions)[0] || row.dataset || '',
    name: name,
    aliases: aliases.slice(0, 12),                 // cap alias sprawl
    dob: fullIsoDate((multi(row.birth_date)[0] || '')),
    sex: '',                                        // not in the simple export
    nationality: (countries[0] || '').toUpperCase(),
  };
}

async function loadCsv(label, url) {
  if (FROM) {
    console.log('· reading ' + label + ' from ' + FROM);
    return parseCsv(fs.readFileSync(FROM, 'utf8'));
  }
  console.log('· downloading ' + label + ' …');
  const res = await fetch(url, { headers: { 'user-agent': 'kyc-name-match/loader' } });
  if (!res.ok) throw new Error(label + ': HTTP ' + res.status);
  return parseCsv(await res.text());
}

/* Country risk — a maintained table from published lists. These change a few
 * times a year at FATF plenaries and in EU delegated regulations; update the
 * codes here from the sources in SOURCES.md when they do. Values below are
 * illustrative placeholders, NOT a current legal list — replace before real use. */
const COUNTRY_RISK = {
  // FATF "black list" (call for action) — highest.
  KP: { level: 'high', sources: ['FATF call for action'] },
  IR: { level: 'high', sources: ['FATF call for action'] },
  MM: { level: 'high', sources: ['FATF call for action'] },
  // A few FATF "grey list" (increased monitoring) examples.
  SY: { level: 'high',   sources: ['FATF increased monitoring'] },
  YE: { level: 'high',   sources: ['FATF increased monitoring'] },
  // EU high-risk third countries (illustrative subset).
  IQ: { level: 'medium', sources: ['EU high-risk third countries'] },
  LB: { level: 'medium', sources: ['EU high-risk third countries'] },
};

async function main() {
  const entries = [];
  const seen = {};

  const sanc = await loadCsv('sanctions', SRC.sanctions);
  sanc.forEach(function (r) {
    const e = toEntry(r, 'sanction');
    if (e && !seen[e.id]) { seen[e.id] = true; entries.push(e); }
  });

  if (WANT_PEPS) {
    const peps = await loadCsv('peps', SRC.peps);
    peps.forEach(function (r) {
      const e = toEntry(r, 'pep');
      if (e && !seen[e.id]) { seen[e.id] = true; entries.push(e); }
    });
  }

  const meta = {
    generatedOn: new Date().toISOString().slice(0, 10),
    counts: {
      total: entries.length,
      sanction: entries.filter(function (e) { return e.type === 'sanction'; }).length,
      pep: entries.filter(function (e) { return e.type === 'pep'; }).length,
    },
    sources: ['OpenSanctions (CC-BY-NC)', 'Country risk: FATF / EU (maintained)'],
  };

  const banner =
    '/* GENERATED by tools/load-lists.js on ' + meta.generatedOn + ' — do not edit by hand.\n' +
    ' * Real public list data (OpenSanctions, CC-BY-NC — attribution in SOURCES.md).\n' +
    ' * Git-ignored by default; force-add to publish on the site. The query you\n' +
    ' * screen is never in here and never leaves the browser. */\n';

  const body =
    banner +
    'window.LIVE_WATCHLIST = ' + JSON.stringify(entries) + ';\n' +
    'window.LIVE_COUNTRY_RISK = ' + JSON.stringify(COUNTRY_RISK) + ';\n' +
    'window.LIVE_META = ' + JSON.stringify(meta) + ';\n';

  const out = path.join(__dirname, '..', 'lists', 'live.js');
  fs.writeFileSync(out, body);
  console.log('\n✓ wrote ' + out);
  console.log('  ' + meta.counts.total + ' entries (' + meta.counts.sanction + ' sanctions, ' +
              meta.counts.pep + ' PEP), generated ' + meta.generatedOn);
  console.log('\nRun the screening page locally to use it. To publish it on the site:');
  console.log('  git add -f lists/live.js && git commit && git push');
  console.log('Check the OpenSanctions licence (CC-BY-NC) covers your use first — SOURCES.md.');
}

main().catch(function (e) { console.error('\n✗ ' + e.message); process.exit(1); });
