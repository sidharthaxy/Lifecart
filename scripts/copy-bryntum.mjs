// Copies Bryntum Calendar's prebuilt browser files into public/vendor/bryntum so the app loads them at runtime.
// Why: the trial build is a 5 MB obfuscated bundle; letting Turbopack parse it made `next dev` grow past 30 GB of
// memory. Served as static files, the bundler never sees it. Runs automatically before `dev` and `build`.
import { cpSync, existsSync, mkdirSync } from "node:fs";

const src = "node_modules/@bryntum/calendar";
const out = "public/vendor/bryntum";
if (!existsSync(`${src}/calendar.module.js`)) {
  console.warn("[bryntum] @bryntum/calendar not installed; the money calendar will be unavailable");
  process.exit(0);
}
mkdirSync(out, { recursive: true });
for (const f of ["calendar.module.js", "calendar.css", "svalbard-light.css"]) cpSync(`${src}/${f}`, `${out}/${f}`);
for (const d of ["fontawesome/css", "fontawesome/webfonts"]) cpSync(`${src}/${d}`, `${out}/${d}`, { recursive: true });
console.log("[bryntum] copied calendar files to", out);
