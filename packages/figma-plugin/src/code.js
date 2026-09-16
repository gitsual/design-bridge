/**
 * Design Bridge Organizer — Figma plugin.
 *
 * story.to.design imports each Storybook story as an independent frame named
 * after its story path. Useful, but it is not a design system: variants are not
 * grouped, nothing is laid out, and nothing carries variant properties.
 *
 * This plugin reads the organizer manifest emitted next to the stories and
 * rebuilds the structure the registry described:
 *
 *   1. match each imported frame to a manifest item, by name
 *   2. convert matched frames to components
 *   3. combine each component's variants into a Component Set
 *   4. name every variant `prop=value, ...` so Figma exposes real properties
 *   5. move each Component Set onto a page named after its family
 *
 * It also publishes the other half of a design system back to Figma. Variables
 * already cross as Variables; a shadow, a type ramp and a brand fill are Styles,
 * and until this plugin could write them the bridge carried values one way and
 * left compositions behind. `applyStyles` takes the same DTCG token files the
 * CSS is built from and creates or updates the matching Paint, Text and Effect
 * styles.
 *
 * Re-running either half is safe: already-organised components are skipped and
 * an existing style is updated in place rather than duplicated.
 */

/* ------------------------------------------------------------------ styles */

/**
 * `#rrggbb` or `#rrggbbaa` -> Figma's `{ r, g, b, a }` in the 0..1 range.
 *
 * The tokens package has this conversion in the other direction, and sharing it
 * would be better, but a Figma plugin runs as one file in a sandbox with no
 * module resolution: importing across the workspace is not available here. The
 * duplication is deliberate, and it is eleven lines rather than a build step.
 */
