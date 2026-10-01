import test from 'node:test';
import assert from 'node:assert/strict';
import { walkTokens, parseAlias, resolveAliases, toKebabName, toCamelName, formatValue, colorToCss, expandToken } from '../src/dtcg.mjs';

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

test('formatValue keeps a flex proportion bare when the segment only ends in the marker', () => {
  // Design names a column's share `details-grow`; with `1px` the flex item
  // stops growing at all.
  assert.equal(formatValue({ $type: 'number', $value: 2 }, ['admin-panel', 'central', 'main-grow']), '2');
  assert.equal(formatValue({ $type: 'number', $value: 0 }, ['card', 'shrink']), '0');
  assert.equal(formatValue({ $type: 'number', $value: 1 }, ['card', 'flex-shrink']), '1');
  assert.equal(formatValue({ $type: 'number', $value: 16 }, ['card', 'growth-gap']), '16px');
});

test('formatValue adds px to lengths but not to ratios', () => {
  assert.equal(formatValue({ $type: 'number', $value: 16 }, ['spacing', 'md']), '16px');
  assert.equal(formatValue({ $type: 'number', $value: 1.5 }, ['typography', 'line-height']), '1.5');
  assert.equal(formatValue({ $type: 'number', $value: 700 }, ['font', 'weight']), '700');
  assert.equal(formatValue({ $type: 'number', $value: 0 }, ['spacing', 'none']), '0');
});


/* ------------------------------------------------------- DTCG object colours
 *
 * Every one of these was a real defect: a Figma export whose colours are objects
 * built 109 custom properties reading "[object Object]", and nothing failed.
 */

test('colorToCss prefers the hex fallback the design tool computed', () => {
  // Not an optimisation. Hex is what the designer sees in Figma, and it is what
  // the downstream WCAG check can parse -- oklch() would render and silently
  // turn the accessibility report off.
  const value = { colorSpace: 'oklch', components: [0.9577, 0.0017, 247.8396], hex: '#f0f1f2' };
  assert.equal(colorToCss(value), '#f0f1f2');
});

test('colorToCss spells a hex-less colour in its own colour space', () => {
  assert.equal(colorToCss({ colorSpace: 'oklch', components: [0.7, 0.15, 250] }), 'oklch(0.7 0.15 250)');
  assert.equal(colorToCss({ colorSpace: 'srgb', components: [0.5, 0.25, 0.125] }), 'color(srgb 0.5 0.25 0.125)');
  assert.equal(colorToCss({ colorSpace: 'hsl', components: [210, 50, 40] }), 'hsl(210 50% 40%)');
});

test('colorToCss omits a redundant fully-opaque alpha', () => {
  assert.equal(colorToCss({ colorSpace: 'oklch', components: [0.7, 0.15, 250], alpha: 1 }), 'oklch(0.7 0.15 250)');
  assert.equal(colorToCss({ colorSpace: 'oklch', components: [0.7, 0.15, 250], alpha: 0.4 }), 'oklch(0.7 0.15 250 / 0.4)');
});

test('colorToCss keeps the DTCG "none" component', () => {
  assert.equal(colorToCss({ colorSpace: 'oklch', components: [0.7, 'none', 250] }), 'oklch(0.7 none 250)');
});

test('colorToCss refuses a colour it cannot spell', () => {
  assert.equal(colorToCss({ colorSpace: 'cmyk', components: [0, 0, 0, 1] }), null);
  assert.equal(colorToCss({ colorSpace: 'oklch' }), null);
});

test('formatValue renders an object colour instead of stringifying it', () => {
  const token = { $type: 'color', $value: { colorSpace: 'oklch', components: [0.95, 0.001, 247], hex: '#f0f1f2' } };
  assert.equal(formatValue(token, ['color', 'taupe', '50']), '#f0f1f2');
});

test('formatValue fails loudly, naming the token, on a colour with no CSS spelling', () => {
  const token = { $type: 'color', $value: { colorSpace: 'cmyk', components: [0, 0, 0, 1] } };
  assert.throws(
    () => formatValue(token, ['color', 'ink', '900']),
    /color\.ink\.900.*cmyk/s
  );
});

