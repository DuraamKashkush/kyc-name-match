# Data sources

The **compare** tool and the **screening** page's default sample list are
entirely synthetic — invented names, no real people. The screening page can also
run against **real, public reference data**, produced locally by
`tools/load-lists.js` into `lists/live.js` (git-ignored; force-add to publish).

This file records where that real data comes from and the terms of use. **You are
responsible for confirming each licence covers your use** before relying on it —
especially the non-commercial restriction below.

## What never leaves your browser

No source here receives the name you screen. The lists are downloaded once by the
loader; screening then runs entirely client-side against the loaded copy. There
is no screening API call, no analytics, no telemetry. Hosting the page publishes
the tool, never the query.

## Sanctions and PEPs — OpenSanctions

- **Source:** OpenSanctions — <https://www.opensanctions.org> /
  <https://data.opensanctions.org>
- **What it is:** an open dataset aggregating the major sanctions lists (OFAC SDN,
  UN Consolidated, EU, UK OFSI and more) into one normalised schema, plus
  politically-exposed-person (PEP) data assembled from public registers.
- **Licence:** **CC-BY-NC 4.0.** Free for **personal and non-commercial** use with
  attribution. **Commercial or production use requires a licence from
  OpenSanctions.** A personal secondary-check tool is non-commercial; using it in
  the course of paid work is not — get their licence for that.
- **Attribution:** "Contains information from OpenSanctions
  (opensanctions.org), licensed under CC-BY-NC 4.0."

The underlying official lists are public and, taken directly, carry no
non-commercial restriction, if you need to avoid the CC-BY-NC term:

- **OFAC SDN** (US Treasury) — public domain. <https://sanctionslist.ofac.treas.gov>
- **UN Consolidated List** — free to use. <https://www.un.org/securitycouncil/content/un-sc-consolidated-list>
- **UK OFSI Consolidated List** — Open Government Licence. <https://www.gov.uk/government/publications/financial-sanctions-consolidated-list-of-targets>
- **EU Consolidated List** — EU open data. <https://data.europa.eu>

## Country risk

A small maintained table in `tools/load-lists.js`, seeded from published lists.
**The values shipped are illustrative placeholders, not a current legal list** —
replace them from the sources below before real use, and refresh when they change
(a few times a year):

- **FATF** high-risk ("call for action") and increased-monitoring ("grey") lists —
  <https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions.html>
- **EU high-risk third countries** —
  <https://finance.ec.europa.eu/financial-crime/high-risk-third-countries-and-international-context_en>
- **Basel AML Index** (Basel Institute on Governance) — free for non-commercial use
  with attribution — <https://index.baselgovernance.org>

## Document / ID reference

- **ICAO Doc 9303** — machine-readable travel document standard (MRZ, check
  digits). Public standard.
- National identity-number check-digit schemes — published national standards.

## Not a system of record

This is a personal aid and secondary check. Real screening decisions belong in
your firm's approved, governed system, which is what a regulator holds the firm
to. Nothing here is validated for that purpose.
