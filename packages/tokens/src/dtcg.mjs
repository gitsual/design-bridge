/**
 * Minimal W3C DTCG token utilities: traversal, alias resolution and naming.
 *
 * This is deliberately dependency-free. Style Dictionary does all of this and
 * much more, but it also brings a large transform/format configuration surface;
 * for a bridge whose only job is "tokens in, CSS/SCSS/TS out" the explicit
 * ~120 lines below are easier to audit and to teach.
 */

/** Path segments whose numeric tokens are ratios, not CSS lengths. */
export const DEFAULT_UNITLESS = [
  'line-height', 'lineheight', 'weight', 'font-weight', 'fontweight',
  'opacity', 'z-index', 'zindex', 'ratio', 'scale', 'flex',
  // Grid styles carry a column count, which is a quantity and not a length.
  'count',
];

/** A node is a token (not a group) when it carries a `$value`. */
export function isToken(node) {
  return Boolean(node) && typeof node === 'object' && '$value' in node;
}

/**
 * Depth-first walk yielding `{ path, token }` for every token in the tree.
 * Keys starting with `$` are DTCG metadata and never treated as children.
 */
export function* walkTokens(tree, path = []) {
  for (const [key, node] of Object.entries(tree)) {
    if (key.startsWith('$')) continue;
    const nextPath = [...path, key];
    if (isToken(node)) {
      yield { path: nextPath, token: node };
    } else if (node && typeof node === 'object') {
      yield* walkTokens(node, nextPath);
    }
  }
}

const ALIAS_PATTERN = /^\{([^}]+)\}$/;

/** `"{color.brand.primary}"` -> `["color","brand","primary"]`, else `null`. */
export function parseAlias(value) {
  if (typeof value !== 'string') return null;
  const match = ALIAS_PATTERN.exec(value.trim());
  return match ? match[1].split('.') : null;
}

function getDeep(tree, path) {
  return path.reduce((cursor, segment) => (cursor == null ? undefined : cursor[segment]), tree);
}

/**
 * Resolve every alias to its literal value.
 *
 * Cycles are a real hazard: a designer can point `semantic.bg` at
 * `semantic.surface` and back. We track the chain and fail loudly with the full
 * path rather than blowing the stack, because a silent infinite loop in a build
 * step is far harder to diagnose than an explicit error.
 */
export function resolveAliases(tree) {
  const resolved = structuredClone(tree);

  const resolveAt = (path, seen) => {
    const token = getDeep(resolved, path);
    if (!isToken(token)) {
      throw new Error(`Alias points at "${path.join('.')}", which is not a token.`);
    }
    const aliasPath = parseAlias(token.$value);
    if (!aliasPath) return token.$value;

    const key = path.join('.');
    if (seen.includes(key)) {
      throw new Error(`Circular token alias: ${[...seen, key].join(' -> ')}`);
    }
    const value = resolveAt(aliasPath, [...seen, key]);
    token.$value = value;
    return value;
  };

  for (const { path } of walkTokens(resolved)) {
    resolveAt(path, []);
  }
  return resolved;
}

