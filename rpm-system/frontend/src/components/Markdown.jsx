import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Shared markdown renderer. Styling lives in the global .asst-md rules.
const COMPONENTS = {
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  table: ({ node, ...props }) => <div className="asst-md-tablewrap"><table {...props} /></div>,
};

// Models sometimes stream malformed GFM tables — the delimiter row glued onto the
// end of the header line, or leading text/emoji before the first pipe. Either
// makes remark-gfm fall back to raw text with literal pipes. Repair those before
// parsing (code fences and inline pipes are left untouched).
const DELIM_RUN = /\|(?:\s*:?-{2,}:?\s*\|)+\s*$/;
const isDelimLine = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
function normalizeTables(src) {
  if (!src || src.indexOf('|') === -1) return src;
  let fence = false;
  const split = src.split('\n').flatMap((line) => {
    if (/^\s*```/.test(line)) { fence = !fence; return [line]; }
    if (fence) return [line];
    const m = line.match(DELIM_RUN);
    if (m && !isDelimLine(line)) {
      const head = line.slice(0, line.length - m[0].length);
      if (head.includes('|')) return [head, line.slice(line.length - m[0].length)];
    }
    return [line];
  });
  fence = false;
  const res = [];
  for (let i = 0; i < split.length; i++) {
    const line = split[i];
    if (/^\s*```/.test(line)) { fence = !fence; res.push(line); continue; }
    const next = split[i + 1];
    if (!fence && next && isDelimLine(next) && line.includes('|')) {
      const first = line.indexOf('|');
      const lead = line.slice(0, first).trim();
      if (lead) { res.push(lead, line.slice(first)); continue; }
    }
    res.push(line);
  }
  return res.join('\n');
}

export default function Markdown({ children }) {
  return (
    <div className="asst-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>{normalizeTables(children || '')}</ReactMarkdown>
    </div>
  );
}
