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
 * Aliases hide inside composites too. A `typography` token is an object whose
 * `fontSize` is typically `{font.size.500}`, and resolving only scalar `$value`s
 * leaves that brace string untouched all the way into the stylesheet, where
 * `font-size: {font.size.500}` is simply ignored by the browser. So the walk
 * descends into object and array values as well.
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

    const key = path.join('.');
    const guard = () => {
      if (seen.includes(key)) {
        throw new Error(`Circular token alias: ${[...seen, key].join(' -> ')}`);
      }
    };

    const aliasPath = parseAlias(token.$value);
    if (aliasPath) {
      guard();
      const value = resolveAt(aliasPath, [...seen, key]);
      token.$value = value;
      return value;
    }

    if (token.$value !== null && typeof token.$value === 'object') {
      guard();
      token.$value = resolveInside(token.$value, [...seen, key]);
    }
    return token.$value;
  };

  // A colour's `components` are numbers and a shadow's layers are objects, so
  // this only ever rewrites the string members that are actually aliases.
  const resolveInside = (value, seen) => {
    if (Array.isArray(value)) return value.map((item) => resolveInside(item, seen));
    if (value === null || typeof value !== 'object') {
      const aliasPath = parseAlias(value);
      return aliasPath ? resolveAt(aliasPath, seen) : value;
    }
    return Object.fromEntries(
      Object.entries(value).map(([member, item]) => [member, resolveInside(item, seen)])
    );
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

/* --------------------------------------------------------------------- colour
 *
 * DTCG spells a colour as an object -- `{ colorSpace, components, alpha, hex }`
 * -- not as a hex string. Figma's own variable export uses that form, so any
 * real design source reaches us this way and a builder that only understands
 * `"#3b82f6"` silently turns the whole palette into "[object Object]".
 */

/** CSS colour spaces that are spelled `color(<space> ...)` rather than `<space>(...)`. */
const COLOR_FUNCTION_SPACES = new Set([
  'srgb', 'srgb-linear', 'display-p3', 'a98-rgb', 'prophoto-rgb', 'rec2020',
  'xyz', 'xyz-d50', 'xyz-d65',
]);

/** Spaces whose 2nd and 3rd components are percentages in CSS but plain numbers in DTCG. */
const PERCENT_SPACES = { hsl: [1, 2], hwb: [1, 2] };

/**
 * A DTCG colour value -> one CSS colour.
 *
 * `hex` wins when the token carries one, and that is a deliberate choice rather
 * than laziness: it is the sRGB value the design tool computed and the one the
 * designer is looking at in Figma, so preferring it keeps Storybook and Figma
 * showing the same colour. It also stays readable by the contrast checks
 * downstream, which parse hex; emitting `oklch(...)` instead would render fine
 * and silently switch the accessibility report off.
 *
 * Returns `null` when the colour has no CSS spelling, so the caller can fail
 * loudly with the token's path instead of emitting something unpaintable.
 */
export function colorToCss(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;

  const { colorSpace, components, alpha, hex } = value;
  if (typeof hex === 'string' && hex.trim()) return hex.trim();
  if (typeof colorSpace !== 'string' || !Array.isArray(components)) return null;

  const percentAt = PERCENT_SPACES[colorSpace] ?? [];
  const parts = components.map((component, index) => {
    if (component === 'none') return 'none';
    if (typeof component !== 'number' || !Number.isFinite(component)) return null;
    return percentAt.includes(index) ? `${component}%` : String(component);
  });
  if (parts.some((part) => part === null)) return null;

  // `alpha` is optional and 1 is the default, so a fully opaque colour is
  // spelled without the slash rather than with a redundant `/ 1`.
  const opacity = alpha === undefined || alpha === null || alpha === 1 ? '' : ` / ${alpha}`;
  const body = `${parts.join(' ')}${opacity}`;

  if (COLOR_FUNCTION_SPACES.has(colorSpace)) return `color(${colorSpace} ${body})`;
  if (['oklch', 'oklab', 'lch', 'lab', 'hsl', 'hwb'].includes(colorSpace)) return `${colorSpace}(${body})`;
  return null;
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
  if ($value !== null && typeof $value === 'object' && !Array.isArray($value) && 'colorSpace' in $value) {
    const css = colorToCss($value);
    if (css === null) {
      // Loud, because the alternative is worse. `String(object)` yields
      // "[object Object]", which is valid-looking CSS that no browser paints
      // and that every downstream contrast check reads as unparseable and
      // therefore skips. A colour we cannot express must stop the build, not
      // quietly disable the accessibility guardrail that reads it.
      throw new Error(
        `Token "${path.join('.')}" uses colorSpace "${$value.colorSpace}", which has no CSS spelling here. ` +
        'Add a `hex` fallback to the token, or use one of the DTCG colour spaces.'
      );
    }
    return css;
  }
  if (typeof $value === 'string' && $value.includes('{') && !parseAlias($value)) {
    // DTCG is explicit that a reference is the WHOLE value. `"{a}, {b}"` is a
    // literal string that happens to contain braces, so it reaches the
    // stylesheet verbatim and the browser drops the declaration -- a font stack
    // that silently stops applying. Refusing it here is the only way the
    // designer ever hears about it, and it keeps us agreeing with every other
    // DTCG tool rather than quietly accepting a file they reject.
    throw new Error(
      `Token "${path.join('.')}" embeds a reference inside a longer string: ${JSON.stringify($value)}. ` +
      'A DTCG reference must be the entire value. For a list such as a font stack, ' +
      'write $value as an array: ["{font.family.face.a}", "{font.family.fallback.sans}"].'
    );
  }
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

/**
 * One member of a font stack, ready for CSS.
 *
 * A family name containing spaces is quoted. Unquoted is legal when every word
 * is a valid identifier, but `2Noto Sans` is not, and the quoting rule is far
 * easier to get right than the identifier rule.
 */
function fontFamilyMember(name) {
  if (typeof name !== 'string') return String(name);
  if (parseAlias(name)) return name;
  return /[^a-zA-Z0-9-]/.test(name) ? `"${name}"` : name;
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
  if ($type === 'fontFamily' && Array.isArray($value)) {
    // A font stack is a list in DTCG and one comma-separated value in CSS.
    // Members keep their braces so the CSS emitter can turn each into its own
    // `var()`, which is what lets a theme override a single face.
    return [{ suffix: [], value: $value.map(fontFamilyMember).join(', ') }];
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
