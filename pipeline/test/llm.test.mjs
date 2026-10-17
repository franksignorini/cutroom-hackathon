// Offline tests of the crew's model fallback (lib/llm.mjs), with fetch stubbed: no network, no quota.
//   node --test pipeline/test/llm.test.mjs
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { BudgetError, createLLM, route } from '../lib/llm.mjs';

const real = globalThis.fetch;
let calls;
/** answers: url substring -> (body) => [status, json] */
function stub(answers) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, model: body.model, auth: init.headers.authorization, body });
    const key = Object.keys(answers).find((k) => url.includes(k));
    const [status, json] = answers[key](body);
    return { ok: status < 400, status, json: async () => json };
  };
}
const okAnswer = (text = 'hi') => [200, { model: 'm', choices: [{ message: { content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 2 } }];
const keys = { openrouter: 'or-key', groq: 'groq-key', gemini: 'g-key' };
const ask = (llm) => llm.chat({ messages: [{ role: 'user', content: 'x' }] });

beforeEach(() => { calls = []; });
afterEach(() => { globalThis.fetch = real; });

test('route: a prefix names the provider, no prefix is OpenRouter', () => {
  assert.deepEqual(route('groq:openai/gpt-oss-120b'), { provider: 'groq', id: 'openai/gpt-oss-120b' });
  assert.deepEqual(route('gemini:gemini-3.8-flash'), { provider: 'gemini', id: 'gemini-3.8-flash' });
  assert.deepEqual(route('nvidia/nemotron-3-ultra-550b-a55b:free'), { provider: 'openrouter', id: 'nvidia/nemotron-3-ultra-550b-a55b:free' });
  assert.deepEqual(route('openrouter/free'), { provider: 'openrouter', id: 'openrouter/free' });
});

test('route: @think and @nothink set the thinking', () => {
  assert.deepEqual(route('anthropic/claude-opus-5.5@think=medium'), { provider: 'openrouter', id: 'anthropic/claude-opus-5.5', reasoning: { effort: 'medium' } });
  assert.deepEqual(route('anthropic/claude-opus-5.5@think'), { provider: 'openrouter', id: 'anthropic/claude-opus-5.5', reasoning: { effort: 'medium' } });
  assert.deepEqual(route('deepseek/deepseek-v4-pro@nothink'), { provider: 'openrouter', id: 'deepseek/deepseek-v4-pro', reasoning: { enabled: false } });
});

test('Premium roles: Opus thinks for the Director and the Critic, DeepSeek writes the shot without thinking', async () => {
  stub({ openrouter: () => okAnswer() });
  const llm = createLLM({
    keys,
    models: {
      director: ['anthropic/claude-opus-5.5@think=medium', 'x/free:free'],
      builder: ['deepseek/deepseek-v4-pro@nothink', 'anthropic/claude-opus-5.5'],
      critic: ['anthropic/claude-opus-5.5@think=low', 'deepseek/deepseek-v4.1-flash'],
    },
  });
  const tools = [{ type: 'function', function: { name: 't', parameters: { type: 'object' } } }];
  await llm.chat({ role: 'director', messages: [{ role: 'user', content: 'x' }], tools, temperature: 0.8 });
  await llm.chat({ role: 'builder', messages: [{ role: 'user', content: 'x' }], temperature: 0.7 });
  await llm.chat({ role: 'critic', messages: [{ role: 'user', content: 'x' }], vision: true, temperature: 0.3 });
  assert.deepEqual(calls.map((c) => [c.model, c.body.reasoning, c.body.temperature]), [
    ['anthropic/claude-opus-5.5', { effort: 'medium' }, undefined], // thinking on Anthropic: default temperature only
    ['deepseek/deepseek-v4-pro', { enabled: false }, 0.7],
    ['anthropic/claude-opus-5.5', { effort: 'low' }, undefined],
  ]);
});

test('a role falls back along its own chain, sharing cooldowns and budget', async () => {
  stub({ openrouter: (b) => (b.model.startsWith('deepseek/deepseek-v4-pro') ? [402, { error: { message: 'This request requires more credits' } }] : okAnswer(b.model)) });
  const llm = createLLM({ keys, models: { director: ['a/plan:free'], builder: ['deepseek/deepseek-v4-pro@nothink', 'anthropic/claude-opus-5.5'] }, budget: 5 });
  assert.equal((await llm.chat({ role: 'builder', messages: [] })).message.content, 'anthropic/claude-opus-5.5');
  assert.equal(llm.dead.has('deepseek/deepseek-v4-pro@nothink'), true, 'no credit: dropped for the job');
  assert.equal((await llm.chat({ role: 'director', messages: [] })).message.content, 'a/plan:free');
  assert.equal(llm.total.requests, 3);
});

test('Anthropic refuses a forced tool with thinking: the call is retried without tool_choice', async () => {
  stub({ openrouter: (b) => (b.tool_choice ? [400, { error: { message: 'Thinking may not be enabled when tool_choice forces tool use.' } }] : okAnswer('planned')) });
  const llm = createLLM({ keys, models: ['anthropic/claude-opus-5.5@think=medium'] });
  const { message } = await llm.chat({ messages: [], tools: [{ type: 'function', function: { name: 't' } }], toolChoice: { type: 'function', function: { name: 't' } } });
  assert.equal(message.content, 'planned');
  assert.equal(calls.length, 2);
  assert.ok(calls[0].body.tool_choice && !calls[1].body.tool_choice);
});

test('Opus 5.5 refuses a forced tool (the reason is in metadata.raw): retried without tool_choice, not dropped', async () => {
  const opusError = { error: { message: 'Provider returned error', metadata: { raw: JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'tool_choice: type "tool" and "any" are not supported for this model.' } }), provider_name: 'Azure' } } };
  stub({ openrouter: (b) => (b.tool_choice ? [400, opusError] : okAnswer('opus plan')) });
  const llm = createLLM({ keys, models: ['anthropic/claude-opus-5.5@think=medium', 'x/free:free'] });
  const { message, model } = await llm.chat({ messages: [], tools: [{ type: 'function', function: { name: 't' } }], toolChoice: { type: 'function', function: { name: 't' } } });
  assert.equal(message.content, 'opus plan');
  assert.deepEqual(calls.map((c) => [c.model, !!c.body.tool_choice]), [['anthropic/claude-opus-5.5', true], ['anthropic/claude-opus-5.5', false]]);
  assert.equal(llm.dead.has('anthropic/claude-opus-5.5@think=medium'), false);
  assert.equal(model, 'm');
  // The next call goes straight out with the tool optional: no second wasted request.
  await llm.chat({ messages: [], tools: [{ type: 'function', function: { name: 't' } }], toolChoice: { type: 'function', function: { name: 't' } } });
  assert.equal(calls.length, 3);
  assert.equal(!!calls[2].body.tool_choice, false);
});

