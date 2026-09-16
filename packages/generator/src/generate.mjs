/**
 * Registry -> generated artefacts.
 *
 * `generate` is pure: it returns `{ files, manifest, warnings }` and writes
 * nothing. The CLI owns the filesystem. That keeps the whole generator testable
 * without temp directories, and makes a `--dry-run` free.
 */

import { validateRegistry, computeLayers, toBatches, usageCounts } from '@design-bridge/registry';
import { renderStoryFile as renderVue } from './adapters/vue.mjs';
import { renderStoryFile as renderAngular } from './adapters/angular.mjs';
import { buildOrganizerManifest } from './organizer.mjs';
import { slug } from './naming.mjs';

const ADAPTERS = { vue: renderVue, angular: renderAngular };

export function generate(registry) {
  const { valid, errors } = validateRegistry(registry);
  if (!valid) {
    throw new AggregateError(
      errors.map((message) => new Error(message)),
      `Invalid registry (${errors.length} problem${errors.length === 1 ? '' : 's'})`,
    );
  }

  const renderStoryFile = ADAPTERS[registry.framework];
  const { components } = registry;
  const { layers, cycles } = computeLayers(components);
  const { batches } = toBatches(components);
  const usage = usageCounts(components);
  const warnings = [];

  for (const cycle of cycles) {
    warnings.push(
      `Circular dependency: ${cycle.join(' -> ')}. ` +
        'Figma cannot import either component as a real instance of the other; break the cycle.',
    );
  }

  const files = new Map();
  for (const component of components) {
    const fileName = `${slug(component.family)}-${slug(component.name)}.stories.ts`;
    files.set(fileName, renderStoryFile({ registry, component }));
  }

  const organizer = buildOrganizerManifest({ registry, components, layers });
  files.set('figma-organizer.json', `${JSON.stringify(organizer, null, 2)}\n`);

  const manifest = {
    generatedAt: organizer.generatedAt,
    system: registry.name,
    framework: registry.framework,
    componentCount: components.length,
    storyCount: organizer.itemCount,
    // The import plan is the practical output of the dependency analysis:
    // run these batches through story.to.design in this exact order.
    importPlan: batches.map((batch) => ({
      layer: batch.layer,
      title: batch.title,
      componentIds: batch.components.map((component) => component.id),
    })),
    components: components.map((component) => ({
      id: component.id,
      family: component.family,
      name: component.name,
      layer: layers.get(component.id) ?? 0,
      dependsOn: component.dependsOn ?? [],
      usedBy: usage.get(component.id) ?? 0,
      variantCount: component.variants?.length ?? 1,
    })),
  };
  files.set('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);

  return { files, manifest, organizer, warnings };
}
