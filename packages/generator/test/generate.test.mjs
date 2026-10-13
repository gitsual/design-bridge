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

test('angular emits class-parameterised types and a render-time template', () => {
  const registry = structuredClone(base);
  registry.framework = 'angular';
  registry.components[1].selector = 'acme-button';
  registry.components[1].import = { module: '../../lib/button.component', symbol: 'ButtonComponent' };
  const story = generate(registry).files.get('atoms-button.stories.ts');
  assert.match(story, /import \{ ButtonComponent \} from/);
  assert.match(story, /const meta: Meta<ButtonComponent>/);
  assert.match(story, /<acme-button \$\{bindInputs\(args\)\}>Save<\/acme-button>/);
});

test('angular binds the args the story has when it renders, never an absent one', () => {
  // Binding every declared control statically passes `undefined` to the
  // inputs the variant does not set, and `undefined` overrides the component's
  // own default: a button rendered `hmi-button--undefined` instead of `--fill`.
  // Binding only the variant's props breaks the other way: the control for an
  // unbound prop moves nothing. Vue gets both right through `v-bind="args"`;
  // Angular has no spread, so the template is built from the args at render
  // time, and Storybook re-renders it whenever a control changes.
  const registry = structuredClone(base);
  registry.framework = 'angular';
  registry.components[1].selector = 'acme-button';
  registry.components[1].import = { module: '../../lib/button.component', symbol: 'ButtonComponent' };
  registry.components[1].controls = [
    { prop: 'variant', kind: 'select', options: ['primary', 'ghost'] },
    { prop: 'disabled', kind: 'boolean' },
  ];
  const story = generate(registry).files.get('atoms-button.stories.ts');
  assert.match(story, /const bindInputs = \(args: Record<string, unknown>\) =>/);
  assert.match(story, /args\[key\] !== undefined/);
  assert.match(story, /<acme-button \$\{bindInputs\(args\)\}>Save<\/acme-button>/);
  assert.doesNotMatch(story, /\[variant\]="variant"/);
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

// A part is a component written only inside another (an item inside a
// select): it has no story of its own, so its props are documented on the
// page of its whole. Read from the registry, not from a docgen, so Angular
// without compodoc shows them as Vue does.
function withPart(framework) {
  const registry = structuredClone(base);
  registry.framework = framework;
  registry.components[1].parts = [{
    id: 'button-badge', name: 'ButtonBadge', selector: 'acme-button-badge',
    controls: [
      { prop: 'value', kind: 'text', description: 'What it shows.' },
      { prop: 'tone', kind: 'select', options: ['neutral', 'danger'] },
    ],
  }];
  if (framework === 'angular') {
    registry.components[1].selector = 'acme-button';
    registry.components[1].import = { module: '../../lib/button.component', symbol: 'ButtonComponent' };
  }
  return registry;
}

const description = (story) => JSON.parse(story.match(/description: \{ component: (".*") \}/)[1]);

test('the props of a part are documented on the page of its whole, by its tag in each framework', () => {
  const vue = description(generate(withPart('vue')).files.get('atoms-button.stories.ts'));
  assert.match(vue, /`<ButtonBadge>`/);
  assert.match(vue, /\| `value` \| text \| {2}\| What it shows\. \|/);
  assert.match(vue, /\| `tone` \| select \| `neutral`, `danger` \| {2}\|/);
  const angular = description(generate(withPart('angular')).files.get('atoms-button.stories.ts'));
  assert.match(angular, /`<acme-button-badge>`/);
  assert.match(angular, /\| `tone` \| select \| `neutral`, `danger` \| {2}\|/);
});

test('a part with no props says so instead of drawing an empty table', () => {
  const registry = withPart('vue');
  registry.components[1].parts[0].controls = [];
  const text = description(generate(registry).files.get('atoms-button.stories.ts'));
  assert.match(text, /`<ButtonBadge>` takes no props\./);
  assert.doesNotMatch(text, /\| Prop \|/);
});

test('a component without parts has no docs description, as before', () => {
  for (const story of generate(base).files.values()) assert.doesNotMatch(story, /description:/);
});

test('a malformed part is refused with the reason', () => {
  const registry = withPart('vue');
  registry.components[1].parts = [{ controls: [] }, 'badge'];
  assert.throws(
    () => generate(registry),
    (error) => error instanceof AggregateError
      && error.errors.some((e) => /components\[1\]\.parts\[0\]\.name: is required/.test(e.message))
      && error.errors.some((e) => /components\[1\]\.parts\[1\]: must be an object/.test(e.message)),
  );
});

const argTypesOf = (story) => story.slice(story.indexOf('argTypes:'), story.indexOf('};'));

test('a control default appears in the docs table as its default value', () => {
  const registry = structuredClone(base);
  registry.components[1].controls = [
    { prop: 'variant', kind: 'select', options: ['primary', 'ghost'], default: 'primary', description: 'Colour role of the button.' },
    { prop: 'disabled', kind: 'boolean', default: false },
  ];
  const argTypes = argTypesOf(generate(registry).files.get('atoms-button.stories.ts'));
  assert.match(argTypes, /"description": "Colour role of the button\."/);
  assert.match(argTypes, /"summary": "'primary'"/);
  assert.match(argTypes, /"summary": "false"/);
});

test('a control without default has no default value row, as before', () => {
  const argTypes = argTypesOf(generate(base).files.get('atoms-button.stories.ts'));
  assert.doesNotMatch(argTypes, /defaultValue/);
});
