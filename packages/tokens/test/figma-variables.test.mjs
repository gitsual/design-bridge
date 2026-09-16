import test from 'node:test';
import assert from 'node:assert/strict';
import { rgbaToHex, nameToPath, variablesToTokens } from '../src/figma-variables.mjs';

test('rgbaToHex omits alpha when opaque', () => {
  assert.equal(rgbaToHex({ r: 1, g: 0, b: 0 }), '#ff0000');
  assert.equal(rgbaToHex({ r: 0, g: 0, b: 0, a: 1 }), '#000000');
});

test('rgbaToHex emits alpha when translucent', () => {
  assert.equal(rgbaToHex({ r: 0, g: 0, b: 0, a: 0.5 }), '#00000080');
});

test('rgbaToHex clamps out-of-range channels', () => {
  assert.equal(rgbaToHex({ r: 2, g: -1, b: 0.5 }), '#ff0080');
});

test('nameToPath splits Figma slash namespaces', () => {
  assert.deepEqual(nameToPath('color/brand/primary'), ['color', 'brand', 'primary']);
  assert.deepEqual(nameToPath(' spacing / md '), ['spacing', 'md']);
});

const payload = {
  meta: {
    variableCollections: {
      'c:1': {
        id: 'c:1',
        name: 'Theme',
        modes: [
          { modeId: 'm:light', name: 'light' },
          { modeId: 'm:dark', name: 'dark' },
        ],
      },
    },
    variables: {
      'v:1': {
        id: 'v:1',
        name: 'palette/blue/500',
        resolvedType: 'COLOR',
        variableCollectionId: 'c:1',
        description: 'Brand blue',
        valuesByMode: {
          'm:light': { r: 0.11, g: 0.31, b: 0.85, a: 1 },
          'm:dark': { r: 0.38, g: 0.55, b: 0.99, a: 1 },
        },
      },
      'v:2': {
        id: 'v:2',
        name: 'semantic/action',
        resolvedType: 'COLOR',
        variableCollectionId: 'c:1',
        valuesByMode: {
          'm:light': { type: 'VARIABLE_ALIAS', id: 'v:1' },
          'm:dark': { type: 'VARIABLE_ALIAS', id: 'v:1' },
        },
      },
      'v:3': {
        id: 'v:3',
        name: 'spacing/md',
        resolvedType: 'FLOAT',
        variableCollectionId: 'c:1',
        valuesByMode: { 'm:light': 16, 'm:dark': 16 },
      },
    },
  },
};

test('variablesToTokens splits collections by mode', () => {
  const result = variablesToTokens(payload);
  assert.deepEqual(Object.keys(result), ['Theme']);
  assert.deepEqual(Object.keys(result.Theme).sort(), ['dark', 'light']);
});

test('variablesToTokens converts colours per mode', () => {
  const { Theme } = variablesToTokens(payload);
  assert.equal(Theme.light.palette.blue['500'].$value, '#1c4fd9');
  assert.equal(Theme.dark.palette.blue['500'].$value, '#618cfc');
  assert.equal(Theme.light.palette.blue['500'].$type, 'color');
  assert.equal(Theme.light.palette.blue['500'].$description, 'Brand blue');
});

test('variablesToTokens keeps aliases as DTCG references', () => {
  const { Theme } = variablesToTokens(payload);
  assert.equal(Theme.light.semantic.action.$value, '{palette.blue.500}');
});

test('variablesToTokens maps FLOAT to number', () => {
  const { Theme } = variablesToTokens(payload);
  assert.equal(Theme.light.spacing.md.$type, 'number');
  assert.equal(Theme.light.spacing.md.$value, 16);
});

test('variablesToTokens rejects a dangling alias', () => {
  const broken = structuredClone(payload);
  broken.meta.variables['v:2'].valuesByMode['m:light'] = { type: 'VARIABLE_ALIAS', id: 'v:missing' };
  assert.throws(() => variablesToTokens(broken), /unknown variable id/);
});
