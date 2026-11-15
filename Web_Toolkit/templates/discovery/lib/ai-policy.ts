// ./src/lib/discovery/ai-policy.ts
/**
 * AI crawler policy shared by robots.txt and ai.txt. The policy itself lives in siteConfig.aiPolicy; this file only
 * turns it into directives. Named groups make the intent explicit, and each repeats the Disallow list because a crawler
 * that matches its own group ignores the `*` group.
 */
import { siteConfig } from '../site-config';

export const AI_USER_AGENTS = [
  // OpenAI
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
  // Anthropic
  'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'anthropic-ai',
  // Google and Microsoft
  'Googlebot', 'Google-Extended', 'Google-CloudVertexBot', 'Bingbot',
  // Perplexity, Apple, Meta, Amazon, others
  'PerplexityBot', 'Perplexity-User', 'Applebot', 'Applebot-Extended',
  'Meta-ExternalAgent', 'Meta-ExternalFetcher', 'FacebookBot', 'Amazonbot',
  'CCBot', 'DuckAssistBot', 'MistralAI-User', 'cohere-ai', 'YouBot', 'Bytespider', 'Diffbot',
];

const yesNo = (value: boolean) => (value ? 'yes' : 'no');

export function contentSignal(): string {
  const { search, aiInput, aiTrain } = siteConfig.aiPolicy;
  return `search=${yesNo(search)}, ai-input=${yesNo(aiInput)}, ai-train=${yesNo(aiTrain)}`;
}

export function aiPolicySummary(): string {
  const { search, aiInput, aiTrain } = siteConfig.aiPolicy;
  const allowed = [search && 'search', aiInput && 'AI answers', aiTrain && 'AI training'].filter(Boolean);
  return allowed.length
    ? `Public pages may be used for ${allowed.join(', ')}.`
    : 'Public pages may not be used for search, AI answers or AI training.';
}

/** Crawlers whose purpose is model training; blocked when `aiPolicy.aiTrain` is false. */
const TRAINING_AGENTS = new Set([
  'GPTBot', 'ClaudeBot', 'anthropic-ai', 'Google-Extended', 'Google-CloudVertexBot', 'Applebot-Extended',
  'Meta-ExternalAgent', 'CCBot', 'cohere-ai', 'Bytespider', 'Diffbot',
]);
/** Agents that fetch a page to answer a user's question or build an AI answer; blocked when `aiPolicy.aiInput` is false. */
const AI_INPUT_AGENTS = new Set([
  'ChatGPT-User', 'Claude-User', 'Perplexity-User', 'Meta-ExternalFetcher', 'MistralAI-User', 'DuckAssistBot', 'YouBot',
]);

/** robots.txt body for an indexable production host. `disallow` lists paths no crawler needs (for example '/api/contact'). */
export function robotsAiGroups(disallow: string[] = []): string[] {
  const { aiTrain, aiInput } = siteConfig.aiPolicy;
  const open = ['Allow: /', ...disallow.map((path) => `Disallow: ${path}`)];
  const closed = ['Disallow: /'];
  const rulesFor = (agent: string) => {
    if (!aiTrain && TRAINING_AGENTS.has(agent)) return closed;
    if (!aiInput && AI_INPUT_AGENTS.has(agent)) return closed;
    return open;
  };
  return [
    'User-agent: *',
    `Content-Signal: ${contentSignal()}`,
    ...open,
    '',
    '# Named crawlers, declared so the policy is explicit.',
    ...AI_USER_AGENTS.flatMap((agent) => [`User-agent: ${agent}`, ...rulesFor(agent), '']),
  ];
}
