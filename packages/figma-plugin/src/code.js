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
 * Re-running is safe: already-organised components are skipped, not duplicated.
 */

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
    figma.ui.postMessage({ type: 'done', result });
  } catch (error) {
    figma.ui.postMessage({ type: 'error', message: error.message });
  }
};
