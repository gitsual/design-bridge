/**
 * Parts: components written only inside another (an item inside a select).
 * A part has no story of its own, so its props are documented on the page of
 * its whole. They are read from the registry, not from a docgen, so Angular
 * without compodoc shows them as Vue does.
 *
 * A part is `{ id?, name, selector?, controls? }`. Angular writes it by its
 * selector; Vue, by its name.
 */

/** Every problem with the `parts` of every component, as messages. */
export function partErrors(components = []) {
  const errors = [];
  components.forEach((component, i) => {
    if (component?.parts === undefined) return;
    const path = `registry.components[${i}].parts`;
    if (!Array.isArray(component.parts)) {
      errors.push(`${path}: must be an array`);
      return;
    }
    component.parts.forEach((part, j) => {
      const at = `${path}[${j}]`;
      if (part === null || typeof part !== 'object' || Array.isArray(part)) {
        errors.push(`${at}: must be an object`);
        return;
      }
      if (typeof part.name !== 'string' || part.name.trim() === '') errors.push(`${at}.name: is required and must be a non-empty string`);
      if (part.controls !== undefined && !Array.isArray(part.controls)) errors.push(`${at}.controls: must be an array`);
    });
  });
  return errors;
}

const cell = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

function partDoc(part, framework) {
  const tag = `\`<${framework === 'angular' && part.selector ? part.selector : part.name}>\``;
  const controls = part.controls ?? [];
  if (controls.length === 0) return `${tag} takes no props.`;
  return [
    `**${tag}**`,
    '',
    '| Prop | Control | Options | Description |',
    '| --- | --- | --- | --- |',
    ...controls.map((c) => `| \`${cell(c.prop)}\` | ${cell(c.kind)} | ${(c.options ?? []).map((o) => `\`${cell(o)}\``).join(', ')} | ${cell(c.description)} |`),
  ].join('\n');
}

/** The Markdown for the docs page of a component with parts, or null. */
export function partsDescription(component, framework) {
  if (!component.parts?.length) return null;
  return [
    '### Parts',
    '',
    'Written only inside this component; they have no story of their own.',
    '',
    component.parts.map((part) => partDoc(part, framework)).join('\n\n'),
  ].join('\n');
}

/** The line to add to the story's `parameters`, or none. */
export function docsParameter(component, framework) {
  const text = partsDescription(component, framework);
  return text === null ? [] : [`    docs: { description: { component: ${JSON.stringify(text)} } },`];
}
