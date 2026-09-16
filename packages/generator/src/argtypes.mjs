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
    argTypes[control.prop] = entry;
  }
  return argTypes;
}
