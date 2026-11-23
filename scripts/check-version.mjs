#!/usr/bin/env node
import console from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Strips leading 'refs/tags/' and 'v' prefix from a tag string.
 * @param {string} rawTag
 * @returns {string}
 */
export function stripTagPrefix(rawTag) {
  if (!rawTag || typeof rawTag !== 'string') {
    return '';
  }
  let tag = rawTag.trim();
  if (tag.startsWith('refs/tags/')) {
    tag = tag.slice('refs/tags/'.length);
  }
  if (tag.startsWith('v')) {
    tag = tag.slice(1);
  }
  return tag;
}

/**
 * Compares tag (without 'v') against package.json version.
 * @param {string} tag
 * @param {string} packageVersion
 * @returns {{ matches: boolean; tagVersion: string; packageVersion: string; error?: string }}
 */
export function compareVersion(tag, packageVersion) {
  if (!tag) {
    return {
      matches: false,
      tagVersion: '',
      packageVersion,
      error: 'No tag provided to verify.',
    };
  }

  const tagVersion = stripTagPrefix(tag);
  if (!tagVersion) {
    return {
      matches: false,
      tagVersion,
      packageVersion,
      error: `Invalid tag: "${tag}". Tag contains no version.`,
    };
  }

  if (tagVersion !== packageVersion) {
    return {
      matches: false,
      tagVersion,
      packageVersion,
      error: `Tag version "${tagVersion}" (from "${tag}") does not match package.json version "${packageVersion}".`,
    };
  }

  return {
    matches: true,
    tagVersion,
    packageVersion,
  };
}

/**
 * Loads version from package.json.
 * @param {string} [pkgPath]
 * @returns {string}
 */
export function getPackageVersion(pkgPath) {
  const defaultPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../package.json',
  );
  const targetPath = pkgPath || defaultPath;
  const content = fs.readFileSync(targetPath, 'utf8');
  const pkg = JSON.parse(content);
  return pkg.version;
}

/**
 * Main execution.
 * @param {string[]} [argv]
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [pkgPath]
 * @returns {number} Exit code (0 for success, 1 for failure)
 */
export function main(argv = process.argv.slice(2), env = process.env, pkgPath) {
  const tag = argv[0] || env.TAG || env.GITHUB_REF_NAME || env.GITHUB_REF;
  if (!tag) {
    console.error(
      'Error: Tag must be provided as an argument or via TAG/GITHUB_REF_NAME environment variable.',
    );
    return 1;
  }

  let pkgVersion;
  try {
    pkgVersion = getPackageVersion(pkgPath);
  } catch (err) {
    console.error(`Error reading package.json: ${err.message}`);
    return 1;
  }

  const result = compareVersion(tag, pkgVersion);
  if (!result.matches) {
    console.error(`Version check failed: ${result.error}`);
    return 1;
  }

  console.log(
    `Version check passed: tag "${tag}" (version: "${result.tagVersion}") matches package.json version "${result.packageVersion}".`,
  );
  return 0;
}

// Run directly if invoked as main script
const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const code = main();
  process.exit(code);
}
