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

/** Prefer the cheapest reasoning effort so the small output budget is not spent on thinking. */
function lowestEffort(controls, model) {
  const efforts = model?.reasoning?.efforts;
  if (!Array.isArray(efforts) || efforts.length === 0) return controls;
  const cheap = ['off', 'none', 'minimal', 'low', 'default'];
  for (const wanted of cheap) {
    const hit = efforts.find((effort) => String(effort?.id ?? effort).toLowerCase().includes(wanted));
    if (hit !== undefined) return { ...controls, reasoningEffort: hit.id ?? hit };
  }
  return controls;
}

function textOf(message) {
  if (!message || !Array.isArray(message.content)) return '';
  return message.content
    .filter((b) => b !== null && typeof b === 'object' && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n');
}

function parseQuestions(raw, limit) {
  let text = String(raw).trim();
  const fence = text.match(new RegExp('```(?:json)?([\\s\\S]*?)```'));
  if (fence) text = fence[1];
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((item) => typeof item === 'string')
      .map((item) => item.replace(/\s+/g, ' ').trim())
      .filter((item) => item.length > 1 && item.length <= 160)
      .slice(0, limit);
  } catch {
    return [];
  }
}

/** Drain one stream: keep every text delta, the reasoning volume, and the terminal finish. */
async function drainStream(call, options) {
  let raw = '';
  let reasoningChars = 0;
  let finish;
  for await (const chunk of call.stream(options)) {
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') raw += chunk.text;
    else if (chunk.type === 'reasoning-delta') reasoningChars += chunk.text?.length ?? 0;
    else if (chunk.type === 'finish') finish = chunk.reason;
  }
  return { raw, reasoningChars, finish };
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

  /** Route: explicit config, else the newest Assistant message source, else first provider/model. */
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
    if (session === undefined) return { questions: [] };
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
      call = await this.ctx.llm.prepareCall({ ...route, maxTokens: 600 }, signal, lowestEffort);
    } catch (error) {
      throw new Error('模型 ' + route.provider + '/' + route.model + ' 不可用：' + String(error?.message ?? error));
    }
    const options = {
      ...call.config,
      messages: [{ role: 'user', content: [{ type: 'text', text: input }] }],
      system: SYSTEM,
      sessionId,
      signal
    };

    // DSH classifies a degenerate completion as EMPTY_RESPONSE and marks it safe
    // to retry: one quick retry absorbs occasional empty completions from gateways.
    let drained;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        drained = await drainStream(call, options);
      } catch (error) {
        throw new Error('模型 ' + route.provider + '/' + route.model + ' 生成失败：' + String(error?.message ?? error));
      }
      const finish = drained.finish;
      if (finish?.kind === 'error') {
        const failure = finish.failure;
        const code = failure?.code ?? 'ERROR';
        if (code === 'EMPTY_RESPONSE' && attempt === 1) continue;
        throw new Error('模型 ' + route.provider + '/' + route.model + ' 调用失败（' + code + '）：' + String(failure?.message ?? '未知错误'));
      }
      if (finish?.kind === 'aborted') throw new Error('生成已被取消');
      if (drained.raw.trim() === '') {
        if (attempt === 1) continue;
        if (drained.reasoningChars > 0) {
          throw new Error('模型 ' + route.provider + '/' + route.model + ' 只输出了思考内容（' + drained.reasoningChars + ' 字符）没有正文；请调低该模型的推理强度，或在 dsh-tendedero 配置里指定 provider/model');
        }
        throw new Error('模型 ' + route.provider + '/' + route.model + ' 返回了空响应（EMPTY_RESPONSE），已自动重试一次仍为空');
      }
      break;
    }
    const questions = parseQuestions(drained.raw, config.maxQuestions);
    if (questions.length === 0) {
      throw new Error('模型没有返回可用的追问（原文：' + drained.raw.slice(0, 60) + '）');
    }
    return { questions };
  }
}
