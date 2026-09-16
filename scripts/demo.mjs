#!/usr/bin/env node
/**
 * End-to-end demo: both directions of the bridge, in one run, no network.
 *
 * Direction A uses a canned `variables/local` payload instead of calling Figma,
 * so the demo works without an Enterprise plan or a token. Everything after the
 * fetch is the exact production code path.
 */

import { variablesToTokens } from '../packages/tokens/src/figma-variables.mjs';
import { toCss, toTypeScript } from '../packages/tokens/src/build.mjs';
import { generate } from '../packages/generator/src/generate.mjs';

const line = (label) => console.log(`\n\x1b[1m${label}\x1b[0m\n${'-'.repeat(label.length)}`);

// -- Direction A: Figma Variables -> tokens -> CSS -------------------------

const figmaPayload = {
  meta: {
    variableCollections: {
      'c:1': {
        id: 'c:1',
        name: 'Theme',
        modes: [{ modeId: 'm:l', name: 'light' }, { modeId: 'm:d', name: 'dark' }],
      },
    },
    variables: {
      'v:1': {
        id: 'v:1', name: 'palette/blue/500', resolvedType: 'COLOR',
        variableCollectionId: 'c:1', description: 'Brand blue',
        valuesByMode: { 'm:l': { r: 0.23, g: 0.51, b: 0.96 }, 'm:d': { r: 0.38, g: 0.65, b: 0.98 } },
      },
      'v:2': {
        id: 'v:2', name: 'semantic/action', resolvedType: 'COLOR',
        variableCollectionId: 'c:1',
        valuesByMode: { 'm:l': { type: 'VARIABLE_ALIAS', id: 'v:1' }, 'm:d': { type: 'VARIABLE_ALIAS', id: 'v:1' } },
      },
      'v:3': {
        id: 'v:3', name: 'spacing/md', resolvedType: 'FLOAT',
        variableCollectionId: 'c:1', valuesByMode: { 'm:l': 16, 'm:d': 16 },
      },
    },
  },
};

line('A. Figma Variables -> DTCG -> CSS custom properties');
const { Theme } = variablesToTokens(figmaPayload);
console.log('light mode CSS:');
console.log(toCss(Theme.light, { prefix: 'ds' }).trimEnd());
console.log('\ndark mode CSS (same aliases, different palette):');
console.log(toCss(Theme.dark, { selector: ':root[data-theme="dark"]', prefix: 'ds' }).trimEnd());
console.log('\nNote: --ds-semantic-action stays a var(). Override the palette and');
console.log('every semantic token follows, which is what makes theming work.');
console.log('\ntyped TS (excerpt):');
console.log(toTypeScript(Theme.light, { prefix: 'ds' }).split('\n').slice(0, 6).join('\n'));

// -- Direction B: registry -> stories + Figma import plan ------------------

const registry = {
  name: 'acme',
  framework: 'vue',
  components: [
    { id: 'icon', name: 'Icon', family: 'atoms', import: { module: './Icon.vue', symbol: 'default' },
      variants: [{ label: 'Check', props: { name: 'check' } }] },
    { id: 'button', name: 'Button', family: 'atoms', import: { module: './Button.vue', symbol: 'default' },
      dependsOn: ['icon'],
      controls: [{ prop: 'variant', kind: 'select', options: ['primary', 'ghost'] }],
      variants: [
        { label: 'Primary', props: { variant: 'primary' }, slot: 'Save' },
        { label: 'Ghost', props: { variant: 'ghost' }, slot: 'Cancel' },
      ] },
    { id: 'card', name: 'Card', family: 'molecules', import: { module: './Card.vue', symbol: 'default' },
      dependsOn: ['button'],
      variants: [{ label: 'With action', props: { title: 'Invoice #4021', action: 'Review' } }] },
  ],
};

line('B. Registry -> Storybook stories -> Figma import plan');
const { files, manifest, warnings } = generate(registry);
for (const warning of warnings) console.warn(`warning: ${warning}`);

console.log('generated files:');
for (const name of files.keys()) console.log(`  ${name}`);

console.log('\ndependency layers (import order matters):');
for (const component of manifest.components) {
  const deps = component.dependsOn.length ? ` <- ${component.dependsOn.join(', ')}` : '';
  console.log(`  L${component.layer}  ${component.family}/${component.name}${deps}  (used by ${component.usedBy})`);
}

console.log('\nimport plan for story.to.design — run these batches IN ORDER:');
for (const batch of manifest.importPlan) {
  console.log(`  ${batch.title.padEnd(9)} ${batch.componentIds.join(', ')}`);
}
console.log('\nWhy the order: Card nests Button, which nests Icon. Import them all at');
console.log('once and Figma produces detached copies instead of real instances.');

line('Generated Vue story (excerpt)');
console.log(files.get('atoms-button.stories.ts').split('\n').slice(0, 22).join('\n'));

console.log('');
