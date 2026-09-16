/**
 * Dependency layering for the code -> Figma import.
 *
 * Importing a design system into Figma is not a flat operation. If `Card` nests
 * `Button` and both arrive in the same batch, the importer may produce a Card
 * containing a detached copy of Button instead of an instance of the real
 * component. The fix is to import in dependency order: every component lands
 * only after everything it nests already exists in the file.
 *
 * Layer 0 = atoms (no dependencies). Layer N = depends on something in N-1.
 */

/**
 * Assign each component a layer via longest-path-to-a-leaf, memoised.
 *
 * Cycles are reported rather than silently broken: a cycle in a design system
 * means two components nest each other, which cannot be imported in any order
 * and almost always signals a modelling mistake worth seeing.
 */
export function computeLayers(components) {
  const byId = new Map(components.map((component) => [component.id, component]));
  const layers = new Map();
  const cycles = [];

  const visit = (id, stack) => {
    if (layers.has(id)) return layers.get(id);
    const position = stack.indexOf(id);
    if (position !== -1) {
      cycles.push([...stack.slice(position), id]);
      return 0; // break the cycle so the rest of the graph still resolves
    }
    const component = byId.get(id);
    const dependencies = (component?.dependsOn ?? []).filter((dep) => byId.has(dep));
    const layer = dependencies.length === 0
      ? 0
      : Math.max(...dependencies.map((dep) => visit(dep, [...stack, id]))) + 1;
    layers.set(id, layer);
    return layer;
  };

  for (const component of components) visit(component.id, []);
  return { layers, cycles };
}

/**
 * Transitive dependency closure for one component — what must already exist in
 * the Figma file before this component can be imported as real instances.
 */
export function transitiveDependencies(components, id) {
  const byId = new Map(components.map((component) => [component.id, component]));
  const found = new Set();
  const visit = (current) => {
    for (const dep of byId.get(current)?.dependsOn ?? []) {
      if (!byId.has(dep) || found.has(dep)) continue;
      found.add(dep);
      visit(dep);
    }
  };
  visit(id);
  return [...found];
}

/**
 * How often each component is nested by others.
 *
 * This is the "most critical component" signal: a token or atom used by thirty
 * organisms deserves review attention that a leaf page template does not.
 */
export function usageCounts(components) {
  const counts = new Map(components.map((component) => [component.id, 0]));
  for (const component of components) {
    for (const dep of component.dependsOn ?? []) {
      if (counts.has(dep)) counts.set(dep, counts.get(dep) + 1);
    }
  }
  return counts;
}

/** Group components into ordered import batches, one per dependency layer. */
export function toBatches(components) {
  const { layers, cycles } = computeLayers(components);
  const grouped = new Map();
  for (const component of components) {
    const layer = layers.get(component.id) ?? 0;
    if (!grouped.has(layer)) grouped.set(layer, []);
    grouped.get(layer).push(component);
  }
  const batches = [...grouped.entries()]
    .sort(([a], [b]) => a - b)
    .map(([layer, items]) => ({
      layer,
      title: layer === 0 ? 'Atoms' : `Layer ${layer}`,
      components: items.sort((a, b) => a.id.localeCompare(b.id)),
    }));
  return { batches, cycles };
}
