/**
 * Figma Variables -> W3C Design Tokens (DTCG) converter.
 *
 * Reads the `GET /v1/files/:key/variables/local` endpoint (Figma Enterprise) and
 * converts every variable collection into a DTCG token tree, one file per mode.
 *
 * Nothing here talks to the network: `fetchLocalVariables` is the only I/O
 * boundary and it is injected, so the conversion is fully unit-testable.
 */

const FIGMA_API = 'https://api.figma.com/v1';

/** Figma resolved types we know how to express as DTCG tokens. */
const TYPE_MAP = {
  COLOR: 'color',
  FLOAT: 'number',
  STRING: 'string',
  BOOLEAN: 'boolean',
};

/**
 * Convert a Figma RGBA triplet (channels in the 0..1 range) to a hex string.
 * Alpha is only emitted when the colour is not fully opaque, which keeps the
 * common case readable (`#1d4ed8` instead of `#1d4ed8ff`).
 */
export function rgbaToHex({ r, g, b, a = 1 }) {
  const channel = (value) =>
    Math.round(Math.min(Math.max(value, 0), 1) * 255)
      .toString(16)
      .padStart(2, '0');
  const rgb = `#${channel(r)}${channel(g)}${channel(b)}`;
  return a >= 1 ? rgb : `${rgb}${channel(a)}`;
}

/**
 * Figma names namespace with slashes (`color/brand/primary`). DTCG nests with
 * objects, so the slash becomes the group separator.
 */
export function nameToPath(name) {
  return name
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

/** Write `value` into `tree` at `path`, creating intermediate groups. */
function setDeep(tree, path, value) {
  let cursor = tree;
  for (const segment of path.slice(0, -1)) {
    if (typeof cursor[segment] !== 'object' || cursor[segment] === null) {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  }
  cursor[path.at(-1)] = value;
}

/**
 * Turn a Figma variable value into a DTCG `$value`.
 *
 * Aliases become DTCG references (`{color.brand.primary}`) so that the token
 * graph keeps its semantics instead of being flattened into literals.
 */
function toTokenValue(raw, resolvedType, variablesById) {
  if (raw && typeof raw === 'object' && raw.type === 'VARIABLE_ALIAS') {
    const target = variablesById[raw.id];
    if (!target) {
      throw new Error(`Variable alias points at unknown variable id: ${raw.id}`);
    }
    return `{${nameToPath(target.name).join('.')}}`;
  }
  if (resolvedType === 'COLOR') return rgbaToHex(raw);
  return raw;
}

/**
 * Convert a `variables/local` payload into `{ [collection]: { [mode]: tokens } }`.
 *
 * Collections and modes are kept separate on purpose: a collection is a token
 * namespace (`palette`, `semantic`, `spacing`) and a mode is a theme
 * (`light`, `dark`, `high-contrast`). Merging them would make it impossible to
 * emit one themed stylesheet per mode.
 */
export function variablesToTokens(payload) {
  const { variables = {}, variableCollections = {} } = payload.meta ?? {};
  const output = {};

  for (const collection of Object.values(variableCollections)) {
    const byMode = {};
    for (const mode of collection.modes) {
      byMode[mode.name] = {};
    }
    output[collection.name] = byMode;
  }

  for (const variable of Object.values(variables)) {
    const type = TYPE_MAP[variable.resolvedType];
    if (!type) continue; // e.g. unsupported future Figma types
    const collection = variableCollections[variable.variableCollectionId];
    if (!collection) continue;

    const path = nameToPath(variable.name);
    for (const mode of collection.modes) {
      const raw = variable.valuesByMode[mode.modeId];
      if (raw === undefined) continue;
      const token = {
        $type: type,
        $value: toTokenValue(raw, variable.resolvedType, variables),
      };
      if (variable.description) token.$description = variable.description;
      setDeep(output[collection.name][mode.name], path, token);
    }
  }

  return output;
}

/** Fetch `variables/local` for a file. Requires a token with `file_variables:read`. */
export async function fetchLocalVariables({ fileKey, token, fetchImpl = fetch }) {
  const response = await fetchImpl(`${FIGMA_API}/files/${fileKey}/variables/local`, {
    headers: { 'X-Figma-Token': token },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Figma API ${response.status} ${response.statusText}. ` +
        `Variables require an Enterprise plan and a token with the ` +
        `\`file_variables:read\` scope. ${body}`.trim(),
    );
  }
  return response.json();
}
