export function toJsonSafe(value, name = 'value') {
  return normalizeJson(value, name, new WeakSet(), false);
}

export function validateJsonSafe(value, name = 'value') {
  try {
    toJsonSafe(value, name);
    return null;
  } catch (error) {
    return error.message;
  }
}

function normalizeJson(value, path, ancestors, inArray) {
  if (value === null) return null;
  if (value === undefined) {
    if (inArray) return null;
    throw new TypeError(`${path} contains undefined`);
  }

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number`);
      return value;
    case 'bigint':
    case 'function':
    case 'symbol':
      throw new TypeError(`${path} contains unsupported ${typeof value} data`);
    case 'object':
      break;
    default:
      throw new TypeError(`${path} contains unsupported data`);
  }

  if (ancestors.has(value)) throw new TypeError(`${path} contains a circular reference`);
  ancestors.add(value);
  try {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) throw new TypeError(`${path} contains an invalid Date`);
      return value.toISOString();
    }
    if (Array.isArray(value)) {
      return value.map((entry, index) => normalizeJson(entry, `${path}[${index}]`, ancestors, true));
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      if (typeof value.toJSON !== 'function') {
        throw new TypeError(`${path} contains a non-JSON object (${value.constructor?.name ?? 'unknown'})`);
      }
      return normalizeJson(value.toJSON(), `${path}.toJSON()`, ancestors, inArray);
    }

    const output = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) continue;
      output[key] = normalizeJson(entry, `${path}.${key}`, ancestors, false);
    }
    return output;
  } finally {
    ancestors.delete(value);
  }
}
