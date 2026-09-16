#!/usr/bin/env node
/**
 * design-bridge-generate — registry -> Storybook stories + Figma manifests.
 *
 *   design-bridge-generate --registry <file.json> --out <dir> [--dry-run] [--quiet]
 *
 * Exit codes: 0 success, 1 invalid registry or I/O failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import { generate } from './generate.mjs';

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) flags[key] = true;
    else { flags[key] = next; i += 1; }
  }
  return flags;
}

const flags = parseArgs(process.argv.slice(2));
const quiet = Boolean(flags.quiet);
const log = (...args) => { if (!quiet) console.log(...args); };

if (flags.help || !flags.registry) {
  console.log('Usage: design-bridge-generate --registry <file.json> --out <dir> [--dry-run] [--quiet]');
  process.exit(flags.help ? 0 : 1);
}

try {
  const registryPath = path.resolve(flags.registry);
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const { files, manifest, warnings } = generate(registry);

  for (const warning of warnings) console.warn(`warning: ${warning}`);

  if (flags['dry-run']) {
    for (const name of files.keys()) log(`  would write ${name}`);
    log(`Dry run: ${files.size} file(s), ${manifest.storyCount} stories.`);
    process.exit(0);
  }

  const outDir = path.resolve(flags.out ?? 'src/stories/generated');
  // Regenerate from scratch: a component removed from the registry must not
  // leave an orphan story file behind that still imports a deleted module.
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, contents] of files) {
    fs.writeFileSync(path.join(outDir, name), contents);
  }

  log(`Generated ${files.size} file(s) into ${path.relative(process.cwd(), outDir)}`);
  log(`  ${manifest.componentCount} components, ${manifest.storyCount} stories`);
  log(`  import plan: ${manifest.importPlan.map((b) => `L${b.layer} (${b.componentIds.length})`).join(' -> ')}`);
} catch (error) {
  if (error instanceof AggregateError) {
    console.error(`design-bridge-generate: ${error.message}`);
    for (const inner of error.errors) console.error(`  - ${inner.message}`);
  } else {
    console.error(`design-bridge-generate: ${error.message}`);
  }
  process.exit(1);
}
