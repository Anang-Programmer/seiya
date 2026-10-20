// Copies the tesseract.js files the browser needs into public/ocr so receipt
// OCR loads from our own domain instead of cdn.jsdelivr.net, which is
// unreliable in mainland China. Runs before `next dev` and `next build`;
// public/ocr is git-ignored and rebuilt from the pinned npm packages.
import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nm = join(root, "node_modules");
const out = join(root, "public", "ocr");

const files = [
  // Worker script (loaded with importScripts inside a Web Worker).
  ["tesseract.js/dist/worker.min.js", "worker.min.js"],
  // OCR engine, LSTM-only builds; the worker picks one by CPU feature support.
  ["tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "core/tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "core/tesseract-core-simd-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-lstm.wasm.js", "core/tesseract-core-lstm.wasm.js"],
  // Language data (best_int = what LSTM-only mode downloads by default).
  ["@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "lang/eng.traineddata.gz"],
  ["@tesseract.js-data/ind/4.0.0_best_int/ind.traineddata.gz", "lang/ind.traineddata.gz"],
];

let bytes = 0;
for (const [from, to] of files) {
  const src = join(nm, from);
  const dest = join(out, to);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
  bytes += (await stat(dest)).size;
}
console.log(`[ocr] copied ${files.length} files to public/ocr (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
