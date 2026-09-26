/** @deprecated Import from './llm' (provider-neutral). Kept so older imports keep compiling. */
export { LlmError as ClaudeError, type LlmDeps as ClaudeDeps, type LlmUsage as ClaudeUsage, type Effort } from './types';
export { anthropicJson as claudeJson } from './anthropic';
export { defaultTimeoutMs, effortFor } from './llm';
import { modelFor } from './llm';
export const defaultModel = () => modelFor('anthropic');
