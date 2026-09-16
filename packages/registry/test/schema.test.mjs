import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRegistry } from '../src/schema.mjs';

const valid = {
  name: 'acme',
  framework: 'vue',
  components: [
    {
      id: 'icon', name: 'Icon', family: 'atoms',
      import: { module: './icon.vue', symbol: 'default' },
      variants: [{ label: 'Default', props: { name: 'check' } }],
    },
    {
      id: 'button', name: 'Button', family: 'atoms',
      import: { module: './button.vue', symbol: 'default' },
      dependsOn: ['icon'],
      controls: [{ prop: 'variant', kind: 'select', options: ['primary', 'ghost'] }],
      variants: [{ label: 'Primary', props: { variant: 'primary' }, slot: 'Save' }],
    },
  ],
};

test('a well-formed registry validates', () => {
  assert.deepEqual(validateRegistry(valid), { valid: true, errors: [] });
});

test('framework must be angular or vue', () => {
  const { valid: ok, errors } = validateRegistry({ ...valid, framework: 'svelte' });
  assert.equal(ok, false);
  assert.match(errors.join('\n'), /registry\.framework/);
});

test('duplicate component ids are rejected', () => {
  const dup = structuredClone(valid);
  dup.components[1].id = 'icon';
  const { valid: ok, errors } = validateRegistry(dup);
  assert.equal(ok, false);
  assert.match(errors.join('\n'), /duplicate id "icon"/);
});

test('a dependency on an unknown id is rejected', () => {
  const broken = structuredClone(valid);
  broken.components[1].dependsOn = ['ghost'];
  const { valid: ok, errors } = validateRegistry(broken);
  assert.equal(ok, false);
  assert.match(errors.join('\n'), /unknown component id "ghost"/);
});

test('forward references are allowed regardless of file order', () => {
  const reordered = structuredClone(valid);
  reordered.components.reverse();
  assert.equal(validateRegistry(reordered).valid, true);
});

test('select controls require options', () => {
  const broken = structuredClone(valid);
  delete broken.components[1].controls[0].options;
  const { valid: ok, errors } = validateRegistry(broken);
  assert.equal(ok, false);
  assert.match(errors.join('\n'), /options.*is required for kind "select"/);
});

test('import module and symbol are required', () => {
  const broken = structuredClone(valid);
  delete broken.components[0].import;
  const { errors } = validateRegistry(broken);
  assert.match(errors.join('\n'), /import.*is required/);
});

test('every error is reported, not just the first', () => {
  const { errors } = validateRegistry({ name: '', framework: 'x', components: [{}] });
  assert.ok(errors.length >= 4, `expected several errors, got ${errors.length}`);
});

test('angular requires a selector when a variant projects content', () => {
  const angular = structuredClone(valid);
  angular.framework = 'angular';
  // components[1] ("button") has a variant with a slot but no selector.
  const { valid: ok, errors } = validateRegistry(angular);
  assert.equal(ok, false, 'a slotted Angular component without a selector must not validate');
  assert.match(errors.join('\n'), /selector.*is required/);
});

test('angular accepts a slotted component that declares a selector', () => {
  const angular = structuredClone(valid);
  angular.framework = 'angular';
  angular.components[1].selector = 'acme-button';
  assert.equal(validateRegistry(angular).valid, true);
});

test('angular without any slot needs no selector', () => {
  const angular = structuredClone(valid);
  angular.framework = 'angular';
  delete angular.components[1].variants[0].slot;
  assert.equal(validateRegistry(angular).valid, true);
});

test('vue never requires a selector', () => {
  assert.equal(validateRegistry(valid).valid, true);
});

test('a present selector must be a non-empty string', () => {
  const broken = structuredClone(valid);
  broken.components[0].selector = '   ';
  const { errors } = validateRegistry(broken);
  assert.match(errors.join('\n'), /selector.*non-empty/);
});
