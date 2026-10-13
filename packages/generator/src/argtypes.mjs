/** Registry controls -> Storybook argTypes. Identical for every framework. */

export function toArgTypes(controls = []) {
  const argTypes = {};
  for (const control of controls) {
    const entry = { control: { type: control.kind } };
    if (control.kind === 'select' || control.kind === 'radio') {
      entry.options = control.options;
      entry.control = { type: control.kind };
    }
    if (control.kind === 'color') entry.control = { type: 'color' };
    if (control.description) entry.description = control.description;
    if (control.default !== undefined) entry.table = { defaultValue: { summary: defaultSummary(control.default) } };
    argTypes[control.prop] = entry;
  }
  return argTypes;
}

/** How the docs table prints a default: strings quoted, as in the component source. */
function defaultSummary(value) {
  return typeof value === 'string' ? `'${value}'` : JSON.stringify(value);
}
