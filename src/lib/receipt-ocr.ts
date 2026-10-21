"use client";

import { parseReceiptText, type ReceiptFields } from "@/lib/receipt-text";

// On-device OCR for receipt photos with tesseract.js (WebAssembly). The photo
// never leaves the browser and no AI tokens are used. The worker, engine and
// Indonesian/English language data are served from our own domain (/ocr,
// copied by scripts/build/copy-ocr-assets.mjs), not from cdn.jsdelivr.net, which is
// unreliable in mainland China. They are downloaded once and then cached.

type OcrWorker = {
  recognize: (image: Blob) => Promise<{ data: { text: string; confidence: number } }>;
};

let workerPromise: Promise<OcrWorker> | null = null;

function getWorker(): Promise<OcrWorker> {
  if (!workerPromise) {
    workerPromise = import("tesseract.js")
      .then(({ createWorker }) => {
        // Absolute URLs: the worker runs from a blob: URL, so relative paths would not resolve.
        const base = `${window.location.origin}/ocr`;
        return createWorker(["ind", "eng"], 1, {
          workerPath: `${base}/worker.min.js`,
          corePath: `${base}/core`,
          langPath: `${base}/lang`,
        }) as unknown as Promise<OcrWorker>;
      })
      .catch((error) => {
        workerPromise = null; // allow a retry later (e.g. after going back online)
        throw error;
      });
  }
  return workerPromise;
}

export interface OnDeviceReceipt {
  fields: ReceiptFields;
  confidence: number;
}

/** Reads a receipt photo on the device. Throws if OCR is unavailable. */
export async function readReceiptOnDevice(image: Blob): Promise<OnDeviceReceipt> {
  const worker = await getWorker();
  const { data } = await worker.recognize(image);
  return { fields: parseReceiptText(data.text || ""), confidence: data.confidence ?? 0 };
}
