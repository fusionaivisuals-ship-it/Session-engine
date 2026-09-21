import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';

const root = resolve(import.meta.dirname, '..', '..');
const schemaPath = join(root, 'design', 'schemas', 'method.schema.json');
const methodsDir = join(root, 'design', 'methods');

const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
delete schema.$schema; // Ajv 8 doesn't load draft-2020-12 meta-schema by default

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const files = readdirSync(methodsDir).filter(f => f.endsWith('.json'));
if (files.length === 0) {
  console.error('No method files found in', methodsDir);
  process.exit(1);
}

let failed = false;

for (const file of files) {
  const filePath = join(methodsDir, file);
  const method = JSON.parse(readFileSync(filePath, 'utf-8'));
  const errors: string[] = [];

  // JSON Schema validation
  if (!validate(method)) {
    for (const err of validate.errors ?? []) {
      errors.push(`Schema: ${err.instancePath} ${err.message}`);
    }
  }

  // Collect block ids in order for reference checks
  const blockIds: string[] = [];
  const lensIds = new Set((method.lenses ?? []).map((l: { id: string }) => l.id));

  for (const block of method.blocks ?? []) {
    // sourceBlockId must reference earlier blocks
    if (block.sourceBlockId) {
      const refs = block.sourceBlockId.split(',').map((s: string) => s.trim());
      for (const ref of refs) {
        if (!blockIds.includes(ref)) {
          errors.push(
            `Block "${block.id}": sourceBlockId "${ref}" does not reference an earlier block. ` +
            `Known earlier blocks: [${blockIds.join(', ')}]`
          );
        }
      }
    }

    // lensId must exist in method.lenses (rotating mode)
    if (block.lensId) {
      if (!lensIds.has(block.lensId)) {
        errors.push(
          `Block "${block.id}": lensId "${block.lensId}" not found in method lenses. ` +
          `Available: [${[...lensIds].join(', ')}]`
        );
      }
    }

    blockIds.push(block.id);
  }

  // Fixed-mode methods cannot have fallbacks in v1
  if (method.roleMode === 'fixed' && method.fallbacks?.length > 0) {
    errors.push('Fixed-mode methods cannot have fallbacks (detours) in v1. Use rotating mode or remove fallbacks.');
  }

  // Validate fallback block references exist in the detour method
  if (method.fallbacks) {
    for (const fb of method.fallbacks) {
      if (!['converge_failed_twice', 'ideas_thin', 'facilitator'].includes(fb.trigger)) {
        errors.push(`Fallback trigger "${fb.trigger}" is not a valid trigger.`);
      }
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
  console.error('\nValidation failed.');
  process.exit(1);
} else {
  console.log('\nAll methods valid.');
}