/** `["color","brand","primary"]` -> `"color-brand-primary"` (kebab, CSS-safe). */
export function toKebabName(path) {
  return path
    .join('-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/** `["color","brand","primary"]` -> `"colorBrandPrimary"` (for the TS export). */
export function toCamelName(path) {
  const kebab = toKebabName(path);
  return kebab.replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase());
}

/**
 * Append the unit a `number` token needs to be usable in CSS.
 *
 * Some numeric tokens are ratios, not lengths: line heights, font weights,
 * opacity and z-index must stay bare or the CSS is invalid. `unitless` holds
 * path segments that mark a token as dimensionless.
 */
export function formatValue(token, path = [], { numberUnit = 'px', unitless = DEFAULT_UNITLESS } = {}) {
  const { $type, $value } = token;
  if ($type !== 'number' || typeof $value !== 'number') return String($value);
  if ($value === 0) return '0';
  const isUnitless = path.some((segment) => unitless.includes(segment.toLowerCase()));
  return isUnitless ? String($value) : `${$value}${numberUnit}`;
}


/* ------------------------------------------------------------------ composites
 *
 * A colour is one CSS value and a type ramp is five, so the two cannot be
 * emitted the same way. DTCG calls the second kind a composite token, and the
 * split below is the whole of how they are handled:
 *
 *   serialisable — `shadow`, `effect`, `gradient` have a CSS spelling, so they
 *                  become one custom property whose value is that spelling.
 *   expandable   — `typography` and `grid` do not. Pretending otherwise would
 *                  mean inventing a `--ds-text-body` that nothing can be
 *                  assigned to, so each sub-property becomes its own custom
 *                  property and a utility class puts them back together.
 *
 * Either way every token reaches CSS, SCSS and TS under a name derived the same
 * way, so the three targets never disagree about what a token is called.
 */

/** Composite types that expand into one custom property per sub-property. */
export const EXPANDABLE_TYPES = new Set(['typography', 'grid']);

/** Is this token a composite whose `$value` is an object rather than a scalar? */
export function isComposite(token) {
  return Boolean(token) && typeof token.$value === 'object' && token.$value !== null;
}

/** `{offsetX,offsetY,blur,spread,color,inset}` -> a CSS `box-shadow` layer. */
function shadowLayer(shadow, options) {
  const length = (value) => formatValue({ $type: 'number', $value: value }, [], options);
  const parts = [
    length(shadow.offsetX ?? 0),
    length(shadow.offsetY ?? 0),
    length(shadow.blur ?? 0),
    length(shadow.spread ?? 0),
    shadow.color ?? 'currentColor',
  ];
  return shadow.inset ? `inset ${parts.join(' ')}` : parts.join(' ');
}

/** `{angle,stops}` -> `linear-gradient(90deg, #aaa 0%, #bbb 100%)`. */
function gradientValue(value) {
  const stops = (value.stops ?? [])
    .map((stop) => `${stop.color} ${Math.round((stop.position ?? 0) * 100)}%`)
    .join(', ');
  return `linear-gradient(${value.angle ?? 180}deg, ${stops})`;
}

/**
 * Expand one token into the `{ suffix, value }` pairs it contributes to CSS.
 *
 * A scalar token contributes exactly one pair with an empty suffix, so callers
 * can treat every token the same way instead of branching on its type.
 */
export function expandToken(token, path = [], options = {}) {
  const { $type, $value } = token;

  if ($type === 'shadow' && Array.isArray($value)) {
    return [{ suffix: [], value: $value.map((layer) => shadowLayer(layer, options)).join(', ') }];
  }
  if ($type === 'shadow' && isComposite(token)) {
    return [{ suffix: [], value: shadowLayer($value, options) }];
  }
  if ($type === 'gradient' && isComposite(token)) {
    return [{ suffix: [], value: gradientValue($value) }];
  }
  if ($type === 'effect' && isComposite(token)) {
    // An effect style can hold a shadow list, a layer blur and a backdrop blur
    // at once. Each lands under its own suffix rather than the base name, so
    // adding a blur to a style never changes what the shadow is called.
    const pairs = [];
    if ($value.shadows?.length) {
      pairs.push({
        suffix: ['shadow'],
        value: $value.shadows.map((layer) => shadowLayer(layer, options)).join(', '),
      });
    }
    if ($value.blur !== undefined) {
      pairs.push({ suffix: ['blur'], value: `blur(${formatValue({ $type: 'number', $value: $value.blur }, [], options)})` });
    }
    if ($value.backdropBlur !== undefined) {
      pairs.push({
        suffix: ['backdrop-blur'],
        value: `blur(${formatValue({ $type: 'number', $value: $value.backdropBlur }, [], options)})`,
      });
    }
    return pairs;
  }
  if (EXPANDABLE_TYPES.has($type) && isComposite(token)) {
    return Object.entries($value).map(([key, value]) => ({
      suffix: [key],
      value: formatValue({ $type: typeof value === 'number' ? 'number' : 'string', $value: value }, [...path, key], options),
    }));
  }
  return [{ suffix: [], value: formatValue(token, path, options) }];
}

/**
 * The CSS declarations a `typography` token stands for.
 *
 * Used by the utility-class emitter: the sub-properties already exist as custom
 * properties, so the class references them rather than repeating their values,
 * and a theme override of the property reaches the class for free.
 */
export const TYPOGRAPHY_PROPERTIES = {
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  lineHeight: 'line-height',
  letterSpacing: 'letter-spacing',
  textTransform: 'text-transform',
  textDecoration: 'text-decoration',
};