function hexToRgba(hex) {
  const clean = String(hex).trim().replace(/^#/, '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const channel = (offset) => parseInt(full.slice(offset, offset + 2), 16) / 255;
  return {
    r: channel(0),
    g: channel(2),
    b: channel(4),
    a: full.length >= 8 ? channel(6) : 1,
  };
}

/**
 * A numeric font weight -> the style name Figma files the face under.
 *
 * Figma has no weight axis on a style: it has a named face, and asking for the
 * wrong name fails the font load rather than falling back. Anything unmapped
 * keeps its number so the error names it.
 */
const WEIGHT_NAMES = {
  100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular',
  500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black',
};

/** Depth-first walk yielding `[path, token]` for every DTCG token in a tree. */
function walkTokens(tree, path) {
  const out = [];
  for (const key of Object.keys(tree)) {
    if (key.charAt(0) === '$') continue;
    const node = tree[key];
    if (!node || typeof node !== 'object') continue;
    const next = (path || []).concat(key);
    if ('$value' in node) out.push([next, node]);
    else out.push.apply(out, walkTokens(node, next));
  }
  return out;
}

/**
 * The Figma style name a token path becomes.
 *
 * Figma namespaces with slashes exactly as the importer reads them, so a token
 * pulled from `text/body/large` is written back to `text/body/large`. A round
 * trip has to land where it started or it is not a bridge.
 */
function styleName(path) {
  return path.join('/');
}

/** Find an existing style by name so a second run updates instead of doubling. */
function findByName(styles, name) {
  for (const style of styles) if (style.name === name) return style;
  return null;
}

function tokenEffects(value) {
  const effects = [];
  const shadows = value.shadows || (Array.isArray(value) ? value : []);
  for (const shadow of shadows) {
    effects.push({
      type: shadow.inset ? 'INNER_SHADOW' : 'DROP_SHADOW',
      color: hexToRgba(shadow.color),
      offset: { x: shadow.offsetX || 0, y: shadow.offsetY || 0 },
      radius: shadow.blur || 0,
      spread: shadow.spread || 0,
      visible: true,
      blendMode: 'NORMAL',
    });
  }
  if (value.blur !== undefined) {
    effects.push({ type: 'LAYER_BLUR', radius: value.blur, visible: true });
  }
  if (value.backdropBlur !== undefined) {
    effects.push({ type: 'BACKGROUND_BLUR', radius: value.backdropBlur, visible: true });
  }
  return effects;
}

/**
 * Create or update Figma styles from a DTCG token tree.
 *
 * Tokens that have no Style to be are skipped rather than approximated: a
 * `grid` token is a set of numbers a component implements, and writing it back
 * as a layout grid would guess at the frame it applies to.
 */
async function applyStyles(tree) {
  const paints = await figma.getLocalPaintStylesAsync();
  const texts = await figma.getLocalTextStylesAsync();
  const effects = await figma.getLocalEffectStylesAsync();
  const log = [];
  let created = 0;
  let updated = 0;
  const skipped = [];

  for (const entry of walkTokens(tree, [])) {
    const path = entry[0];
    const token = entry[1];
    const name = styleName(path);
    const type = token.$type;
    const value = token.$value;

    try {
      if (type === 'color') {
        let style = findByName(paints, name);
        if (style) updated += 1;
        else { style = figma.createPaintStyle(); style.name = name; paints.push(style); created += 1; }
        const rgba = hexToRgba(value);
        style.paints = [{ type: 'SOLID', color: { r: rgba.r, g: rgba.g, b: rgba.b }, opacity: rgba.a }];
      } else if (type === 'gradient') {
        let style = findByName(paints, name);
        if (style) updated += 1;
        else { style = figma.createPaintStyle(); style.name = name; paints.push(style); created += 1; }
        // Figma places a gradient with a transform rather than an angle. This
        // is the identity transform rotated by the token's angle about the
        // centre, which is what `linear-gradient(Ndeg, ...)` describes.
        const radians = ((value.angle || 180) - 180) * (Math.PI / 180);
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        style.paints = [{
          type: 'GRADIENT_LINEAR',
          gradientTransform: [[cos, sin, 0.5 - (cos + sin) / 2], [-sin, cos, 0.5 - (cos - sin) / 2]],
          gradientStops: (value.stops || []).map((stop) => ({
            position: stop.position,
            color: hexToRgba(stop.color),
          })),
        }];
      } else if (type === 'effect') {
        let style = findByName(effects, name);
        if (style) updated += 1;
        else { style = figma.createEffectStyle(); style.name = name; effects.push(style); created += 1; }
        style.effects = tokenEffects(value);
      } else if (type === 'typography') {
        const family = value.fontFamily;
        const weight = WEIGHT_NAMES[value.fontWeight] || String(value.fontWeight || 'Regular');
        // The font has to be loaded before any property of a text style can be
        // set, and a missing face fails here rather than silently substituting.
        await figma.loadFontAsync({ family: family, style: weight });
        let style = findByName(texts, name);
        if (style) updated += 1;
        else { style = figma.createTextStyle(); style.name = name; texts.push(style); created += 1; }
        style.fontName = { family: family, style: weight };
        if (value.fontSize !== undefined) style.fontSize = value.fontSize;
        if (value.letterSpacing !== undefined) {
          style.letterSpacing = { unit: 'PIXELS', value: value.letterSpacing };
        }
        if (value.lineHeight === 'normal' || value.lineHeight === undefined) {
          style.lineHeight = { unit: 'AUTO' };
        } else if (value.lineHeight < 4) {
          // A ratio, not a length: 1.5 means 150% of the font size.
          style.lineHeight = { unit: 'PERCENT', value: value.lineHeight * 100 };
        } else {
          style.lineHeight = { unit: 'PIXELS', value: value.lineHeight };
        }
      } else {
        skipped.push(name + ' (' + type + ')');
        continue;
      }
      log.push('+ ' + name + ' (' + type + ')');
    } catch (error) {
      log.push('! ' + name + ': ' + error.message);
      skipped.push(name + ' (' + error.message + ')');
    }
  }

  return { log: log, created: created, updated: updated, skipped: skipped };
}

/** Figma variant property names cannot contain `=` or `,`. */
function sanitisePropertyName(name) {
  return String(name).replace(/[=,]/g, '-').trim() || 'prop';
}

/**
 * Build the Figma variant name from the manifest's scalar props.
 * Falls back to the variant label when a component declares no props, because
 * a Component Set still needs one property to group its children.
 */
function variantName(item) {
  const entries = Object.entries(item.variantProps || {});
  if (entries.length === 0) return `Variant=${sanitisePropertyName(item.variantLabel)}`;
  return entries
    .map(([key, value]) => `${sanitisePropertyName(key)}=${sanitisePropertyName(value)}`)
    .join(', ');
}

/** Index manifest items by their story path, which is the join key. */
function indexManifest(manifest) {
  const byName = new Map();
  for (const item of manifest.items || []) byName.set(item.name.trim(), item);
  return byName;
}

/**
 * Find the label a story.to.design import leaves inside each cell.
 *
 * The importer writes the story path as a text layer. We search the node's own
 * name first (cheaper and usually correct) and fall back to any descendant text
 * whose content matches a manifest entry.
 */
function resolveItem(node, byName) {
  const own = byName.get(node.name.trim());
  if (own) return own;

  const texts = node.findAllWithCriteria ? node.findAllWithCriteria({ types: ['TEXT'] }) : [];
  for (const text of texts) {
    const candidate = byName.get((text.characters || '').trim());
    if (candidate) return candidate;
  }
  return null;
}

/** Get or create a page by name, without disturbing the current page. */
async function ensurePage(name) {
  const existing = figma.root.children.find((page) => page.name === name);
  if (existing) {
    await existing.loadAsync();
    return existing;
  }
  const page = figma.createPage();
  page.name = name;
  return page;
}

/**
 * Convert a node to a COMPONENT if it is not one already.
 * Nodes that are already inside a Component Set are left alone.
 */
function toComponent(node) {
  if (node.type === 'COMPONENT') return node;
  if (node.type === 'COMPONENT_SET') return null;
  if (node.type !== 'FRAME' && node.type !== 'GROUP' && node.type !== 'INSTANCE') return null;
  try {
    return figma.createComponentFromNode(node);
  } catch (error) {
    return null;
  }
}

async function organize(options) {
  const { manifest, groupIntoPages, pagePrefix } = options;
  const byName = indexManifest(manifest);
  const log = [];

  const roots = figma.currentPage.selection.length > 0
    ? Array.from(figma.currentPage.selection)
    : Array.from(figma.currentPage.children);

  // Group matched nodes by the component they belong to.
  const groups = new Map();
  let unmatched = 0;
  for (const node of roots) {
    if (node.type === 'COMPONENT_SET') continue; // already organised
    const item = resolveItem(node, byName);
    if (!item) { unmatched += 1; continue; }
    const key = `${item.family}/${item.component}`;
    if (!groups.has(key)) groups.set(key, { item, entries: [] });
    groups.get(key).entries.push({ node, item });
  }

  let setsCreated = 0;
  let skipped = 0;

  for (const [key, group] of groups) {
    const components = [];
    for (const entry of group.entries) {
      const component = toComponent(entry.node);
      if (!component) { skipped += 1; continue; }
      component.name = variantName(entry.item);
      components.push(component);
    }
    if (components.length === 0) { skipped += 1; continue; }

    let target;
    if (components.length === 1) {
      // A single variant is a plain component: combining one node into a set
      // produces a Component Set with one child, which only adds noise.
      target = components[0];
      target.name = group.item.component;
    } else {
      try {
        target = figma.combineAsVariants(components, figma.currentPage);
        target.name = group.item.component;
        setsCreated += 1;
      } catch (error) {
        log.push(`! ${key}: could not combine variants (${error.message})`);
        continue;
      }
    }

    if (groupIntoPages) {
      const page = await ensurePage(`${pagePrefix || ''}${group.item.family}`);
      page.appendChild(target);
    }
    log.push(`+ ${key}: ${components.length} variant(s)`);
  }

  return {
    log,
    matched: groups.size,
    setsCreated,
    unmatched,
    skipped,
  };
}

figma.showUI(__html__, { width: 420, height: 520 });

figma.ui.onmessage = async (message) => {
  if (message.type === 'styles') {
    try {
      const tree = JSON.parse(message.tokens);
      const result = await applyStyles(tree);
      figma.ui.postMessage({ type: 'done', kind: 'styles', result });
    } catch (error) {
      figma.ui.postMessage({ type: 'error', message: error.message });
    }
    return;
  }
  if (message.type !== 'organize') return;
  try {
    const manifest = JSON.parse(message.manifest);
    if (!manifest || !Array.isArray(manifest.items)) {
      throw new Error('Manifest has no `items` array. Is this a figma-organizer.json?');
    }
    const result = await organize({
      manifest,
      groupIntoPages: message.groupIntoPages,
      pagePrefix: message.pagePrefix,
    });
    figma.ui.postMessage({ type: 'done', kind: 'organize', result });
  } catch (error) {
    figma.ui.postMessage({ type: 'error', message: error.message });
  }
};