test('a model that never answers times out and the next one takes over', async () => {
  calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ model: body.model });
    if (body.model === 'slow/model:free') {
      // DeepSeek once held requests for 90 s and sent nothing: hang until the client gives up.
      return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))));
    }
    return { ok: true, status: 200, json: async () => okAnswer('fast')[1] };
  };
  const logs = [];
  const llm = createLLM({ keys, models: ['slow/model:free', 'groq:fast'], onLog: (m) => logs.push(m) });
  const t0 = Date.now();
  const { message } = await llm.chat({ messages: [], timeoutMs: 200 });
  assert.equal(message.content, 'fast');
  assert.ok(Date.now() - t0 < 2000, 'gave up on the slow model quickly');
  assert.match(logs.join(' | '), /no answer in 0 s|no answer in/);
});

test('each provider gets its own URL, key and bare model id', async () => {
  stub({ openrouter: () => okAnswer(), groq: () => okAnswer(), generativelanguage: () => okAnswer() });
  for (const m of ['x/y:free', 'groq:openai/gpt-oss-120b', 'gemini:gemini-3.8-flash']) await ask(createLLM({ models: [m], keys }));
  assert.deepEqual(calls.map((c) => [new URL(c.url).host, c.auth, c.model]), [
    ['openrouter.ai', 'Bearer or-key', 'x/y:free'],
    ['api.groq.com', 'Bearer groq-key', 'openai/gpt-oss-120b'],
    ['generativelanguage.googleapis.com', 'Bearer g-key', 'gemini-3.8-flash'],
  ]);
  assert.ok(calls[0].body.usage && !calls[1].body.usage && !calls[2].body.usage, 'usage accounting only on OpenRouter');
});

