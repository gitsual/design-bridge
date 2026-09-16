/**
 * The component registry: one declarative description of a design system,
 * shared by every framework adapter.
 *
 * Why a registry at all? Because the two directions of the bridge need the same
 * facts. Storybook needs to know each component's variants to render them;
 * the Figma organizer needs the same variant labels to rebuild Component Sets;
 * the batch importer needs the dependency graph to import in a safe order.
 * Deriving all three from one file keeps them from drifting apart.
 */

/** Control kinds a registry may declare, mapped to Storybook argTypes. */
export const CONTROL_KINDS = ['boolean', 'text', 'number', 'select', 'radio', 'color'];

function fail(errors, path, message) {
  errors.push(`${path}: ${message}`);
}

function validateVariant(variant, path, errors) {
  if (typeof variant !== 'object' || variant === null) {
    return fail(errors, path, 'must be an object');
  }
  if (typeof variant.label !== 'string' || variant.label.trim() === '') {
    fail(errors, `${path}.label`, 'is required and must be a non-empty string');
  }
  if (variant.props !== undefined && (typeof variant.props !== 'object' || variant.props === null || Array.isArray(variant.props))) {
    fail(errors, `${path}.props`, 'must be a plain object');
  }
  if (variant.slot !== undefined && typeof variant.slot !== 'string') {
    fail(errors, `${path}.slot`, 'must be a string');
  }
}

function validateControl(control, path, errors) {
  if (typeof control !== 'object' || control === null) {
    return fail(errors, path, 'must be an object');
  }
  if (typeof control.prop !== 'string' || control.prop.trim() === '') {
    fail(errors, `${path}.prop`, 'is required and must be a non-empty string');
  }
  if (!CONTROL_KINDS.includes(control.kind)) {
    fail(errors, `${path}.kind`, `must be one of: ${CONTROL_KINDS.join(', ')}`);
  }
  if ((control.kind === 'select' || control.kind === 'radio') && !Array.isArray(control.options)) {
    fail(errors, `${path}.options`, `is required for kind "${control.kind}"`);
  }
}

function validateComponent(component, path, errors, seenIds) {
  if (typeof component !== 'object' || component === null) {
    return fail(errors, path, 'must be an object');
  }
  for (const key of ['id', 'name', 'family']) {
    if (typeof component[key] !== 'string' || component[key].trim() === '') {
      fail(errors, `${path}.${key}`, 'is required and must be a non-empty string');
    }
  }
  if (typeof component.id === 'string') {
    if (seenIds.has(component.id)) fail(errors, `${path}.id`, `duplicate id "${component.id}"`);
    seenIds.add(component.id);
  }
  const imp = component.import;
  if (typeof imp !== 'object' || imp === null) {
    fail(errors, `${path}.import`, 'is required ({ module, symbol })');
  } else {
    if (typeof imp.module !== 'string' || imp.module.trim() === '') {
      fail(errors, `${path}.import.module`, 'is required and must be a non-empty string');
    }
    if (typeof imp.symbol !== 'string' || imp.symbol.trim() === '') {
      fail(errors, `${path}.import.symbol`, 'is required and must be a non-empty string');
    }
  }
  if (component.selector !== undefined && (typeof component.selector !== 'string' || component.selector.trim() === '')) {
    fail(errors, `${path}.selector`, 'must be a non-empty string when present');
  }
  if (component.dependsOn !== undefined) {
    if (!Array.isArray(component.dependsOn)) {
      fail(errors, `${path}.dependsOn`, 'must be an array of component ids');
    } else {
      component.dependsOn.forEach((dep, i) => {
        if (typeof dep !== 'string') fail(errors, `${path}.dependsOn[${i}]`, 'must be a component id string');
      });
    }
  }
  (component.variants ?? []).forEach((variant, i) => validateVariant(variant, `${path}.variants[${i}]`, errors));
  (component.controls ?? []).forEach((control, i) => validateControl(control, `${path}.controls[${i}]`, errors));
}

/**
 * Validate a registry document. Returns `{ valid, errors }` rather than throwing
 * so a CLI can print every problem at once instead of one per run.
 */
export function validateRegistry(registry) {
  const errors = [];
  if (typeof registry !== 'object' || registry === null) {
    return { valid: false, errors: ['registry: must be an object'] };
  }
  if (typeof registry.name !== 'string' || registry.name.trim() === '') {
    fail(errors, 'registry.name', 'is required and must be a non-empty string');
  }
  if (!['angular', 'vue'].includes(registry.framework)) {
    fail(errors, 'registry.framework', 'must be "angular" or "vue"');
  }
  if (!Array.isArray(registry.components)) {
    fail(errors, 'registry.components', 'is required and must be an array');
    return { valid: false, errors };
  }

  const seenIds = new Set();
  registry.components.forEach((component, i) => {
    validateComponent(component, `registry.components[${i}]`, errors, seenIds);
  });

  // Angular projects content through `<ng-content>`, which the generator can
  // only express as a template built around the component's selector. Without
  // one, a slotted variant would silently degrade to a props-only story and the
  // projected content would vanish from Storybook and from Figma. Fail instead.
  if (registry.framework === 'angular') {
    registry.components.forEach((component, i) => {
      const hasSlot = (component.variants ?? []).some(
        (variant) => typeof variant?.slot === 'string' && variant.slot !== '',
      );
      if (hasSlot && !component.selector) {
        fail(
          errors,
          `registry.components[${i}].selector`,
          'is required: this component has a variant with `slot`, and Angular ' +
            'content projection needs the element selector to render it',
        );
      }
    });
  }

  // Dangling dependencies are checked only after every id is known, so order
  // inside the file does not matter.
  registry.components.forEach((component, i) => {
    for (const dep of component.dependsOn ?? []) {
      if (typeof dep === 'string' && !seenIds.has(dep)) {
        fail(errors, `registry.components[${i}].dependsOn`, `unknown component id "${dep}"`);
      }
    }
  });

  return { valid: errors.length === 0, errors };
}
