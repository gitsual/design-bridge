#!/usr/bin/env node
/**
 * Render captured terminal output as a self-contained SVG.
 *
 * Why SVG rather than a PNG screenshot: it stays sharp at any zoom, the text is
 * selectable and searchable, it survives dark and light READMEs, and it weighs
 * a few kilobytes instead of a few hundred. It is also reproducible — the image
 * is generated from the real command output, so it cannot drift into showing
 * something the tool no longer does.
 *
 *   node scripts/terminal-svg.mjs <title> <out.svg> < captured-output.txt
 */

import fs from 'node:fs';

const [title, outPath] = process.argv.slice(2);
if (!title || !outPath) {
  console.error('usage: terminal-svg.mjs <title> <out.svg> < input');
  process.exit(1);
}

const CHAR_WIDTH = 8.4;
const LINE_HEIGHT = 20;
const PAD_X = 20;
const PAD_TOP = 52;
const PAD_BOTTOM = 18;

// One palette, defined once, used by both themes via CSS custom properties.
const THEME = {
  bg: '#11141b', chrome: '#1b1f2a', border: '#2a303d',
  text: '#d6dae4', dim: '#79839a', accent: '#7aa2f7',
  green: '#9ece6a', yellow: '#e0af68', magenta: '#bb9af7', red: '#f7768e',
};

/** Strip ANSI escapes; we re-colour semantically instead of replaying codes. */
function clean(line) {
  return line.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '');
}

function escapeXml(text) {
  return text.replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]
  ));
}

/**
 * Colour a line by what it means, not by what escape code it carried.
 * Keeps the images consistent even when a tool changes its own colours.
 */
function colourFor(line) {
  if (/^\s*\$/.test(line)) return THEME.accent;
  if (/^(ℹ\s*)?(pass|✔|✓)/i.test(line.trim()) || /\bpass\b\s+\d+/.test(line)) return THEME.green;
  if (/\bfail\b\s*[1-9]|✖|error/i.test(line)) return THEME.red;
  if (/^\s*(warning|warn)/i.test(line)) return THEME.yellow;
  if (/^\s*(--|L\d|\w+\.(css|scss|ts|json|mjs))/.test(line.trim())) return THEME.magenta;
  if (/^\s*#|^\s*\/\//.test(line)) return THEME.dim;
  return THEME.text;
}

const lines = fs.readFileSync(0, 'utf8').split('\n').map(clean);
while (lines.length && lines.at(-1).trim() === '') lines.pop();

const columns = Math.max(title.length + 24, ...lines.map((line) => line.length)) + 2;
const width = Math.ceil(columns * CHAR_WIDTH + PAD_X * 2);
const height = PAD_TOP + lines.length * LINE_HEIGHT + PAD_BOTTOM;

const dots = ['#f7768e', '#e0af68', '#9ece6a']
  .map((fill, i) => `<circle cx="${22 + i * 19}" cy="21" r="6" fill="${fill}" opacity=".85"/>`)
  .join('');

const body = lines
  .map((line, i) => {
    if (line.trim() === '') return '';
    const y = PAD_TOP + i * LINE_HEIGHT;
    return `<text x="${PAD_X}" y="${y}" fill="${colourFor(line)}" xml:space="preserve">${escapeXml(line)}</text>`;
  })
  .filter(Boolean)
  .join('\n    ');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">
  <title>${escapeXml(title)}</title>
  <rect width="${width}" height="${height}" rx="10" fill="${THEME.bg}" stroke="${THEME.border}"/>
  <rect width="${width}" height="42" rx="10" fill="${THEME.chrome}"/>
  <rect y="32" width="${width}" height="10" fill="${THEME.chrome}"/>
  <line x1="0" y1="42" x2="${width}" y2="42" stroke="${THEME.border}"/>
  ${dots}
  <text x="${width / 2}" y="26" fill="${THEME.dim}" text-anchor="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12">${escapeXml(title)}</text>
  <g font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="13">
    ${body}
  </g>
</svg>
`;

fs.writeFileSync(outPath, svg);
console.log(`${outPath}  (${columns} cols x ${lines.length} rows, ${(svg.length / 1024).toFixed(1)} KB)`);