test('OpenRouter rate-limited: the next provider answers', async () => {
  stub({ openrouter: () => [429, { error: { message: 'Rate limit exceeded: free-models-per-day' } }], groq: () => okAnswer('from groq') });
  const llm = createLLM({ models: ['a/b:free', 'groq:openai/gpt-oss-120b'], keys });
  const { message, model } = await ask(llm);
  assert.equal(message.content, 'from groq');
  assert.equal(model, 'm');
  assert.deepEqual(calls.map((c) => c.model), ['a/b:free', 'openai/gpt-oss-120b']);
});

test('OpenRouter down with an error inside a 200: still falls through', async () => {
  stub({ openrouter: () => [200, { error: { message: 'Upstream error from Nvidia: Service temporarily overloaded' } }], generativelanguage: () => okAnswer('from gemini') });
  const { message } = await ask(createLLM({ models: ['n/u:free', 'gemini:gemini-3.8-flash'], keys }));
  assert.equal(message.content, 'from gemini');
});

test('a tool call that misses the schema cools the model down instead of dropping it', async () => {
  let n = 0;
  stub({ groq: () => (n++ === 0 ? [400, { error: { message: 'tool call validation failed: parameters for tool write_plan did not match schema' } }] : okAnswer('groq')), generativelanguage: () => okAnswer('gemini') });
  const llm = createLLM({ models: ['groq:a', 'gemini:b'], keys });
  assert.equal((await ask(llm)).message.content, 'gemini');
  assert.equal(llm.dead.has('groq:a'), false);
});

test('a bad key drops every model of that provider at once', async () => {
  stub({ groq: () => [401, { error: { message: 'Invalid API Key' } }], generativelanguage: () => okAnswer('ok') });
  const llm = createLLM({ models: ['groq:a', 'groq:b', 'gemini:c'], keys });
  await ask(llm);
  assert.deepEqual(calls.map((c) => c.model), ['a', 'c'], 'groq:b is never tried after the 401');
  await ask(llm);
  assert.deepEqual(calls.map((c) => c.model), ['a', 'c', 'c']);
});

test('a model without its provider key is skipped, not fatal', async () => {
  stub({ openrouter: () => okAnswer('or') });
  const logs = [];
  const llm = createLLM({ models: ['groq:a', 'x/y:free'], keys: { openrouter: 'k', groq: '', gemini: '' }, onLog: (m) => logs.push(m) });
  assert.equal((await ask(llm)).message.content, 'or');
  assert.match(logs.join(' '), /GROQ_API_KEY/);
});

test('no key at all: a clear error', () => {
  assert.throws(() => createLLM({ models: ['groq:a'], keys: { openrouter: '', groq: '', gemini: '' } }), /no model has a key/);
});

test('the request budget is enforced across providers', async () => {
  stub({ openrouter: () => [503, { error: { message: 'busy' } }], groq: () => okAnswer('groq') });
  const llm = createLLM({ models: ['a/b:free', 'groq:c'], keys, budget: 2 });
  assert.equal((await ask(llm)).message.content, 'groq'); // 2 requests: the failed one counts too
  await assert.rejects(ask(llm), BudgetError);
  assert.equal(calls.length, 2);
});

test('every model cooling down: a clear error, no request spent', async () => {
  stub({ openrouter: () => [429, { error: { message: 'rate limited' } }] });
  const llm = createLLM({ models: ['nvidia/nemotron-x:free'], keys }) // a slow model: a fast one is waited for up to a minute;
  await assert.rejects(ask(llm), /rate limited/);
  await assert.rejects(ask(llm), /busy/);
  assert.equal(calls.length, 1);
});

