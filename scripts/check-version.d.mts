export function stripTagPrefix(rawTag: string): string;

export interface VersionComparisonResult {
  matches: boolean;
  tagVersion: string;
  packageVersion: string;
  error?: string;
}

export function compareVersion(
  tag: string,
  packageVersion: string,
): VersionComparisonResult;

export function getPackageVersion(pkgPath?: string): string;

export function main(
  argv?: string[],
  env?: Record<string, string | undefined>,
  pkgPath?: string,
): number;
