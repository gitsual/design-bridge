import test from 'node:test';
import assert from 'node:assert/strict';
import { styleToToken, stylesToTokens } from '../src/figma-styles.mjs';

/**
 * Figma splits a style in two: the index knows its name and id, the node knows
 * its value. The fixtures below are the shapes the two endpoints actually
 * return, trimmed to the fields the converter reads.
 */
const solidNode = { fills: [{ type: 'SOLID', color: { r: 0, g: 0.4, b: 1 }, opacity: 0.5 }] };
const gradientNode = {
  fills: [
    {
      type: 'GRADIENT_LINEAR',
      gradientHandlePositions: [{ x: 0, y: 1 }, { x: 0, y: 0 }],
      gradientStops: [
        { position: 0, color: { r: 1, g: 0, b: 0 } },
        { position: 1, color: { r: 0, g: 0, b: 1 } },
      ],
    },
  ],
};
const textNode = {
  style: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: 0.5,
    lineHeightUnit: 'PIXELS',
    lineHeightPx: 24,
  },
};
const effectNode = {
  effects: [
    { type: 'DROP_SHADOW', visible: true, color: { r: 0, g: 0, b: 0, a: 0.15 }, offset: { x: 0, y: 2 }, radius: 4, spread: 0 },
    { type: 'DROP_SHADOW', visible: false, color: { r: 1, g: 0, b: 0, a: 1 }, offset: { x: 9, y: 9 }, radius: 9 },
  ],
};

test('a solid fill style folds paint opacity into the colour', () => {
  const token = styleToToken({ style_type: 'FILL', name: 'brand/primary' }, solidNode);
  assert.equal(token.$type, 'color');
  assert.equal(token.$value, '#0066ff80');
});

test('a gradient reads its angle off the handles rather than defaulting', () => {
  const token = styleToToken({ style_type: 'FILL', name: 'brand/sunrise' }, gradientNode);
  assert.equal(token.$type, 'gradient');
  // Handles run bottom-to-top, which is "to top" — 0deg in CSS, not 180.
  assert.equal(token.$value.angle, 0);
  assert.deepEqual(token.$value.stops, [
    { color: '#ff0000', position: 0 },
    { color: '#0000ff', position: 1 },
  ]);
});

test('a text style becomes a typography composite', () => {
  const token = styleToToken({ style_type: 'TEXT', name: 'body/large' }, textNode);
  assert.equal(token.$type, 'typography');
  assert.deepEqual(token.$value, {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 24,
    letterSpacing: 0.5,
  });
});

test('an AUTO line height stays `normal` instead of being invented', () => {
  const token = styleToToken({ style_type: 'TEXT', name: 'body' }, { style: { fontFamily: 'Inter', lineHeightUnit: 'AUTO' } });
  assert.equal(token.$value.lineHeight, 'normal');
});

test('a percentage line height becomes a ratio', () => {
  const node = { style: { fontFamily: 'Inter', lineHeightUnit: 'PERCENT', lineHeightPercentFontSize: 150 } };
  assert.equal(styleToToken({ style_type: 'TEXT', name: 'body' }, node).$value.lineHeight, 1.5);
});

test('an invisible effect does not cross the bridge', () => {
  const token = styleToToken({ style_type: 'EFFECT', name: 'card' }, effectNode);
  assert.equal(token.$type, 'effect');
  assert.equal(token.$value.shadows.length, 1);
  assert.deepEqual(token.$value.shadows[0], {
    inset: false,
    offsetX: 0,
    offsetY: 2,
    blur: 4,
    spread: 0,
    color: '#00000026',
  });
});

test('a grid style crosses as the numbers it fixes', () => {
  const node = { layoutGrids: [{ pattern: 'COLUMNS', count: 12, gutterSize: 24, offset: 16, alignment: 'STRETCH' }] };
  const token = styleToToken({ style_type: 'GRID', name: 'desktop' }, node);
  assert.equal(token.$type, 'grid');
  assert.deepEqual(token.$value, { pattern: 'columns', count: 12, gutter: 24, offset: 16, alignment: 'stretch' });
});

test('a style with nothing a token can express is skipped, not emitted empty', () => {
  assert.equal(styleToToken({ style_type: 'FILL', name: 'photo' }, { fills: [{ type: 'IMAGE' }] }), null);
  assert.equal(styleToToken({ style_type: 'EFFECT', name: 'nothing' }, { effects: [] }), null);
  assert.equal(styleToToken({ style_type: 'FILL', name: 'ghost' }, undefined), null);
});

test('styles are grouped by type unless the name already says so', () => {
  const { tokens, skipped } = stylesToTokens({
    styles: [
      { node_id: '1:1', style_type: 'TEXT', name: 'body/large' },
      { node_id: '1:2', style_type: 'EFFECT', name: 'effect/card' },
      { node_id: '1:3', style_type: 'FILL', name: 'nope' },
    ],
    nodes: {
      '1:1': { document: textNode },
      '1:2': { document: effectNode },
      '1:3': { document: { fills: [] } },
    },
  });
  assert.equal(tokens.text.body.large.$type, 'typography');
  // Already prefixed `effect/`, so it is not filed under `effect.effect.card`.
  assert.equal(tokens.effect.card.$type, 'effect');
  assert.deepEqual(skipped, [{ name: 'nope', type: 'FILL' }]);
});

test('a description on the style reaches the token', () => {
  const token = styleToToken({ style_type: 'TEXT', name: 'body', description: 'Reading size' }, textNode);
  assert.equal(token.$description, 'Reading size');
});
