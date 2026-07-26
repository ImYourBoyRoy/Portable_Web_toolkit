function parseIdentifier(identifier) {
  return /^\d+$/.test(identifier) ? Number(identifier) : identifier;
}

export function parseSemver(value) {
  const match = String(value || '').trim().match(
    /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/,
  );
  if (!match) return null;
  const coreIdentifiers = match.slice(1, 4);
  if (coreIdentifiers.some(
    (identifier) => identifier.length > 1 && identifier.startsWith('0'),
  )) {
    return null;
  }
  const prereleaseIdentifiers = match[4]?.split('.') || [];
  if (prereleaseIdentifiers.some(
    (identifier) => (
      !identifier
      || (/^\d+$/.test(identifier)
        && identifier.length > 1
        && identifier.startsWith('0'))
    ),
  )) {
    return null;
  }
  return {
    core: coreIdentifiers.map(Number),
    prerelease: prereleaseIdentifiers.map(parseIdentifier),
  };
}

export function compareSemver(left, right) {
  const parsedLeft = parseSemver(left);
  const parsedRight = parseSemver(right);
  if (!parsedLeft || !parsedRight) return null;

  for (let index = 0; index < 3; index += 1) {
    if (parsedLeft.core[index] < parsedRight.core[index]) return -1;
    if (parsedLeft.core[index] > parsedRight.core[index]) return 1;
  }

  if (!parsedLeft.prerelease.length && !parsedRight.prerelease.length) return 0;
  if (!parsedLeft.prerelease.length) return 1;
  if (!parsedRight.prerelease.length) return -1;

  const length = Math.max(
    parsedLeft.prerelease.length,
    parsedRight.prerelease.length,
  );
  for (let index = 0; index < length; index += 1) {
    const leftPart = parsedLeft.prerelease[index];
    const rightPart = parsedRight.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    if (typeof leftPart === 'number' && typeof rightPart !== 'number') return -1;
    if (typeof leftPart !== 'number' && typeof rightPart === 'number') return 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}
