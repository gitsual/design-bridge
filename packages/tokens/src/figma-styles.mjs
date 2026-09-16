/**
 * Figma Styles -> W3C Design Tokens (DTCG) converter.
 *
 * Variables are not the whole design system. A shadow, a type ramp and a layout
 * grid are decisions exactly as much as a colour is, and in Figma they live in
 * Styles rather than in Variables — a different endpoint, a different shape, and
 * for a long time the reason this bridge could only carry half a system across.
 *
 * Two endpoints are needed, because Figma splits a style in two. `GET
 * /v1/files/:key/styles` lists the styles with their names and ids but not
 * their values; the values live on the node each style was published from, so
 * `GET /v1/files/:key/nodes` has to be asked for those ids. The split is why
 * the conversion below takes two payloads rather than one.
 *
 * Nothing here talks to the network: the two fetchers are the only I/O boundary
 * and both are injected, so the conversion is fully unit-testable.
 */

import { rgbaToHex, nameToPath } from './figma-variables.mjs';

const FIGMA_API = 'https://api.figma.com/v1';

/** Write `value` into `tree` at `path`, creating intermediate groups. */
function setDeep(tree, path, value) {
  let cursor = tree;
  for (const segment of path.slice(0, -1)) {
    if (typeof cursor[segment] !== 'object' || cursor[segment] === null) {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  }
  cursor[path.at(-1)] = value;
}

/**
 * Figma paints carry their alpha in `opacity` beside the colour, not inside it.
 * Folding the two into one RGBA is what makes the result a single CSS colour
 * instead of a colour plus a rule about it.
 */
function paintToHex(paint) {
  const { r, g, b, a = 1 } = paint.color ?? {};
  const opacity = paint.opacity === undefined ? 1 : paint.opacity;
  return rgbaToHex({ r, g, b, a: a * opacity });
}

/**
 * The CSS angle of a Figma linear gradient.
 *
 * Figma describes the gradient with two handles in a normalised space whose y
 * axis points down; CSS measures clockwise from "to top". Reading the angle off
 * the handles rather than defaulting to `180deg` is the difference between a
 * gradient that crossed the bridge and one that merely survived it.
 */
function gradientAngle(handles = []) {
  const [start, end] = handles;
  if (!start || !end) return 180;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return Math.round(((degrees % 360) + 360) % 360);
}

/** A DTCG `gradient` token value: ordered stops, each a colour at a position. */
function paintToGradient(paint) {
  return {
    angle: gradientAngle(paint.gradientHandlePositions),
    stops: (paint.gradientStops ?? []).map((stop) => ({
      color: rgbaToHex(stop.color ?? {}),
      position: stop.position ?? 0,
    })),
  };
}

/**
 * Figma expresses line height three ways and only one of them is a number CSS
 * can use unqualified. `PIXELS` is a length, `PERCENT` is a ratio of the font
 * size, and `AUTO` means "whatever the font says" — which has no CSS spelling,
 * so it becomes `normal` rather than a number invented to stand in for it.
 */
function lineHeight(style) {
  if (style.lineHeightUnit === 'AUTO') return 'normal';
  if (style.lineHeightUnit === 'FONT_SIZE_%' || style.lineHeightUnit === 'PERCENT') {
    const percent = style.lineHeightPercentFontSize ?? 100;
    return Number((percent / 100).toFixed(4));
  }
  return style.lineHeightPx ?? 'normal';
}

/** A DTCG `typography` composite from a Figma text node's `style` block. */
function textToTypography(style = {}) {
  const value = {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    lineHeight: lineHeight(style),
    letterSpacing: style.letterSpacing ?? 0,
  };
  // Case and decoration are part of the decision when they are set, and noise
  // when they are not: Figma reports NONE for both on most styles.
  if (style.textCase && style.textCase !== 'ORIGINAL') {
    value.textTransform = { UPPER: 'uppercase', LOWER: 'lowercase', TITLE: 'capitalize' }[style.textCase];
  }
  if (style.textDecoration && style.textDecoration !== 'NONE') {
    value.textDecoration = style.textDecoration.toLowerCase();
  }
  return value;
}

/** Figma effect types that have a CSS spelling, and the property they land in. */
const EFFECT_KIND = {
  DROP_SHADOW: 'shadow',
  INNER_SHADOW: 'shadow',
  LAYER_BLUR: 'blur',
  BACKGROUND_BLUR: 'backdropBlur',
};

/**
 * A DTCG `shadow` value from a Figma effect list.
 *
 * Figma lets one style hold several effects, and CSS `box-shadow` takes a list,
 * so the composite is an array whenever there is more than one. Invisible
 * effects are dropped: a designer who unticked one meant it to be gone, and
 * carrying it across as a shadow with no marker would resurrect it in code.
 */
function effectsToValue(effects = []) {
  const visible = effects.filter((effect) => effect.visible !== false);
  const shadows = visible
    .filter((effect) => EFFECT_KIND[effect.type] === 'shadow')
    .map((effect) => ({
      inset: effect.type === 'INNER_SHADOW',
      offsetX: effect.offset?.x ?? 0,
      offsetY: effect.offset?.y ?? 0,
      blur: effect.radius ?? 0,
      spread: effect.spread ?? 0,
      color: rgbaToHex(effect.color ?? {}),
    }));
  const blur = visible.find((effect) => EFFECT_KIND[effect.type] === 'blur');
  const backdrop = visible.find((effect) => EFFECT_KIND[effect.type] === 'backdropBlur');
  return { shadows, blur: blur?.radius, backdropBlur: backdrop?.radius };
}

/**
 * A layout grid is not a CSS value, but it is a decision: twelve columns with a
 * 24px gutter is the contract a grid component implements. It crosses as
 * numbers, and the emitters spell them as custom properties rather than
 * pretending there is a single `grid` declaration to assign.
 */
function gridToValue(grids = []) {
  const grid = grids.find((candidate) => candidate.visible !== false) ?? grids[0];
  if (!grid) return null;
  const value = { pattern: (grid.pattern ?? 'COLUMNS').toLowerCase() };
  if (grid.count !== undefined && grid.count !== Number.MAX_SAFE_INTEGER) value.count = grid.count;
  if (grid.sectionSize !== undefined) value.size = grid.sectionSize;
  if (grid.gutterSize !== undefined) value.gutter = grid.gutterSize;
  if (grid.offset !== undefined) value.offset = grid.offset;
  if (grid.alignment) value.alignment = grid.alignment.toLowerCase();
  return value;
}

/**
 * Convert one style and the node it was published from into a DTCG token.
 *
 * Returns `null` for a style whose node says nothing usable — an empty fill, a
 * grid style with no grid. A style that cannot be expressed is skipped and
 * reported by the caller, never emitted as an empty token: a design system with
 * a `shadow.md` that resolves to nothing is worse than one without it.
 */
export function styleToToken(style, node) {
  if (!node) return null;
  const base = style.description ? { $description: style.description } : {};

  switch (style.style_type) {
    case 'FILL': {
      const paint = (node.fills ?? []).find((candidate) => candidate.visible !== false);
      if (!paint) return null;
      if (paint.type === 'SOLID') return { ...base, $type: 'color', $value: paintToHex(paint) };
      if (paint.type?.startsWith('GRADIENT')) {
        return { ...base, $type: 'gradient', $value: paintToGradient(paint) };
      }
      return null; // IMAGE and VIDEO paints are assets, not tokens.
    }
    case 'TEXT': {
      if (!node.style?.fontFamily) return null;
      return { ...base, $type: 'typography', $value: textToTypography(node.style) };
    }
    case 'EFFECT': {
      const value = effectsToValue(node.effects);
      if (!value.shadows.length && value.blur === undefined && value.backdropBlur === undefined) {
        return null;
      }
      return { ...base, $type: 'effect', $value: value };
    }
    case 'GRID': {
      const value = gridToValue(node.layoutGrids);
      return value ? { ...base, $type: 'grid', $value: value } : null;
    }
    default:
      return null;
  }
}

/** The token group each Figma style type is filed under when its name has none. */
const DEFAULT_GROUP = { FILL: 'fill', TEXT: 'text', EFFECT: 'effect', GRID: 'grid' };

/**
 * Convert the two payloads into `{ tokens, skipped }`.
 *
 * Styles are grouped by type rather than merged into one tree, for the same
 * reason variables are grouped by collection: `text.body` and `effect.card` are
 * different namespaces, and flattening them would let a rename in one collide
 * with the other.
 */
export function stylesToTokens({ styles = [], nodes = {} }) {
  const tokens = {};
  const skipped = [];

  for (const style of styles) {
    const document = nodes[style.node_id]?.document;
    const token = styleToToken(style, document);
    if (!token) {
      skipped.push({ name: style.name, type: style.style_type });
      continue;
    }
    // A style named `text/body/large` already says where it belongs. One named
    // `Body Large` does not, so its type provides the group it was missing.
    const path = nameToPath(style.name);
    const group = DEFAULT_GROUP[style.style_type];
    const full = path[0]?.toLowerCase() === group ? path : [group, ...path];
    setDeep(tokens, full, token);
  }

  return { tokens, skipped };
}

/** Fetch the style index for a file. Needs a token with `file_read` scope. */
export async function fetchLocalStyles({ fileKey, token, fetchImpl = fetch }) {
  const response = await fetchImpl(`${FIGMA_API}/files/${fileKey}/styles`, {
    headers: { 'X-Figma-Token': token },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Figma API ${response.status} ${response.statusText} on /styles. ${body}`.trim());
  }
  const payload = await response.json();
  return payload.meta?.styles ?? [];
}

/**
 * Fetch the nodes the styles were published from.
 *
 * Batched in chunks because the ids travel in the query string and a system
 * with a few hundred styles overruns what the API will accept in one URL.
 */
export async function fetchStyleNodes({ fileKey, ids, token, fetchImpl = fetch, chunkSize = 50 }) {
  const nodes = {};
  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const url = `${FIGMA_API}/files/${fileKey}/nodes?ids=${encodeURIComponent(chunk.join(','))}`;
    const response = await fetchImpl(url, { headers: { 'X-Figma-Token': token } });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Figma API ${response.status} ${response.statusText} on /nodes. ${body}`.trim());
    }
    const payload = await response.json();
    Object.assign(nodes, payload.nodes ?? {});
  }
  return nodes;
}

/** Pull every local style of a file and convert it. One call, both endpoints. */
export async function pullStyles({ fileKey, token, fetchImpl = fetch }) {
  const styles = await fetchLocalStyles({ fileKey, token, fetchImpl });
  const ids = [...new Set(styles.map((style) => style.node_id))];
  const nodes = ids.length ? await fetchStyleNodes({ fileKey, ids, token, fetchImpl }) : {};
  return stylesToTokens({ styles, nodes });
}
