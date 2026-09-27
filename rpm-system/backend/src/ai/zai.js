// Direct z.ai (GLM) client. The community AI SDK provider can't pass GLM's
// built-in web_search tool, so we call z.ai's OpenAI-compatible endpoint
// directly. Yields the same event shape as service.runChat, and runs the same
// function tools (RPM actions, memory) through an OpenAI-style tool loop.

const ZAI_URL = 'https://api.z.ai/api/paas/v4/chat/completions';
const MAX_STEPS = 8;

// AI SDK tool() objects → OpenAI function-tool definitions.
function toFunctionTools(tools = {}) {
  return Object.entries(tools).map(([name, t]) => ({
    type: 'function',
    function: { name, description: t.description || '', parameters: t.inputSchema?.jsonSchema || { type: 'object', properties: {} } },
  }));
}

// Parse one SSE response into { text, toolCalls, usage, sources } while yielding text.
async function* readStream(res, acc) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let json;
      try { json = JSON.parse(data); } catch { continue; }
      if (json.error) throw new Error(`z.ai: ${json.error.message || JSON.stringify(json.error).slice(0, 200)}`);
      if (json.usage) {
        acc.usage.input += json.usage.prompt_tokens || 0;
        acc.usage.output += json.usage.completion_tokens || 0;
        acc.usage.cached += json.usage.prompt_tokens_details?.cached_tokens || 0;
      }
      const delta = json.choices?.[0]?.delta;
      if (delta?.content) { acc.text += delta.content; yield delta.content; }
      if (Array.isArray(delta?.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const i = tc.index ?? 0;
          const cur = acc.toolCalls[i] || (acc.toolCalls[i] = { id: '', name: '', args: '' });
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
        }
      }
      const refs = json.web_search || delta?.web_search;
      if (Array.isArray(refs)) {
        for (const r of refs) {
          const url = r.link || r.url;
          if (url) acc.sources.push({ url, title: r.title || r.name || url });
        }
      }
    }
  }
}

async function* streamZai({ apiKey, model, messages, webSearch, tools = {}, abortSignal }) {
  const fnTools = toFunctionTools(tools);
  const wire = messages.map(m => ({ role: m.role, content: m.content }));
  const usage = { input: 0, output: 0, cached: 0 };
  const sources = [];
  let textSoFar = '';

  for (let step = 0; step < MAX_STEPS; step++) {
    const body = { model, messages: wire, stream: true, stream_options: { include_usage: true } };
    const apiTools = [...fnTools];
    if (webSearch) apiTools.push({ type: 'web_search', web_search: { enable: true, search_result: true } });
    if (apiTools.length) body.tools = apiTools;

    const res = await fetch(ZAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: abortSignal,
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      const err = new Error(`z.ai HTTP ${res.status}: ${detail.slice(0, 300)}`);
      err.statusCode = res.status;
      throw err;
    }

    const acc = { text: '', toolCalls: [], usage, sources };
    let first = true;
    for await (const chunk of readStream(res, acc)) {
      let t = chunk;
      // Separate text that resumes after a tool step from the earlier sentence.
      if (first && step > 0 && textSoFar && !/\n\s*$/.test(textSoFar)) t = `\n\n${t.replace(/^\s+/, '')}`;
      first = false;
      textSoFar += t;
      yield { type: 'text', text: t };
    }

    const calls = acc.toolCalls.filter(c => c && c.name);
    if (!calls.length) break;

    // Run the requested tools, then feed the results back for the next step.
    wire.push({
      role: 'assistant',
      content: acc.text || null,
      tool_calls: calls.map((c, i) => ({ id: c.id || `call_${step}_${i}`, type: 'function', function: { name: c.name, arguments: c.args || '{}' } })),
    });
    for (let i = 0; i < calls.length; i++) {
      const c = calls[i];
      let args = {};
      try { args = c.args ? JSON.parse(c.args) : {}; } catch { args = null; }
      yield { type: 'tool_call', name: c.name, args: args || {} };
      let result;
      const t = tools[c.name];
      if (!t) result = { ok: false, error: `unknown tool ${c.name}` };
      else if (args === null) result = { ok: false, error: 'arguments were not valid JSON — retry with valid JSON' };
      else {
        try { result = await t.execute(args, { toolCallId: c.id, messages: [] }); }
        catch (e) { result = { ok: false, error: String(e.message || e).slice(0, 300) }; }
      }
      yield { type: 'tool_result', name: c.name, result };
      wire.push({ role: 'tool', tool_call_id: c.id || `call_${step}_${i}`, content: JSON.stringify(result ?? null) });
    }
    if (abortSignal?.aborted) return;
  }

  if (usage.input || usage.output) yield { type: 'usage', usage };
  const seen = new Set();
  yield { type: 'sources', sources: sources.filter(s => !seen.has(s.url) && seen.add(s.url)) };
}

module.exports = { streamZai, toFunctionTools };
