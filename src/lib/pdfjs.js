import * as pdfjsLib from "pdfjs-dist";

// Point pdf.js at the worker file copied into /public (see
// scripts/copy-pdf-worker.mjs). Must be set before calling getDocument().
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export default pdfjsLib;
