// Direct z.ai (GLM) client. The community AI SDK provider can't pass GLM's
// built-in web_search tool, so we call z.ai's OpenAI-compatible endpoint
// directly. Yields the same event shape as service.runChat.
//
// NOTE: exact streaming/search-result shape needs live-key confirmation; text
// streaming follows the standard OpenAI SSE format that z.ai implements.

const ZAI_URL = 'https://api.z.ai/api/paas/v4/chat/completions';

async function* streamZai({ apiKey, model, messages, webSearch }) {
  const body = { model, messages, stream: true };
  if (webSearch) {
    body.tools = [{ type: 'web_search', web_search: { enable: true, search_result: true } }];
  }

  const res = await fetch(ZAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`z.ai HTTP ${res.status}: ${detail.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const sources = [];
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
      const delta = json.choices?.[0]?.delta;
      if (delta?.content) yield { type: 'text', text: delta.content };
      const refs = json.web_search || delta?.web_search;
      if (Array.isArray(refs)) {
        for (const r of refs) {
          const url = r.link || r.url;
          if (url) sources.push({ url, title: r.title || r.name || url });
        }
      }
    }
  }
  yield { type: 'sources', sources };
}

module.exports = { streamZai };
