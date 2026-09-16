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
