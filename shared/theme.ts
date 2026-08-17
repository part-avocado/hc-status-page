// Shared txt-file-aesthetic theme for every hcdown page (website + admin).
// Page-specific CSS (e.g. form styling on /admin) is appended by that page,
// not added here.
export const BASE_CSS = `
:root {
  --bg: #f7f6f1;
  --fg: #1a1a1a;
  --dim: #767671;
  --up: #1a7f37;
  --warn: #9a6700;
  --down: #cf222e;
  --none: #c9c7bd;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111110;
    --fg: #e6e4dd;
    --dim: #8a8880;
    --up: #3fb950;
    --warn: #d29922;
    --down: #f85149;
    --none: #3a3934;
  }
}
* { box-sizing: border-box; }
body { background: var(--bg); color: var(--fg); margin: 0; padding: 2rem 1rem; }
.doc {
  font-family: ui-monospace, "SF Mono", "Cascadia Code", "Consolas", monospace;
  font-size: 14px;
  line-height: 1.6;
  max-width: 900px;
  margin: 0 auto;
}
.doc pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}
a { color: inherit; text-decoration: underline dotted; text-underline-offset: 2px; }
a:hover { text-decoration: underline solid; }
.banner { font-weight: bold; }
.banner-operational { color: var(--up); }
.banner-degraded { color: var(--warn); }
.banner-major_outage, .banner-unknown { color: var(--down); }
.group-name { font-weight: bold; }
.doc pre.group-name { margin-top: 3em; }
details.group { margin-top: 3em; }
details.group summary.group-name { margin-top: 0; cursor: pointer; }
details.group summary::-webkit-details-marker { display: none; }
details.group summary { list-style: none; }
details.group summary::before { content: "[+] "; }
details.group[open] summary::before { content: "[-] "; }
.st-up { color: var(--up); }
.st-degraded { color: var(--warn); }
.st-down { color: var(--down); }
.st-unknown { color: var(--dim); }
.hist-row { letter-spacing: 0.15em; }
.hist-up { color: var(--up); }
.hist-warn { color: var(--warn); }
.hist-down { color: var(--down); }
.hist-none { color: var(--none); }
.dim { color: var(--dim); }
.detail-table { margin-top: 1em; }
.footer { margin-top: 3em; text-align: center; }
.hday { position: relative; }
.hday .tt {
  position: absolute;
  bottom: 130%;
  left: 50%;
  transform: translateX(-50%);
  background: #1a1a1a;
  color: #f0f0f0;
  border-radius: 6px;
  padding: 5px 9px;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  text-align: center;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.1s ease;
  pointer-events: none;
  z-index: 10;
}
.hday .tt::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: #1a1a1a;
}
.hday .tt b { display: block; font-weight: bold; }
.hday:hover .tt { opacity: 1; visibility: visible; }
`.trim();
