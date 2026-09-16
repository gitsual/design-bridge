/**
 * Contract test between the example components and the built tokens.
 *
 * A misspelled custom property fails silently: the browser drops the
 * declaration and the component renders with an inherited or default value.
 * Nothing throws, no build breaks, and the bug reaches review looking like a
 * design decision. This test is the only thing standing between that and main.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN_PATTERN = /--ds-[a-z0-9-]+/g;

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function filesIn(relative, extension) {
  const dir = path.join(root, relative);
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(extension))
    .map((name) => path.join(relative, name));
}

/** Custom properties DECLARED by the built stylesheet (`--x:` on the left). */
function declaredTokens(css) {
  const declared = new Set();
  for (const line of css.split('\n')) {
    const match = /^\s*(--ds-[a-z0-9-]+)\s*:/.exec(line);
    if (match) declared.add(match[1]);
  }
  return declared;
}

/** Custom properties REFERENCED by a component (`var(--x)`). */
function referencedTokens(source) {
  const referenced = new Set();
  for (const match of source.matchAll(/var\((--ds-[a-z0-9-]+)/g)) {
    referenced.add(match[1]);
  }
  return referenced;
}

const css = read('examples/shared/dist/tokens.css');
const declared = declaredTokens(css);

const componentFiles = [
  ...filesIn('examples/vue-lib/src/lib', '.vue'),
  ...filesIn('examples/angular-lib/src/lib', '.ts'),
];

test('the built stylesheet declares tokens at all', () => {
  assert.ok(declared.size > 10, `expected many tokens, found ${declared.size}`);
});

test('every token a component references is declared', () => {
  const missing = [];
  for (const file of componentFiles) {
    for (const token of referencedTokens(read(file))) {
      if (!declared.has(token)) missing.push(`${file}: ${token}`);
    }
  }
  assert.deepEqual(missing, [], `undeclared tokens:\n${missing.join('\n')}`);
});

test('Vue and Angular examples consume the SAME token set', () => {
  const collect = (files) => {
    const all = new Set();
    for (const file of files) for (const token of referencedTokens(read(file))) all.add(token);
    return [...all].sort();
  };
  const vue = collect(filesIn('examples/vue-lib/src/lib', '.vue'));
  const angular = collect(filesIn('examples/angular-lib/src/lib', '.ts'));
  assert.deepEqual(angular, vue, 'the two frameworks must prove the same tokens drive both');
});

test('components declare no hard-coded hex colours', () => {
  // A literal colour is a token that escaped the system: changing the Figma
  // variable will never reach it.
  const offenders = [];
  for (const file of componentFiles) {
    const source = read(file).replace(/^[\s\S]*?<template>/, ''); // icon paths are not colours
    for (const match of source.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      offenders.push(`${file}: ${match[0]}`);
    }
  }
  assert.deepEqual(offenders, [], `hard-coded colours:\n${offenders.join('\n')}`);
});

test('both example registries name every component file that exists', () => {
  for (const [registryPath, libDir, extension] of [
    ['examples/vue-lib/registry.json', 'examples/vue-lib/src/lib', '.vue'],
    ['examples/angular-lib/registry.json', 'examples/angular-lib/src/lib', '.ts'],
  ]) {
    const registry = JSON.parse(read(registryPath));
    assert.equal(
      registry.components.length,
      filesIn(libDir, extension).length,
      `${registryPath} must describe every component in ${libDir}`,
    );
  }
});
