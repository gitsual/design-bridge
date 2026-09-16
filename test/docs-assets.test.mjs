/**
 * Every image referenced from the docs must exist in the repo.
 *
 * A broken image in a README renders as a silent grey box on GitHub — no error,
 * no failed build, and it is usually the first thing a stranger sees. Renaming
 * or regenerating an asset is exactly the kind of change that breaks this and
 * that nobody notices for months.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function markdownFiles() {
  const files = ['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'ROADMAP.md', 'CHANGELOG.md'];
  const docs = fs.readdirSync(path.join(root, 'docs'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join('docs', name));
  return [...files, ...docs].filter((file) => fs.existsSync(path.join(root, file)));
}

/** Both Markdown `![](x)` and inline `<img src="x">` forms. */
function imageReferences(source) {
  const refs = [];
  for (const match of source.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) refs.push(match[1]);
  for (const match of source.matchAll(/<img[^>]+src="([^"]+)"/g)) refs.push(match[1]);
  // <picture> art direction: the dark variant lives on <source srcset>.
  for (const match of source.matchAll(/<source[^>]+srcset="([^"]+)"/g)) refs.push(match[1]);
  return refs.filter((ref) => !/^https?:/.test(ref));
}

test('every local image referenced in the docs exists', () => {
  const missing = [];
  for (const file of markdownFiles()) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const ref of imageReferences(source)) {
      const target = path.resolve(root, path.dirname(file), ref);
      if (!fs.existsSync(target)) missing.push(`${file} -> ${ref}`);
    }
  }
  assert.deepEqual(missing, [], `missing images:\n${missing.join('\n')}`);
});

/** Every file under a directory, recursively, as repo-relative posix paths. */
function assetFiles(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory()
      ? assetFiles(`${dir}/${entry.name}`)
      : [`${dir}/${entry.name}`]));
}

test('every asset in docs/assets is actually referenced', () => {
  // An orphan asset is dead weight in a repo people clone. This walks
  // subdirectories too: docs/assets/demo/ holds the step-by-step captures, and
  // a non-recursive check would only ever see the directory name and pass.
  const sources = markdownFiles().map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  const orphans = assetFiles('docs/assets')
    .filter((file) => !sources.includes(file.replace(/^docs\//, '')));
  assert.deepEqual(orphans, [], `unreferenced assets:\n${orphans.join('\n')}`);
});

test('the README carries the CI badge and the licence badge', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /actions\/workflows\/ci\.yml\/badge\.svg/);
  assert.match(readme, /License-MIT/);
});
