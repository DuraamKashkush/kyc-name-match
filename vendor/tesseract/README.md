# Vendored: Tesseract.js

Third-party files, committed **unmodified**. Nothing in this directory is my work.

| File | Source | Version |
|---|---|---|
| `tesseract.min.js` | [tesseract.js](https://github.com/naptha/tesseract.js) | 5.1.1 |
| `worker.min.js` | tesseract.js | 5.1.1 |
| `tesseract-core-simd.wasm` | tesseract.js-core | 5.x |
| `tesseract-core.wasm` | tesseract.js-core | 5.x |
| `eng.traineddata.gz` | [tessdata](https://github.com/tesseract-ocr/tessdata) | 4.0.0 |

All of the above are **Apache-2.0**.

Both WASM cores are kept deliberately: tesseract.js picks the SIMD build where the browser
supports it and falls back to the plain one where it does not. Shipping only the SIMD build
would save 3.3 MB and break older browsers outright.

## Why these are committed rather than loaded from a CDN

The page states that nothing you type into it leaves the tab. Loading a script from a CDN
would make that untrue in spirit — the CDN sees the visitor's IP and referrer, which is a
poor look on a tool aimed at compliance teams. Serving these from the same origin keeps the
claim literally correct, and lets the whole thing work offline.

They are also **lazily loaded**: nothing here is fetched until someone actually clicks to read
a document image, so the ordinary page load is unaffected by their size.

## What they are used for

Reading a machine-readable zone off a document image, purely to pre-fill the form. The
matching engine never sees any of this — see `../../ocr.js` and the Method page. `engine.js`
has no dependencies and does not know OCR exists.
