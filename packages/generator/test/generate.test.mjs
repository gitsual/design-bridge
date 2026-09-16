import test from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../src/generate.mjs';

const base = {
  name: 'acme',
  framework: 'vue',
  components: [
    {
      id: 'icon', name: 'Icon', family: 'atoms',
      import: { module: '../../lib/Icon.vue', symbol: 'default' },
      variants: [{ label: 'Check', props: { name: 'check' } }],
    },
    {
      id: 'button', name: 'Button', family: 'atoms',
      import: { module: '../../lib/Button.vue', symbol: 'default' },
      dependsOn: ['icon'],
      controls: [{ prop: 'variant', kind: 'select', options: ['primary', 'ghost'] }],
      variants: [
        { label: 'Primary', props: { variant: 'primary' }, slot: 'Save' },
        { label: '2 lines', props: { variant: 'ghost' } },
      ],
    },
  ],
};

test('generate rejects an invalid registry with every error', () => {
  assert.throws(
    () => generate({ name: '', framework: 'svelte', components: [] }),
    (error) => error instanceof AggregateError && error.errors.length >= 2,
  );
});

test('generate emits one story file per component plus both manifests', () => {
  const { files } = generate(base);
  assert.deepEqual([...files.keys()].sort(), [
    'atoms-button.stories.ts',
    'atoms-icon.stories.ts',
    'figma-organizer.json',
    'manifest.json',
  ]);
});

test('the import plan is ordered by dependency layer', () => {
  const { manifest } = generate(base);
  assert.deepEqual(manifest.importPlan.map((batch) => batch.layer), [0, 1]);
  assert.deepEqual(manifest.importPlan[0].componentIds, ['icon']);
  assert.deepEqual(manifest.importPlan[1].componentIds, ['button']);
});

test('manifest records reuse so critical components are visible', () => {
  const { manifest } = generate(base);
  const icon = manifest.components.find((component) => component.id === 'icon');
  assert.equal(icon.usedBy, 1);
  assert.equal(icon.layer, 0);
});

test('organizer item names match the Storybook story path exactly', () => {
  const { organizer } = generate(base);
  const names = organizer.items.map((item) => item.name);
  assert.ok(names.includes('acme/atoms/Button/Primary'));
  assert.ok(names.includes('acme/atoms/Icon/Check'));
});

test('organizer keeps only scalar variant props', () => {
  const registry = structuredClone(base);
  registry.components[0].variants[0].props = { name: 'check', size: 16, on: true, handler: null, nested: { a: 1 } };
  const { organizer } = generate(registry);
  const item = organizer.items.find((entry) => entry.name === 'acme/atoms/Icon/Check');
  assert.deepEqual(item.variantProps, { name: 'check', size: '16', on: 'true' });
});

test('a circular dependency warns instead of hanging', () => {
  const registry = structuredClone(base);
  registry.components[0].dependsOn = ['button'];
  const { warnings } = generate(registry);
  assert.equal(warnings.length > 0, true);
  assert.match(warnings[0], /Circular dependency/);
});

test('vue slot variants render a template, prop-only variants use args', () => {
  const { files } = generate(base);
  const story = files.get('atoms-button.stories.ts');
  assert.match(story, /template: `<div data-figma-root><Button v-bind="args">Save<\/Button><\/div>`/);
  assert.match(story, /export const Variant2Lines: Story = \{/);
  assert.doesNotMatch(story.split('Variant2Lines')[1], /template:/);
});

test('angular emits class-parameterised types and property bindings', () => {
  const registry = structuredClone(base);
  registry.framework = 'angular';
  registry.components[1].selector = 'acme-button';
  registry.components[1].import = { module: '../../lib/button.component', symbol: 'ButtonComponent' };
  const story = generate(registry).files.get('atoms-button.stories.ts');
  assert.match(story, /import \{ ButtonComponent \} from/);
  assert.match(story, /const meta: Meta<ButtonComponent>/);
  assert.match(story, /<acme-button \[variant\]="variant">Save<\/acme-button>/);
});

test('angular refuses a slotted component with no selector', () => {
  // Previously this degraded to a props-only story and the projected content
  // vanished without a word. Silent data loss in a generator is worse than a
  // failed build, so the registry now rejects it outright.
  const registry = structuredClone(base);
  registry.framework = 'angular';
  registry.components[1].import = { module: '../../lib/button.component', symbol: 'ButtonComponent' };
  assert.throws(
    () => generate(registry),
    (error) => error instanceof AggregateError
      && error.errors.some((inner) => /selector.*is required/.test(inner.message)),
  );
});

test('a component with no variants still gets a Default story', () => {
  const registry = { ...base, components: [{ id: 'x', name: 'X', family: 'atoms', import: { module: './x.vue', symbol: 'default' } }] };
  const { files, organizer } = generate(registry);
  assert.match(files.get('atoms-x.stories.ts'), /export const Default: Story/);
  assert.equal(organizer.items[0].name, 'acme/atoms/X/Default');
});
