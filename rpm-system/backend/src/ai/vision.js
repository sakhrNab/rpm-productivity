// Photos and screenshots → text. A vision model transcribes the image (and describes any
// diagram), and the rest of the pipeline treats the result like any other document, so
// "Plan from a file" and the Assistant's "Ask about it" accept images with no other changes.
//
// The user's chat model is often text-only (DeepSeek, GLM), so the reader is chosen
// separately: the cheapest vision-capable model the user actually has a key for.

const { MODELS, getModelEntry, providerLabel } = require('./registry');
const { resolveKey } = require('./keys');
const { recordUsage } = require('./usage');
const { runChat, AiError } = require('./service');
const { ExtractError, MAX_TEXT } = require('./extract');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;               // Anthropic's per-image ceiling
// Cheapest first — transcription does not need a flagship.
const READERS = ['anthropic/claude-haiku-4-5', 'openai/gpt-5-mini', 'openai/gpt-4o-mini', 'openai/gpt-6-luna', 'anthropic/claude-sonnet-5', 'openai/gpt-5.6-luna'];

const PROMPT = `You are the eyes of a planning assistant. Read the attached image and write down what it contains.

1. Transcribe ALL visible text exactly, in reading order. Keep headings, bullet lists, numbering, dates, amounts and names. Render tables as rows with " | " between cells. Handwriting: best effort; mark anything unclear with [?].
2. If the image also holds something that is not text and matters for planning (a diagram, whiteboard sketch, calendar, chart, screenshot of an app, a photo of an object or place), add a short "Visual:" section describing it factually in a few lines.

Output only the transcription (plain text / Markdown). No preamble, no commentary. If the image has no readable text and nothing meaningful, output exactly: NO_CONTENT`;

// Which model will read the image for this user? Returns { key, entry } or null.
async function pickReader(pool, userId, preferredKey) {
  const order = [...READERS, preferredKey, ...MODELS.filter(m => m.vision).map(m => m.key)].filter(Boolean);
  const seen = new Set();
  const hasKey = new Map();
  for (const key of order) {
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = getModelEntry(key);
    if (!entry || !entry.vision) continue;
    if (!hasKey.has(entry.provider)) hasKey.set(entry.provider, !!(await resolveKey(pool, userId, entry.provider)));
    if (hasKey.get(entry.provider)) return { key, entry };
  }
  return null;
}

async function readImage({ pool, userId, buffer, mime, name, preferredKey, abortSignal }) {
  if (mime === 'image/heic' || mime === 'image/avif') {
    throw new ExtractError('This is an iPhone-format (HEIC) image the server can’t open. Re-save it as JPG or PNG — or upload it from Safari, which converts it for you.');
  }
  if (mime === 'image/unreadable') {
    throw new ExtractError('That doesn’t look like a valid image. Try a JPG, PNG, WebP or GIF.');
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new ExtractError(`That image is ${(buffer.length / 1048576).toFixed(1)} MB — images must be under 5 MB. Take a screenshot of it, or shrink it, and try again.`);
  }
  const reader = await pickReader(pool, userId, preferredKey);
  if (!reader) {
    throw new ExtractError('Reading a photo needs a vision model — add a Claude or OpenAI API key in Settings (DeepSeek and GLM can’t see images).');
  }

  let text = '', rawUsage = null;
  try {
    for await (const ev of runChat({
      pool, userId, modelKey: reader.key, abortSignal,
      messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'file', data: buffer, mediaType: mime }] }],
    })) {
      if (ev.type === 'text') text += ev.text;
      else if (ev.type === 'usage') rawUsage = ev.usage;
      else if (ev.type === 'error') throw new AiError('ai_error', ev.message || 'The image could not be read.');
    }
  } catch (e) {
    if (e instanceof AiError) throw new ExtractError(`${providerLabel(reader.entry.provider)} couldn’t read this image: ${e.message}`);
    throw e;
  }
  const usage = rawUsage ? await recordUsage(pool, { userId, modelKey: reader.key, feature: 'image_read', usage: rawUsage }) : null;

  text = text.trim();
  if (!text || /^NO_CONTENT\b/.test(text)) throw new ExtractError('I couldn’t find any text or anything to plan from in that image.');
  const truncated = text.length > MAX_TEXT;
  return {
    kind: 'image', text: truncated ? text.slice(0, MAX_TEXT) : text, chars: text.length, truncated,
    meta: { image: true, reader: reader.entry.label }, usage,
  };
}

module.exports = { readImage, pickReader, READERS, MAX_IMAGE_BYTES };
