/**
 * dsh-tendedero host half.
 *
 * Provides the resolved plugin configuration consumed by the Remote half.
 * The clothesline itself is a pure browser surface; this entry only activates
 * the package and publishes config.
 */
export const name = 'dsh-tendedero';

export function apply(ctx, config = {}) {
  const maxQuestions = Number.isInteger(config.maxQuestions) ? Math.min(Math.max(config.maxQuestions, 1), 5) : 3;
  ctx.provide('tendederoConfig', Object.freeze({
    enabled: config.enabled !== false,
    provider: typeof config.provider === 'string' && config.provider !== '' ? config.provider : undefined,
    model: typeof config.model === 'string' && config.model !== '' ? config.model : undefined,
    maxQuestions,
    timeoutMs: Number.isInteger(config.timeoutMs) ? Math.max(config.timeoutMs, 5000) : 45000
  }));
}