/* ------------------------------------------------ aliases inside composites */

test('resolveAliases descends into a typography composite', () => {
  const source = {
    font: { size: { 500: { $type: 'number', $value: 24 } }, weight: { bold: { $type: 'number', $value: 700 } } },
    typography: {
      heading: {
        $type: 'typography',
        $value: { fontSize: '{font.size.500}', fontWeight: '{font.weight.bold}', textTransform: 'none' },
      },
    },
  };
  const resolved = resolveAliases(source);
  assert.deepEqual(resolved.typography.heading.$value, { fontSize: 24, fontWeight: 700, textTransform: 'none' });
});

test('resolveAliases descends into a shadow layer list', () => {
  const source = {
    palette: { shade: { $type: 'color', $value: '#00000033' } },
    shadow: { card: { $type: 'shadow', $value: [{ offsetX: 0, offsetY: 2, blur: 4, color: '{palette.shade}' }] } },
  };
  const resolved = resolveAliases(source);
  assert.equal(resolved.shadow.card.$value[0].color, '#00000033');
});

test('resolveAliases leaves a colour object untouched', () => {
  // `components` are numbers and `hex` is not a brace string, so descending into
  // a colour must be a no-op rather than a corruption.
  const value = { colorSpace: 'oklch', components: [0.7, 0.15, 250], hex: '#3b82f6' };
  const resolved = resolveAliases({ color: { blue: { $type: 'color', $value: value } } });
  assert.deepEqual(resolved.color.blue.$value, value);
});

test('a cycle through a composite member is caught, not a stack overflow', () => {
  const source = {
    a: { $type: 'typography', $value: { fontSize: '{b}' } },
    b: { $type: 'number', $value: '{a}' },
  };
  assert.throws(() => resolveAliases(source), /Circular token alias/);
});


/* ------------------------------------------------------------- font stacks */

test('a font stack written as a DTCG array becomes one comma-separated value', () => {
  const token = {
    $type: 'fontFamily',
    $value: ['{font.family.face.noto-sans}', 'Noto Sans Mono', 'sans-serif'],
  };
  const [{ suffix, value }] = expandToken(token, ['font', 'family', 'stack', 'ui']);
  assert.deepEqual(suffix, []);
  assert.equal(value, '{font.family.face.noto-sans}, "Noto Sans Mono", sans-serif');
});

test('a reference embedded in a longer string is refused, with the fix in the message', () => {
  // Measured on a real export: this shape reaches the stylesheet verbatim and
  // the browser drops the declaration, so the font stack stops applying and
  // nothing says so.
  const token = { $type: 'fontFamily', $value: '{font.family.face.mono}, {font.family.fallback.mono}' };
  assert.throws(
    () => formatValue(token, ['font', 'family', 'stack', 'mono']),
    /font\.family\.stack\.mono.*entire value.*array/s
  );
});

test('a plain string with no braces is still a plain string', () => {
  assert.equal(formatValue({ $type: 'fontFamily', $value: 'Noto Sans' }, ['a']), 'Noto Sans');
});

test('a hex with a separate alpha keeps its transparency', () => {
  // Figma exports an overlay as an opaque hex plus an `alpha` member. Preferring
  // the hex and dropping the alpha turns a 4% scrim into a solid slab, which is
  // exactly what a real design package shipped and what the swatch page showed:
  // seven "alpha" steps, all painted the same opaque colour.
  assert.equal(
    colorToCss({ colorSpace: 'oklch', components: [0.29, 0.02, 227], hex: '#232e33', alpha: 0.0392 }),
    '#232e330a',
  );
  // Opaque stays exactly as it was: three- and six-digit hexes are untouched.
  assert.equal(colorToCss({ hex: '#232e33', alpha: 1, colorSpace: 'srgb', components: [0, 0, 0] }), '#232e33');
  // An eight-digit hex already carries its own alpha and is not doubled up.
  assert.equal(colorToCss({ hex: '#232e3380', alpha: 0.5, colorSpace: 'srgb', components: [0, 0, 0] }), '#232e3380');
});
