// ./Web_Toolkit/shared/lib/semver-lite.mjs
/**
 * Zero-dependency semver for toolkit tooling: parsing, comparison, and range satisfaction for the range grammar that
 * npm packages actually publish in peerDependencies/dependencies: `||` unions, space-separated AND, comparators
 * (>=, >, <=, <, =), caret, tilde, x-ranges (1.x, 1.2.x, *), and hyphen ranges. Prerelease versions satisfy only
 * ranges whose comparator names the same major.minor.patch (npm's rule), which is enough to keep "latest stable".
 */

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parse(text) {
  const match = VERSION.exec(String(text ?? '').trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), pre: match[4] ? match[4].split('.') : [], raw: `${match[1]}.${match[2]}.${match[3]}${match[4] ? `-${match[4]}` : ''}` };
}

function comparePre(a, b) {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if (a[index] === undefined) return -1;
    if (b[index] === undefined) return 1;
    const left = /^\d+$/.test(a[index]) ? Number(a[index]) : a[index];
    const right = /^\d+$/.test(b[index]) ? Number(b[index]) : b[index];
    if (left === right) continue;
    if (typeof left === 'number' && typeof right === 'string') return -1;
    if (typeof left === 'string' && typeof right === 'number') return 1;
    return left < right ? -1 : 1;
  }
  return 0;
}

export function compare(a, b) {
  const left = typeof a === 'string' ? parse(a) : a;
  const right = typeof b === 'string' ? parse(b) : b;
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch || comparePre(left.pre, right.pre);
}

export function isStable(version) {
  const parsed = typeof version === 'string' ? parse(version) : version;
  return Boolean(parsed) && parsed.pre.length === 0;
}

function partial(token) {
  const match = /^v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?$/.exec(token);
  if (!match) return null;
  const num = (value) => (value === undefined || /^[xX*]$/.test(value) ? null : Number(value));
  return { major: num(match[1]), minor: num(match[2]), patch: num(match[3]), pre: match[4] ? match[4].split('.') : [] };
}

const lower = (p) => ({ major: p.major ?? 0, minor: p.minor ?? 0, patch: p.patch ?? 0, pre: p.pre });
const MIN = { major: 0, minor: 0, patch: 0, pre: [] };

/** One comparator set (AND of [op, version]) from a space-free primitive token like ^1.2.3 or >=1.0. */
function expand(operator, token) {
  const p = partial(token);
  if (!p) return null;
  if (p.major === null) return operator === '<' || operator === '>' ? [['<', MIN]] : [];
  switch (operator) {
    case '^': {
      const low = lower(p);
      let high;
      if (p.major > 0 || p.minor === null) high = { major: p.major + 1, minor: 0, patch: 0, pre: [] };
      else if (p.minor > 0 || p.patch === null) high = { major: 0, minor: p.minor + 1, patch: 0, pre: [] };
      else high = { major: 0, minor: 0, patch: p.patch + 1, pre: [] };
      return [['>=', low], ['<', high]];
    }
    case '~': {
      const low = lower(p);
      const high = p.minor === null ? { major: p.major + 1, minor: 0, patch: 0, pre: [] } : { major: p.major, minor: p.minor + 1, patch: 0, pre: [] };
      return [['>=', low], ['<', high]];
    }
    case '>=': return [['>=', lower(p)]];
    case '>': {
      if (p.patch === null) return [['>=', p.minor === null ? { major: p.major + 1, minor: 0, patch: 0, pre: [] } : { major: p.major, minor: p.minor + 1, patch: 0, pre: [] }]];
      return [['>', lower(p)]];
    }
    case '<=': {
      if (p.patch === null) return [['<', p.minor === null ? { major: p.major + 1, minor: 0, patch: 0, pre: [] } : { major: p.major, minor: p.minor + 1, patch: 0, pre: [] }]];
      return [['<=', lower(p)]];
    }
    case '<': return [['<', lower(p)]];
    default: {
      // exact or x-range
      if (p.patch !== null) return [['>=', lower(p)], ['<=', lower(p)]];
      const high = p.minor === null ? { major: p.major + 1, minor: 0, patch: 0, pre: [] } : { major: p.major, minor: p.minor + 1, patch: 0, pre: [] };
      return [['>=', lower(p)], ['<', high]];
    }
  }
}

function parseRange(range) {
  const text = String(range ?? '').trim();
  if (text === '' || text === '*' || text === 'latest') return [[]];
  const sets = [];
  for (const alternative of text.split('||')) {
    const hyphen = /^\s*(\S+)\s+-\s+(\S+)\s*$/.exec(alternative);
    let tokens = hyphen ? [`>=${hyphen[1]}`, `<=${hyphen[2]}`] : alternative.trim().split(/\s+/).filter(Boolean);
    // "> 1.0" written with a space after the operator
    const merged = [];
    for (let index = 0; index < tokens.length; index += 1) {
      if (/^(>=|<=|>|<|=|\^|~)$/.test(tokens[index]) && tokens[index + 1]) merged.push(tokens[index] + tokens[++index]);
      else merged.push(tokens[index]);
    }
    tokens = merged;
    const set = [];
    for (const token of tokens) {
      const operator = /^(>=|<=|>|<|=|\^|~)/.exec(token)?.[1] ?? '';
      const expanded = expand(operator === '=' ? '' : operator, token.slice(operator.length));
      if (!expanded) return null;
      set.push(...expanded);
    }
    sets.push(set);
  }
  return sets;
}

function test(version, [operator, bound]) {
  const result = compare(version, bound);
  switch (operator) {
    case '>=': return result >= 0;
    case '>': return result > 0;
    case '<=': return result <= 0;
    case '<': return result < 0;
    default: return result === 0;
  }
}

/** True when `version` satisfies `range`. Unparseable ranges (URLs, tags, workspace:) return false. */
export function satisfies(version, range) {
  const parsed = typeof version === 'string' ? parse(version) : version;
  if (!parsed) return false;
  const sets = parseRange(range);
  if (!sets) return false;
  return sets.some((set) => {
    if (!set.every((comparator) => test(parsed, comparator))) return false;
    if (parsed.pre.length === 0) return true;
    return set.some(([, bound]) => bound.pre.length > 0 && bound.major === parsed.major && bound.minor === parsed.minor && bound.patch === parsed.patch);
  });
}

export function validRange(range) {
  return parseRange(range) !== null;
}

/** Highest version in `versions` satisfying `range`, or null. */
export function maxSatisfying(versions, range) {
  let best = null;
  for (const version of versions) {
    if (!satisfies(version, range)) continue;
    if (best === null || compare(version, best) > 0) best = version;
  }
  return best;
}

export function major(version) {
  return parse(version)?.major ?? null;
}
