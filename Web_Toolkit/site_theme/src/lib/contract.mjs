// ./Web_Toolkit/site_theme/src/lib/contract.mjs
/** Loads the token contract and validates a theme's tokens against it (presence + WCAG contrast pairs). */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrast, over, parseColor } from './color.mjs';

export const TEMPLATE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../templates/theme');

export function loadContract(file = path.join(TEMPLATE_ROOT, 'tokens.contract.json')) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function requiredTokens(contract) {
  return ['color', 'font', 'radius', 'space', 'shadow', 'motion', 'layout'].flatMap((group) => (contract[group] ?? []).map((entry) => entry.name));
}

/** @returns {{ errors: string[], warnings: string[], contrast: Array<{ text: string, on: string, ratio: number, min: number, ok: boolean }> }} */
export function validateTokens(tokens, contract = loadContract()) {
  const errors = [];
  const warnings = [];
  for (const name of requiredTokens(contract)) {
    if (!(name in tokens) || String(tokens[name]).trim() === '') errors.push(`missing token ${name}`);
  }
  for (const entry of contract.color ?? []) {
    const value = tokens[entry.name];
    if (value !== undefined && !parseColor(value) && !/^(var\(|color-mix\()/.test(String(value))) errors.push(`${entry.name} is not a color the validator can read: ${value}`);
  }
  const results = [];
  const bg = parseColor(tokens['--color-bg']);
  for (const rule of contract.contrast ?? []) {
    const text = parseColor(tokens[rule.text]);
    const surface = parseColor(tokens[rule.on]);
    if (!text || !surface) continue;
    const base = bg ? over(surface, bg) : surface;
    const ratio = contrast(over(text, base), base);
    const ok = ratio >= rule.min;
    results.push({ text: rule.text, on: rule.on, ratio: Number(ratio.toFixed(2)), min: rule.min, ok });
    if (!ok) errors.push(`${rule.text} on ${rule.on} is ${ratio.toFixed(2)}:1 (needs ${rule.min}:1)`);
  }
  return { errors, warnings, contrast: results };
}
