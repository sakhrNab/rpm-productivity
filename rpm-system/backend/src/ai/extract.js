// Turn an uploaded file into plain text a model can plan from.
//
// Text formats are decoded directly; HTML/RTF are stripped; PDFs go through unpdf;
// Office Open XML (docx/xlsx/pptx) and OpenDocument (odt/ods/odp) are zip archives
// of XML, read with a small built-in zip reader (no extra dependencies, bounded
// against zip bombs). Anything else is accepted only if it is actually text.

const zlib = require('zlib');
const path = require('path');

const MAX_UNZIPPED = 40 * 1024 * 1024;   // total inflated bytes we'll read from one archive
const MAX_ENTRIES = 5000;
const MAX_TEXT = 60000;                   // characters handed to the model

class ExtractError extends Error {
  constructor(message) { super(message); this.name = 'ExtractError'; this.code = 'unsupported_file'; }
}

// ---------- zip ----------
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ExtractError('This file looks damaged (not a valid Office/zip document).');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  if (count > MAX_ENTRIES) throw new ExtractError('This archive has too many entries to read.');
  const entries = new Map();
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const size = buf.readUInt32LE(off + 24);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    off += 46 + nameLen + extraLen + commentLen;
    entries.set(name, { method, compSize, size, local });
    total += size;
  }
  if (total > MAX_UNZIPPED) throw new ExtractError('This document is too large to read (over 40 MB uncompressed).');
  return {
    names: [...entries.keys()],
    read(name) {
      const e = entries.get(name);
      if (!e) return null;
      if (buf.readUInt32LE(e.local) !== 0x04034b50) return null;
      const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
      const data = buf.subarray(start, start + e.compSize);
      if (e.method === 0) return data.toString('utf8');
      if (e.method === 8) return zlib.inflateRawSync(data, { maxOutputLength: MAX_UNZIPPED }).toString('utf8');
      return null;
    },
  };
}

// ---------- xml helpers ----------
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', middot: '·', copy: '©', reg: '®', trade: '™', euro: '€' };
function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}
const tidy = (s) => s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const byNumber = (re) => (a, b) => Number((a.match(re) || [])[1]) - Number((b.match(re) || [])[1]);

function docxText(zip) {
  const parts = ['word/document.xml', ...zip.names.filter(n => /^word\/(footnotes|endnotes)\.xml$/.test(n))];
  let out = '';
  for (const p of parts) {
    const xml = zip.read(p);
    if (!xml) continue;
    const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<\/w:p>|<w:tab\/>|<w:br\/>|<w:pStyle w:val="(Heading\d|Title)"/g;
    let m, line = '', prefix = '';
    while ((m = re.exec(xml))) {
      if (m[1] !== undefined) line += m[1];
      else if (m[2]) prefix = m[2] === 'Title' ? '# ' : `${'#'.repeat(Math.min(6, Number(m[2].slice(7)) + 1))} `;
      else if (m[0] === '<w:tab/>') line += '\t';
      else if (m[0] === '<w:br/>') line += '\n';
      else { out += (line.trim() ? prefix + line : '') + '\n'; line = ''; prefix = ''; }
    }
    out += line;
  }
  return decodeEntities(out);
}

