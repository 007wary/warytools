// Copies the pdf.js worker into /public so it can be served as a static
// asset — the version here always matches the installed pdfjs-dist version.
import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const source = path.join(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const dest = path.join(root, "public/pdf.worker.min.mjs");

copyFileSync(source, dest);
console.log("Copied pdf.worker.min.mjs to public/");
