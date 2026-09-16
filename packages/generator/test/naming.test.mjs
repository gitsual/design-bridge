import test from 'node:test';
import assert from 'node:assert/strict';
import { slug, exportName, storyTitle } from '../src/naming.mjs';

test('slug folds accents and punctuation', () => {
  assert.equal(slug('Botón Primario'), 'boton-primario');
  assert.equal(slug('Data / Grid'), 'data-grid');
});

test('exportName produces a valid identifier from a designer label', () => {
  assert.equal(exportName('Primary / large'), 'PrimaryLarge');
  assert.equal(exportName('État actif'), 'EtatActif');
});

test('exportName prefixes labels starting with a digit', () => {
  assert.equal(exportName('2 lines'), 'Variant2Lines');
  assert.match(exportName('2 lines'), /^[A-Za-z_$]/);
});

test('exportName never returns an empty identifier', () => {
  assert.equal(exportName('---'), 'Variant');
  assert.equal(exportName(''), 'Variant');
});

test('storyTitle matches the Figma page path', () => {
  assert.equal(storyTitle('acme', { family: 'atoms', name: 'Button' }), 'acme/atoms/Button');
});
