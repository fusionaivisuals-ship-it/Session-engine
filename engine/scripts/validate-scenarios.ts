import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const root = resolve(import.meta.dirname, '..', '..');
const schemaPath = join(root, 'design', 'schemas', 'scenario.schema.json');
const methodSchemaPath = join(root, 'design', 'schemas', 'method.schema.json');
const scenariosDir = join(root, 'design', 'scenarios');
const methodsDir = join(root, 'design', 'methods');

if (!existsSync(scenariosDir)) {
  console.log('No scenarios directory found, skipping.');
  process.exit(0);
}

const files = readdirSync(scenariosDir).filter(f => f.endsWith('.json'));
if (files.length === 0) {
  console.log('No scenario files found, skipping.');
  process.exit(0);
}

const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
delete schema.$schema;

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

// Load all methods for cross-referencing
function loadMethod(id: string): any {
  const path = join(methodsDir, `${id}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

let failed = false;

for (const file of files) {
  const filePath = join(scenariosDir, file);
  const scenario = JSON.parse(readFileSync(filePath, 'utf-8'));
  const errors: string[] = [];

  // JSON Schema validation
  if (!validate(scenario)) {
    for (const err of validate.errors ?? []) {
      errors.push(`Schema: ${err.instancePath} ${err.message}`);
    }
  }

  // Load referenced method
  const method = loadMethod(scenario.methodId);
  if (!method) {
    errors.push(`Method "${scenario.methodId}" not found in ${methodsDir}`);
  } else {
    const blockMap = new Map<string, any>();
    for (const b of method.blocks) blockMap.set(b.id, b);

    // Check seat count matches method groupSize
    if (scenario.seats.length < method.groupSize.min || scenario.seats.length > method.groupSize.max) {
      errors.push(`Seat count ${scenario.seats.length} outside method groupSize [${method.groupSize.min}, ${method.groupSize.max}]`);
    }

    // Every private_input block must have a submission or pass for every seat
    const privateInputBlocks = method.blocks.filter((b: any) => b.type === 'private_input');
    for (const block of privateInputBlocks) {
      for (const seat of scenario.seats) {
        const hasSubmission = seat.submissions[block.id] !== undefined;
        const hasPassed = seat.passes?.includes(block.id);
        if (!hasSubmission && !hasPassed) {
          errors.push(`Seat "${seat.seat}" has no submission or pass for private_input block "${block.id}"`);
        }
      }
    }

    // Every reveal block must have canned reveal data
    const revealBlocks = method.blocks.filter((b: any) => b.type === 'reveal');
    for (const block of revealBlocks) {
      if (!scenario.canned.reveals[block.id]) {
        errors.push(`Missing canned reveal for block "${block.id}"`);
      }
    }

    // Every converge block must have canned verdicts
    const convergeBlocks = method.blocks.filter((b: any) => b.type === 'converge');
    for (const block of convergeBlocks) {
      if (!scenario.canned.verdicts[block.id] || scenario.canned.verdicts[block.id].length === 0) {
        errors.push(`Missing or empty canned verdicts for converge block "${block.id}"`);
      }
    }

    // All blockIds referenced in submissions must exist in the method
    for (const seat of scenario.seats) {
      for (const blockId of Object.keys(seat.submissions)) {
        if (!blockMap.has(blockId)) {
          errors.push(`Seat "${seat.seat}" references unknown block "${blockId}"`);
        }
      }
      if (seat.passes) {
        for (const blockId of seat.passes) {
          if (!blockMap.has(blockId)) {
            errors.push(`Seat "${seat.seat}" pass references unknown block "${blockId}"`);
          }
        }
      }
    }

    // All blockIds in reveals must be reveal blocks
    for (const blockId of Object.keys(scenario.canned.reveals)) {
      const b = blockMap.get(blockId);
      if (!b) errors.push(`Canned reveal references unknown block "${blockId}"`);
      else if (b.type !== 'reveal') errors.push(`Canned reveal block "${blockId}" is type "${b.type}", not "reveal"`);
    }

    // All blockIds in verdicts must be converge blocks
    for (const blockId of Object.keys(scenario.canned.verdicts)) {
      const b = blockMap.get(blockId);
      if (!b) errors.push(`Canned verdict references unknown block "${blockId}"`);
      else if (b.type !== 'converge') errors.push(`Canned verdict block "${blockId}" is type "${b.type}", not "converge"`);
    }
  }

  if (errors.length > 0) {
    failed = true;
    console.error(`\n  FAIL  ${file}`);
    for (const e of errors) {
      console.error(`    - ${e}`);
    }
  } else {
    console.log(`  PASS  ${file}`);
  }
}

if (failed) {
  console.error('\nScenario validation failed.');
  process.exit(1);
} else {
  console.log('\nAll scenarios valid.');
}
