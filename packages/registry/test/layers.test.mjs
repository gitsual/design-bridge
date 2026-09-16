import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLayers, transitiveDependencies, usageCounts, toBatches } from '../src/layers.mjs';

const components = [
  { id: 'icon' },
  { id: 'button', dependsOn: ['icon'] },
  { id: 'input', dependsOn: ['icon'] },
  { id: 'field', dependsOn: ['input'] },
  { id: 'form', dependsOn: ['field', 'button'] },
];

test('atoms sit at layer 0', () => {
  const { layers } = computeLayers(components);
  assert.equal(layers.get('icon'), 0);
});

test('a component sits one layer above its deepest dependency', () => {
  const { layers } = computeLayers(components);
  assert.equal(layers.get('button'), 1);
  assert.equal(layers.get('field'), 2);
  assert.equal(layers.get('form'), 3, 'form must clear field (2), not just button (1)');
});

test('no cycles are reported for an acyclic graph', () => {
  assert.deepEqual(computeLayers(components).cycles, []);
});

test('a cycle is reported instead of hanging', () => {
  const cyclic = [{ id: 'a', dependsOn: ['b'] }, { id: 'b', dependsOn: ['a'] }];
  const { cycles } = computeLayers(cyclic);
  assert.equal(cycles.length > 0, true);
  assert.ok(cycles[0].length >= 2);
});

test('unknown dependencies are ignored rather than fatal', () => {
  const { layers } = computeLayers([{ id: 'a', dependsOn: ['nope'] }]);
  assert.equal(layers.get('a'), 0);
});

test('transitiveDependencies walks the whole closure', () => {
  assert.deepEqual(transitiveDependencies(components, 'form').sort(), ['button', 'field', 'icon', 'input']);
  assert.deepEqual(transitiveDependencies(components, 'icon'), []);
});

test('usageCounts finds the most reused component', () => {
  const counts = usageCounts(components);
  assert.equal(counts.get('icon'), 2);
  assert.equal(counts.get('form'), 0);
});

test('toBatches orders batches by layer', () => {
  const { batches } = toBatches(components);
  assert.deepEqual(batches.map((b) => b.layer), [0, 1, 2, 3]);
  assert.deepEqual(batches[0].components.map((c) => c.id), ['icon']);
  assert.deepEqual(batches[1].components.map((c) => c.id), ['button', 'input']);
});
