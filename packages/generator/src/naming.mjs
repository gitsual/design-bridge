/** Shared naming helpers for generated story files and exports. */

/** Filesystem-safe, lowercase, dash-separated. */
export function slug(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'component';
}

/**
 * A valid JavaScript identifier for a named export.
 *
 * Variant labels are written by designers ("Primary / large", "2 lines", "État
 * actif"), so they can start with a digit or carry accents. Both would produce
 * a syntax error as an export name, hence the prefix and the ASCII fold.
 */
export function exportName(label) {
  const pascal = String(label)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
  if (pascal === '') return 'Variant';
  return /^[0-9]/.test(pascal) ? `Variant${pascal}` : pascal;
}

/** Storybook's `title`, which also becomes the Figma page/component path. */
export function storyTitle(registryName, component) {
  return `${registryName}/${component.family}/${component.name}`;
}

/** Serialise a value as a JS literal for embedding in a generated file. */
export function literal(value) {
  return JSON.stringify(value, null, 2) ?? 'undefined';
}

/**
 * Re-indent a multi-line literal so it lines up inside the object it is being
 * embedded in. Without this the generated file is valid TypeScript but reads
 * like machine output, and nobody trusts generated code they cannot read.
 */
export function indentBlock(text, spaces) {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line, index) => (index === 0 || line === '' ? line : pad + line))
    .join('\n');
}
