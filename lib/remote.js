/**
 * dsh-tendedero host Remote half.
 *
 * "tendedero/suggest" reads the Session transcript of the root agent and asks
 * the shared LLM service for short follow-up questions the user is most likely
 * to ask next. Mounted through DSH's authenticated Typert Gateway; the browser
 * installs the descriptor with ctx.remote.$mount in lib/client.js.
 */
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { SessionId } from '@deepseek-ai/dsh-session';
import { z } from 'zod';

const strictCodec = (typeSymbol, schema) => ({ mode: 'strict', typeSymbol, create: () => schema });

const RESULT = strictCodec('TendederoSuggestions', z.object({ questions: z.array(z.string().max(200)) }));

/** Client-side mount contribution: the same descriptors the host registers. */
export const TYPERT_REMOTE = {
  package: 'dsh-tendedero',
  descriptors: [{
    id: 'dsh-tendedero#tendedero/suggest',
    namespace: 'tendedero',
    service: 'tendedero',
    method: 'suggest',
    implementation: 'suggest',
    invocation: { kind: 'direct' },
    parameters: [{
      name: 'sessionId',
      wire: 'sessionId',
      source: 'json',
      codec: strictCodec('SessionId', z.string().min(1).max(256))
    }],
    result: RESULT
  }]
};

const SYSTEM = [
  'You generate follow-up questions for a chat assistant.',
  'Given the latest user request and the latest assistant answer, propose short questions the user is most likely to ask next.',
  'Rules:',
  '- Write in the same language as the conversation.',
  '- Each question is one sentence, concrete, and directly continueable as the next user message.',
  '- Do not repeat what was already answered; prefer deepening, applying, or verifying the result.',
  '- Output ONLY a JSON array of strings, no markdown, no commentary.'
].join('\n');

function textOf(message) {
  if (!message || !Array.isArray(message.content)) return '';
  return message.content
    .filter((b) => b !== null && typeof b === 'object' && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n');
}

function parseQuestions(raw, limit) {
  let text = String(raw).trim();
  const fence = text.match(new RegExp('\\x60\\x60\\x60(?:json)?([\\s\\S]*?)\\x60\\x60\\x60'));
  if (fence) text = fence[1];
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((q) => typeof q === 'string')
      .map((q) => q.replace(/\s+/g, ' ').trim())
      .filter((q) => q.length > 1 && q.length <= 160)
      .slice(0, limit);
  } catch {
    return [];
  }
}

export default class TendederoRemote extends TypertRemoteService {
  static inject = ['llm', 'typert', 'agents', 'tendederoConfig'];

  constructor(ctx) {
    super(ctx, 'tendedero');
    ctx.typert.register({
      package: 'dsh-tendedero',
      face: 'host',
      schemas: [],
      model: { services: [], events: [], objects: [] },
      invocations: TYPERT_REMOTE.descriptors
    });
  }

  /**
  * Route: explicit config, else the route recorded on the newest Assistant
  * message (the loop stamps provider and model onto its source), else the
  * first registered provider's first advertised model.
  */
  async resolveRoute(config, messages) {
    if (config.provider !== undefined && config.model !== undefined) {
      return { provider: config.provider, model: config.model };
    }
    for (const message of [...messages].reverse()) {
      if (message.role !== 'assistant') continue;
      const source = message.source;
      if (source !== null && typeof source === 'object' && typeof source.provider === 'string' && typeof source.model === 'string') {
        return { provider: source.provider, model: source.model };
      }
    }
    const providers = this.ctx.llm.listProviders();
    if (providers.length === 0) throw new Error('本机没有已注册的模型 provider');
    const models = await this.ctx.llm.listModels(providers[0].id);
    if (!Array.isArray(models) || models.length === 0) throw new Error('provider ' + providers[0].id + ' 没有可列出的模型');
    return { provider: providers[0].id, model: models[0].id };
  }

  async suggest(sessionId) {
    const config = this.ctx.tendederoConfig;
    if (!config.enabled) return { questions: [] };
    const agent = this.ctx.agents?.get(SessionId(sessionId));
    const session = agent?.session;
    if (session === void 0) return { questions: [] };
    let messages;
    try { messages = session.deriveMessages(); } catch { return { questions: [] }; }
    const answer = textOf([...messages].reverse().find((m) => m.role === 'assistant')).trim();
    if (answer === '') return { questions: [] };
    const request = textOf([...messages].reverse().find((m) => m.role === 'user')).trim();
    const input = [
      request === '' ? '' : 'Latest user request:\n' + request.slice(-2000),
      'Latest assistant answer:\n' + answer.slice(-6000),
      'Generate up to ' + config.maxQuestions + ' follow-up questions as a JSON array of strings.'
    ].filter(Boolean).join('\n\n');

    const route = await this.resolveRoute(config, messages);
    const signal = AbortSignal.timeout(config.timeoutMs);
    let call;
    try {
      call = await this.ctx.llm.prepareCall({ ...route, maxTokens: 400 }, signal, (controls, model) => {
        const effort = model.reasoning?.efforts?.[0];
        return effort === undefined ? controls : { ...controls, reasoningEffort: effort.id };
      });
    } catch (error) {
      throw new Error('模型 ' + route.provider + '/' + route.model + ' 不可用：' + String(error?.message ?? error));
    }
    let raw = '';
    try {
    for await (const chunk of call.stream({
      ...call.config,
      messages: [{ role: 'user', content: [{ type: 'text', text: input }] }],
      system: SYSTEM,
      sessionId,
      signal
    })) {
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') raw += chunk.text;
    }
    } catch (error) {
      throw new Error('模型 ' + route.provider + '/' + route.model + ' 生成失败：' + String(error?.message ?? error));
    }
    const questions = parseQuestions(raw, config.maxQuestions);
    if (questions.length === 0) throw new Error('模型没有返回可用的追问（原文：' + raw.slice(0, 60) + '）');
    return { questions };
  }
}