test('vision asks only models that see images', async () => {
  stub({ groq: () => okAnswer('groq'), generativelanguage: () => okAnswer('gemini') });
  const llm = createLLM({ models: ['groq:openai/gpt-oss-120b', 'gemini:gemini-3.8-flash'], keys });
  const { message } = await llm.chat({ messages: [{ role: 'user', content: 'x' }], vision: true });
  assert.equal(message.content, 'gemini');
  assert.deepEqual(calls.map((c) => c.model), ['gemini-3.8-flash']);
});

test('a stream becomes one answer: content, a tool call in pieces, usage, keep-alives ignored', async () => {
  const { readStream } = await import('../lib/llm.mjs');
  const sse = [
    ': OPENROUTER PROCESSING',
    'data: {"model":"deepseek/deepseek-v4-pro","choices":[{"delta":{"reasoning":"hmm"}}]}',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"write_plan","arguments":"{\\"ti"}}]}}]}',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"tle\\":\\"X\\"}"}}]},"finish_reason":"tool_calls"}]}',
    'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"cost":0.001}}',
    'data: [DONE]',
  ].join('\n') + '\n';
  const body = new Response(sse).body; // split mid-line on purpose
  const progress = { chars: 0, at: 0 };
  const j = await readStream({ body }, progress);
  assert.equal(j.model, 'deepseek/deepseek-v4-pro');
  assert.equal(j.choices[0].finish_reason, 'tool_calls');
  assert.deepEqual(JSON.parse(j.choices[0].message.tool_calls[0].function.arguments), { title: 'X' });
  assert.equal(j.usage.cost, 0.001);
  assert.ok(progress.chars > 0 && progress.at > 0);
});

test('keep-alives count as life only once the answer has started', async () => {
  const { readStream } = await import('../lib/llm.mjs');
  const before = { chars: 0, at: 0 };
  await readStream({ body: new Response(': OPENROUTER PROCESSING\n').body }, before);
  assert.equal(before.at, 0);
  const after = { chars: 0, at: 0 };
  await readStream({ body: new Response('data: {"choices":[{"delta":{"content":"a"}}]}\n: OPENROUTER PROCESSING\n').body }, after);
  assert.ok(after.started && after.at > 0);
});

test('the money cap: once the answers cost maxUsd, the next request is refused, not sent', async () => {
  stub({ openrouter: () => [200, { model: 'm', choices: [{ message: { content: 'x' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.6 } }] });
  const llm = createLLM({ keys, models: ['deepseek/deepseek-v4-pro'], budget: 10, maxUsd: 1 });
  await ask(llm);
  await ask(llm); // $0.60 < $1: still allowed, ends at $1.20
  await assert.rejects(ask(llm), (e) => e instanceof BudgetError && /cost cap/.test(e.message));
  assert.equal(calls.length, 2);
});

test('a quota that comes back in hours drops the model for the job', async () => {
  stub({ generativelanguage: () => [429, [{ error: { code: 429, message: 'You exceeded your current quota. Please retry in 8h22m41.2s.' } }]], groq: () => okAnswer('groq') });
  const llm = createLLM({ models: ['gemini:gemini-3.5-flash', 'groq:openai/gpt-oss-120b'], keys });
  assert.equal((await llm.chat({ messages: [{ role: 'user', content: 'x' }] })).message.content, 'groq');
  assert.equal((await llm.chat({ messages: [{ role: 'user', content: 'x' }] })).message.content, 'groq');
  assert.equal(calls.filter((c) => c.model === 'gemini-3.5-flash').length, 1);
});

test('fast: a slow free model is never asked, and with none left the call fails at once', async () => {
  stub({ groq: () => [429, { error: { message: 'Rate limit reached. Please try again in 2m30s.' } }], openrouter: () => okAnswer('slow') });
  const llm = createLLM({ models: ['groq:openai/gpt-oss-120b', 'nvidia/nemotron-x:free'], keys });
  await assert.rejects(llm.chat({ messages: [{ role: 'user', content: 'x' }], fast: true }));
  assert.ok(!calls.some((c) => /nemotron/.test(c.model)));
});
