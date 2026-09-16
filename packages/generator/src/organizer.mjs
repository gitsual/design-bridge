/**
 * The organizer manifest: the contract between Storybook and the Figma plugin.
 *
 * story.to.design imports each story as a flat, independent frame named after
 * its story path. That loses the structure a design system needs — variants are
 * not grouped into Component Sets, and nothing is laid out by family. The
 * plugin rebuilds that structure, and this manifest is how it knows what the
 * intended structure was.
 *
 * `name` is the join key, and it must match Storybook's story path exactly,
 * because the plugin matches imported frames by their label text.
 */

import { storyTitle } from './naming.mjs';

export function buildOrganizerManifest({ registry, components, layers }) {
  const items = [];
  for (const component of components) {
    const variants = component.variants?.length
      ? component.variants
      : [{ label: 'Default', props: {} }];

    for (const variant of variants) {
      items.push({
        name: `${storyTitle(registry.name, component)}/${variant.label}`,
        componentId: component.id,
        family: component.family,
        component: component.name,
        variantLabel: String(variant.label),
        // Only scalars survive the trip: Figma variant properties are strings,
        // and an object or a function has no meaningful representation there.
        variantProps: scalarProps(variant.props),
        layer: layers.get(component.id) ?? 0,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    system: registry.name,
    framework: registry.framework,
    itemCount: items.length,
    items,
  };
}

/** Keep string/number/boolean props; drop anything Figma cannot express. */
export function scalarProps(props = {}) {
  const output = {};
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined) continue;
    if (['string', 'number', 'boolean'].includes(typeof value)) {
      output[key] = String(value);
    }
  }
  return output;
}
