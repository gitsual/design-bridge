import test from 'node:test';
import assert from 'node:assert/strict';
import { toCss, toCssUtilities, toScss, toTypeScript, toFlatJson } from '../src/build.mjs';
import { expandToken } from '../src/dtcg.mjs';

/**
 * The regression these cases exist for: before composites were understood,
 * every emitter fell through to `String($value)` and a shadow reached the
 * stylesheet as `[object Object]` — valid CSS syntax, no error, no shadow.
 */
const tokens = {
  text: {
    body: {
      $type: 'typography',
      $description: 'Reading size',
      $value: { fontFamily: 'Inter', fontSize: 16, fontWeight: 600, lineHeight: 1.5, letterSpacing: 0.5 },
    },
  },
  effect: {
    card: {
      $type: 'effect',
      $value: {
        shadows: [
          { inset: false, offsetX: 0, offsetY: 1, blur: 2, spread: 0, color: '#0000001a' },
          { inset: false, offsetX: 0, offsetY: 4, blur: 8, spread: -2, color: '#00000014' },
        ],
      },
    },
    frosted: { $type: 'effect', $value: { shadows: [], backdropBlur: 12 } },
  },
  fill: { sunrise: { $type: 'gradient', $value: { angle: 90, stops: [{ color: '#ff0000', position: 0 }, { color: '#0000ff', position: 1 }] } } },
  grid: { desktop: { $type: 'grid', $value: { pattern: 'columns', count: 12, gutter: 24 } } },
};

test('no emitter ever writes [object Object]', () => {
  for (const output of [
    toCss(tokens, { prefix: 'ds' }),
    toCssUtilities(tokens, { prefix: 'ds' }),
    toScss(tokens, { prefix: 'ds' }),
    toTypeScript(tokens, { prefix: 'ds' }),
    toFlatJson(tokens, { prefix: 'ds' }),
  ]) {
    assert.doesNotMatch(output, /\[object Object\]/);
  }
});

test('a typography token expands into one custom property per sub-property', () => {
  const css = toCss(tokens, { prefix: 'ds' });
  assert.match(css, /--ds-text-body-font-family: Inter;/);
  assert.match(css, /--ds-text-body-font-size: 16px;/);
  assert.match(css, /--ds-text-body-font-weight: 600;/);
  assert.match(css, /--ds-text-body-line-height: 1\.5;/);
  assert.match(css, /--ds-text-body-letter-spacing: 0\.5px;/);
});

test('line height and weight stay unitless; letter spacing does not', () => {
  const pairs = Object.fromEntries(
    expandToken(tokens.text.body, ['text', 'body']).map(({ suffix, value }) => [suffix[0], value]),
  );
  assert.equal(pairs.lineHeight, '1.5');
  assert.equal(pairs.fontWeight, '600');
  assert.equal(pairs.letterSpacing, '0.5px');
});

test('an effect becomes a box-shadow list under its own suffix', () => {
  const css = toCss(tokens, { prefix: 'ds' });
  assert.match(css, /--ds-effect-card-shadow: 0 1px 2px 0 #0000001a, 0 4px 8px -2px #00000014;/);
  assert.match(css, /--ds-effect-frosted-backdrop-blur: blur\(12px\);/);
  // A blur-only effect has no shadow property at all rather than an empty one.
  assert.doesNotMatch(css, /--ds-effect-frosted-shadow/);
});

test('a gradient becomes one CSS gradient function', () => {
  assert.match(toCss(tokens, { prefix: 'ds' }), /--ds-fill-sunrise: linear-gradient\(90deg, #ff0000 0%, #0000ff 100%\);/);
});

test('a grid column count is a quantity, not a length', () => {
  const css = toCss(tokens, { prefix: 'ds' });
  assert.match(css, /--ds-grid-desktop-count: 12;/);
  assert.match(css, /--ds-grid-desktop-gutter: 24px;/);
});

test('typography also leaves as a class, because it is a set of declarations', () => {
  const css = toCssUtilities(tokens, { prefix: 'ds' });
  assert.match(css, /\.ds-text-body \{/);
  // The class points at the properties rather than repeating their values, so
  // a theme override of one property reaches the class without a rebuild.
  assert.match(css, /font-size: var\(--ds-text-body-font-size\);/);
  assert.match(css, /line-height: var\(--ds-text-body-line-height\);/);
});

test('a token set with no typography produces no utility sheet at all', () => {
  assert.equal(toCssUtilities({ color: { bg: { $type: 'color', $value: '#fff' } } }), '');
});

test('the TS export names every expanded property, so TS and CSS agree', () => {
  const ts = toTypeScript(tokens, { prefix: 'ds' });
  assert.match(ts, /textBodyFontSize: 'var\(--ds-text-body-font-size\)'/);
  assert.match(ts, /effectCardShadow: 'var\(--ds-effect-card-shadow\)'/);
});

test('SCSS resolves composites too', () => {
  const scss = toScss(tokens, { prefix: 'ds' });
  assert.match(scss, /\$ds-text-body-font-size: 16px;/);
  assert.match(scss, /\$ds-effect-card-shadow: 0 1px 2px 0 #0000001a, 0 4px 8px -2px #00000014;/);
});

test('an inset shadow keeps its keyword', () => {
  const token = { $type: 'shadow', $value: { inset: true, offsetX: 0, offsetY: 1, blur: 2, spread: 0, color: '#000' } };
  assert.equal(expandToken(token, ['shadow', 'inner'])[0].value, 'inset 0 1px 2px 0 #000');
});

test('scalars still expand to exactly one unsuffixed pair', () => {
  const pairs = expandToken({ $type: 'color', $value: '#fff' }, ['color', 'bg']);
  assert.deepEqual(pairs, [{ suffix: [], value: '#fff' }]);
});