function xlsxText(zip) {
  const shared = [];
  const sst = zip.read('xl/sharedStrings.xml');
  if (sst) for (const si of sst.match(/<si>[\s\S]*?<\/si>/g) || []) shared.push((si.match(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(''));
  const wb = zip.read('xl/workbook.xml') || '';
  const sheetNames = [...wb.matchAll(/<sheet\s[^>]*name="([^"]*)"/g)].map(m => decodeEntities(m[1]));
  const sheets = zip.names.filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort(byNumber(/sheet(\d+)\.xml$/));
  let out = '';
  sheets.forEach((s, i) => {
    const xml = zip.read(s) || '';
    out += `## Sheet: ${sheetNames[i] || `Sheet ${i + 1}`}\n`;
    for (const row of xml.match(/<row[\s\S]*?<\/row>/g) || []) {
      const cells = [];
      for (const c of row.match(/<c\s[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
        const type = (c.match(/\st="([^"]+)"/) || [])[1];
        const v = (c.match(/<v>([^<]*)<\/v>/) || [])[1];
        if (type === 's') cells.push(shared[Number(v)] ?? '');
        else if (type === 'inlineStr') cells.push((c.match(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(''));
        else cells.push(v ?? '');
      }
      if (cells.some(x => String(x).trim())) out += cells.join('\t') + '\n';
    }
    out += '\n';
  });
  return decodeEntities(out);
}

function pptxText(zip) {
  const slides = zip.names.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort(byNumber(/slide(\d+)\.xml$/));
  return decodeEntities(slides.map((s, i) => {
    const xml = zip.read(s) || '';
    const text = xml.replace(/<\/a:p>/g, '\n').replace(/<a:br\/>/g, '\n').match(/<a:t>[^<]*<\/a:t>|\n/g) || [];
    return `## Slide ${i + 1}\n` + text.map(t => t.replace(/<\/?a:t>/g, '')).join('');
  }).join('\n\n'));
}

function odfText(zip) {
  const xml = zip.read('content.xml');
  if (!xml) throw new ExtractError('This OpenDocument file has no readable content.');
  return decodeEntities(xml
    .replace(/<text:tab\/>/g, '\t').replace(/<text:line-break\/>/g, '\n')
    .replace(/<\/(text:p|text:h|table:table-row)>/g, '\n').replace(/<\/table:table-cell>/g, '\t')
    .replace(/<[^>]+>/g, ''));
}

// ---------- markup ----------
function htmlText(html) {
  return decodeEntities(String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, '')
    .replace(/<title[^>]*>([\s\S]*?)<\/title>/i, '# $1\n')
    .replace(/<h([1-6])[^>]*>/gi, (m, n) => `\n${'#'.repeat(Number(n))} `)
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|table|ul|ol|blockquote|header|footer|pre)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '\t')
    .replace(/<[^>]+>/g, ''));
}

function rtfText(rtf) {
  let s = String(rtf);
  s = s.replace(/\{\\\*[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, '');          // ignorable destinations
  s = s.replace(/\\par[d]?\b ?/g, '\n').replace(/\\tab\b ?/g, '\t').replace(/\\line\b ?/g, '\n');
  s = s.replace(/\\'([0-9a-f]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16)));
  s = s.replace(/\\u(-?\d+)\??/g, (m, n) => String.fromCharCode((Number(n) + 65536) % 65536));
  s = s.replace(/\\[a-z]+-?\d* ?/gi, '').replace(/\\([{}\\])/g, '$1').replace(/[{}]/g, '');
  return s;
}

// Accept unknown extensions only when the bytes really are text.
function looksLikeText(buf) {
  const sample = buf.subarray(0, 64 * 1024);
  if (sample.includes(0)) return false;
  const s = sample.toString('utf8');
  let bad = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c === 0xfffd || (c < 32 && c !== 9 && c !== 10 && c !== 13)) bad++;
  }
  return bad / Math.max(1, s.length) < 0.01;
}

const TEXT_EXT = new Set(['.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.yaml', '.yml', '.xml', '.log', '.ini', '.toml', '.ics', '.vtt', '.srt', '.tex', '.org', '.rst', '.adoc']);

async function extractText(buffer, originalName = '') {
  if (!buffer || !buffer.length) throw new ExtractError('The file is empty.');
  const ext = path.extname(String(originalName)).toLowerCase();
  let kind, text, meta = {};

  if (ext === '.pdf' || buffer.subarray(0, 5).toString() === '%PDF-') {
    kind = 'pdf';
    const { extractText: pdfText, getDocumentProxy } = await import('unpdf');
    try {
      const doc = await getDocumentProxy(new Uint8Array(buffer));
      const r = await pdfText(doc, { mergePages: true });
      text = r.text; meta.pages = r.totalPages;
    } catch { throw new ExtractError('Could not read this PDF (it may be encrypted or damaged).'); }
    if (!String(text).trim()) throw new ExtractError('This PDF has no selectable text (it may be a scan). Try a text-based PDF or paste the text.');
  } else if (['.docx', '.docm', '.dotx'].includes(ext)) {
    kind = 'docx'; text = docxText(readZip(buffer));
  } else if (['.xlsx', '.xlsm'].includes(ext)) {
    kind = 'xlsx'; text = xlsxText(readZip(buffer));
  } else if (['.pptx', '.pptm'].includes(ext)) {
    kind = 'pptx'; text = pptxText(readZip(buffer));
  } else if (['.odt', '.ods', '.odp'].includes(ext)) {
    kind = ext.slice(1); text = odfText(readZip(buffer));
  } else if (['.doc', '.xls', '.ppt'].includes(ext)) {
    const modern = { '.doc': '.docx', '.xls': '.xlsx or .csv', '.ppt': '.pptx' }[ext];
    throw new ExtractError(`Old binary ${ext} files aren't supported — save it as ${modern} (or PDF) and upload that.`);
  } else if (['.html', '.htm', '.xhtml'].includes(ext)) {
    kind = 'html'; text = htmlText(buffer.toString('utf8'));
  } else if (ext === '.rtf') {
    kind = 'rtf'; text = rtfText(buffer.toString('utf8'));
  } else if (TEXT_EXT.has(ext) || looksLikeText(buffer)) {
    kind = ext ? ext.slice(1) : 'text';
    text = buffer.toString('utf8').replace(/^﻿/, '');
    if (!TEXT_EXT.has(ext) && /^\s*<(!doctype html|html)/i.test(text)) { kind = 'html'; text = htmlText(text); }
  } else {
    throw new ExtractError(`Can't read ${ext || 'this'} files yet. Supported: PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), OpenDocument, HTML, Markdown, CSV, and any plain-text file.`);
  }

  text = tidy(String(text || ''));
  if (!text) throw new ExtractError('No readable text was found in this file.');
  const truncated = text.length > MAX_TEXT;
  return { kind, text: truncated ? text.slice(0, MAX_TEXT) : text, chars: text.length, truncated, meta };
}

module.exports = { extractText, ExtractError, htmlText, rtfText, looksLikeText, MAX_TEXT };
