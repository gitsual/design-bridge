import test from 'node:test';
import assert from 'node:assert/strict';
import { walkTokens, parseAlias, resolveAliases, toKebabName, toCamelName, formatValue } from '../src/dtcg.mjs';

const tree = {
  palette: { blue: { 500: { $type: 'color', $value: '#1c4fd9' } } },
  semantic: { action: { $type: 'color', $value: '{palette.blue.500}' } },
  spacing: { md: { $type: 'number', $value: 16 } },
  typography: { 'line-height': { $type: 'number', $value: 1.5 } },
};

test('walkTokens yields every token with its path', () => {
  const paths = [...walkTokens(tree)].map(({ path }) => path.join('.'));
  assert.deepEqual(paths.sort(), [
    'palette.blue.500', 'semantic.action', 'spacing.md', 'typography.line-height',
  ]);
});

test('walkTokens ignores $-prefixed metadata keys', () => {
  const withMeta = { $description: 'group doc', a: { $type: 'color', $value: '#fff' } };
  assert.equal([...walkTokens(withMeta)].length, 1);
});

test('parseAlias recognises DTCG references only', () => {
  assert.deepEqual(parseAlias('{palette.blue.500}'), ['palette', 'blue', '500']);
  assert.equal(parseAlias('#1c4fd9'), null);
  assert.equal(parseAlias(16), null);
});

test('resolveAliases replaces references with literals', () => {
  const flat = resolveAliases(tree);
  assert.equal(flat.semantic.action.$value, '#1c4fd9');
  assert.equal(tree.semantic.action.$value, '{palette.blue.500}', 'input must not be mutated');
});

test('resolveAliases follows a chain of references', () => {
  const chained = {
    a: { $type: 'color', $value: '#abcdef' },
    b: { $type: 'color', $value: '{a}' },
    c: { $type: 'color', $value: '{b}' },
  };
  assert.equal(resolveAliases(chained).c.$value, '#abcdef');
});

test('resolveAliases fails loudly on a circular reference', () => {
  const cycle = {
    a: { $type: 'color', $value: '{b}' },
    b: { $type: 'color', $value: '{a}' },
  };
  assert.throws(() => resolveAliases(cycle), /Circular token alias/);
});

test('resolveAliases fails when an alias points at a group', () => {
  const bad = { group: { inner: { $type: 'color', $value: '#fff' } }, x: { $type: 'color', $value: '{group}' } };
  assert.throws(() => resolveAliases(bad), /is not a token/);
});

test('toKebabName and toCamelName agree on the same path', () => {
  assert.equal(toKebabName(['color', 'brandPrimary']), 'color-brand-primary');
  assert.equal(toCamelName(['color', 'brandPrimary']), 'colorBrandPrimary');
  assert.equal(toKebabName(['palette', 'blue', '500']), 'palette-blue-500');
});

test('formatValue adds px to lengths but not to ratios', () => {
  assert.equal(formatValue({ $type: 'number', $value: 16 }, ['spacing', 'md']), '16px');
  assert.equal(formatValue({ $type: 'number', $value: 1.5 }, ['typography', 'line-height']), '1.5');
  assert.equal(formatValue({ $type: 'number', $value: 700 }, ['font', 'weight']), '700');
  assert.equal(formatValue({ $type: 'number', $value: 0 }, ['spacing', 'none']), '0');
});
