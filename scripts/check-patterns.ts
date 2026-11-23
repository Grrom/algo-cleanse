import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePatterns, patternsSchema } from '../src/core/patterns-schema';

export function checkPatternsFile(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`Patterns file not found: ${filePath}`);
      return false;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch (err) {
      console.error(`Failed to parse JSON in ${filePath}:`, err);
      return false;
    }

    const parsed = parsePatterns(json);
    if (!parsed) {
      console.error(`Patterns validation failed for ${filePath}.`);
      const detailedResult = patternsSchema.safeParse(json);
      if (!detailedResult.success) {
        console.error('Validation issues:');
        for (const issue of detailedResult.error.issues) {
          console.error(`  - [${issue.path.join('.')}]: ${issue.message}`);
        }
      }
      return false;
    }

    console.log(
      `✓ Patterns valid (${filePath}): revision ${parsed.revision}, ${parsed.categories.length} categories, ${parsed.rules.length} rules.`,
    );
    return true;
  } catch (err) {
    console.error(`Unexpected error validating ${filePath}:`, err);
    return false;
  }
}

const isMain =
  Boolean(process.argv[1]?.endsWith('check-patterns.ts')) ||
  process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const targetFile =
    process.argv[2] ?? path.resolve(process.cwd(), 'patterns/patterns.json');

  const success = checkPatternsFile(targetFile);
  if (!success) {
    process.exit(1);
  }
}
