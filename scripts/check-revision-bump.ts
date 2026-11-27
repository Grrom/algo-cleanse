import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export function isDeepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (
    typeof a !== 'object' ||
    a === null ||
    typeof b !== 'object' ||
    b === null
  ) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!isDeepEqual(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }
  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) {
    return false;
  }
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) {
      return false;
    }
    if (
      !isDeepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      )
    ) {
      return false;
    }
  }
  return true;
}

export function checkRevisionBump(
  base: unknown | null,
  head: unknown,
): { ok: boolean; message: string } {
  if (base === null || base === undefined) {
    return {
      ok: true,
      message: 'Base patterns file does not exist (initial revision).',
    };
  }

  if (isDeepEqual(base, head)) {
    return {
      ok: true,
      message:
        'patterns.json is semantically identical; no revision bump required.',
    };
  }

  const baseRevision =
    typeof (base as Record<string, unknown>)?.revision === 'number'
      ? ((base as Record<string, unknown>).revision as number)
      : 0;

  const headRevision =
    typeof (head as Record<string, unknown>)?.revision === 'number'
      ? ((head as Record<string, unknown>).revision as number)
      : 0;

  if (headRevision > baseRevision) {
    return {
      ok: true,
      message: `patterns.json revision increased from ${baseRevision} to ${headRevision}.`,
    };
  }

  return {
    ok: false,
    message: `patterns.json changed but revision was not increased (base ${baseRevision}, head ${headRevision})`,
  };
}

export function checkRevisionBumpFiles(
  basePath: string | null | undefined,
  headPath: string,
): { ok: boolean; message: string } {
  let baseJson: unknown | null = null;
  if (basePath && fs.existsSync(basePath)) {
    const rawBase = fs.readFileSync(basePath, 'utf8').trim();
    if (rawBase.length > 0) {
      try {
        baseJson = JSON.parse(rawBase);
      } catch (err) {
        return {
          ok: false,
          message: `Failed to parse base patterns JSON at ${basePath}: ${err}`,
        };
      }
    }
  }

  if (!fs.existsSync(headPath)) {
    return {
      ok: false,
      message: `Head patterns file not found: ${headPath}`,
    };
  }

  let headJson: unknown;
  try {
    const rawHead = fs.readFileSync(headPath, 'utf8');
    headJson = JSON.parse(rawHead);
  } catch (err) {
    return {
      ok: false,
      message: `Failed to parse head patterns JSON at ${headPath}: ${err}`,
    };
  }

  return checkRevisionBump(baseJson, headJson);
}

const isMain =
  Boolean(process.argv[1]?.endsWith('check-revision-bump.ts')) ||
  process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const basePath = process.argv[2];
  const headPath = process.argv[3];

  if (!headPath) {
    console.error(
      'Usage: npm run patterns:revision-check -- <base-patterns.json> <head-patterns.json>',
    );
    process.exit(1);
  }

  const result = checkRevisionBumpFiles(basePath, headPath);
  if (result.ok) {
    console.log(result.message);
    process.exit(0);
  } else {
    console.error(result.message);
    process.exit(1);
  }
}
