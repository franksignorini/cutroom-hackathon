// Live tests of every model the crew may fall back on: each one must answer a forced tool call with valid JSON
// arguments, through the crew's own client (lib/llm.mjs), the way the Director does. The Critic's models must also read
// an image. One request per model (two for the vision ones). A provider without its key is skipped, not failed.
//
//   node --env-file=.env --env-file=web/.env --test pipeline/test/providers.test.mjs
//   CANDIDATES="groq:openai/gpt-oss-120b,gemini:gemini-3.8-flash" node ... --test ...   (test other ids)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PROVIDERS, createLLM, route, seesImages, tool, toolArgs } from '../lib/llm.mjs';

const CANDIDATES = (process.env.CANDIDATES ||
  [
    'groq:openai/gpt-oss-120b',
    'groq:qwen/qwen3.8-27b',
    'groq:openai/gpt-oss-20b',
    'gemini:gemini-3.8-flash',
    'gemini:gemini-3.5-flash',
    'gemini:gemini-2.5-flash',
    'gemini:gemini-3.1-flash-lite',
  ].join(',')).split(',').map((s) => s.trim()).filter(Boolean);

const hasKey = (m) => !!process.env[PROVIDERS[route(m).provider].env];

// A 64x36 PNG: the left half red, the right half blue (built here, so the test needs no file).
function png() {
  const { deflateSync } = process.getBuiltinModule('node:zlib');
  const w = 64, h = 36, rows = [];
  for (let y = 0; y < h; y++) {
    rows.push(0);
    for (let x = 0; x < w; x++) rows.push(...(x < w / 2 ? [230, 20, 20] : [20, 40, 230]));
  }
  const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]), len = Buffer.alloc(4), sum = Buffer.alloc(4);
    len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from(rows))), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}

const PLAN_TOOL = tool('write_plan', 'Write the plan of the trailer', {
  type: 'object',
  required: ['title', 'beats'],
  properties: {
    title: { type: 'string' },
    beats: { type: 'array', items: { type: 'object', required: ['kind', 'words'], properties: { kind: { type: 'string', enum: ['statement', 'card', 'title'] }, words: { type: 'array', items: { type: 'string' } } } } },
  },
});

for (const model of CANDIDATES) {
  test(`${model}: forced tool call with valid arguments`, { skip: !hasKey(model) && `no ${PROVIDERS[route(model).provider].env}`, timeout: 240_000 }, async () => {
    const log = [];
    const llm = createLLM({ models: [model], budget: 1, onLog: (m) => log.push(m) });
    const t0 = Date.now();
    const { message } = await llm.chat({
      messages: [
        { role: 'system', content: 'You are the Director of a 10-second trailer. Answer only by calling write_plan.' },
        { role: 'user', content: 'The idea: a lighthouse keeper lights the lamp one last time. Three beats: a statement, a card, the title.' },
      ],
      tools: [PLAN_TOOL],
      toolChoice: { type: 'function', function: { name: 'write_plan' } },
      maxTokens: 6000,
    }).catch((err) => { throw new Error(`${err.message}${log.length ? ` | ${log.join(' | ')}` : ''}`); });
    const plan = toolArgs(message, 'write_plan');
    assert.ok(plan, `no parsable plan: ${String(message.content ?? '').slice(0, 200)}`);
    assert.equal(typeof plan.title, 'string');
    assert.ok(Array.isArray(plan.beats) && plan.beats.length >= 2, `beats: ${JSON.stringify(plan.beats)?.slice(0, 200)}`);
    assert.ok(plan.beats.every((b) => Array.isArray(b.words) && b.words.length), 'every beat has words');
    console.log(`  ${model}: "${plan.title}", ${plan.beats.length} beats, ${llm.total.tokens} tokens, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  });

  if (seesImages(model))
    test(`${model}: reads an image (the Critic's contact sheet)`, { skip: !hasKey(model) && 'no key', timeout: 240_000 }, async () => {
      const llm = createLLM({ models: [model], budget: 1 });
      const { message } = await llm.chat({
        messages: [{ role: 'user', content: [
          { type: 'text', text: 'Which two colours fill this image, left half then right half? Answer with two words, like "green yellow".' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${png()}` } },
        ] }],
        vision: true,
        maxTokens: 3000,
      });
      const text = String(message.content ?? '').toLowerCase();
      assert.match(text, /red/, `answer: ${text.slice(0, 120)}`);
      assert.match(text, /blue/, `answer: ${text.slice(0, 120)}`);
      console.log(`  ${model}: sees "${text.trim().slice(0, 40)}"`);
    });
}
