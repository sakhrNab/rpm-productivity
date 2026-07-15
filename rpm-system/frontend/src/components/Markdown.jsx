import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Shared markdown renderer. Styling lives in the global .asst-md rules.
const COMPONENTS = {
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  table: ({ node, ...props }) => <div className="asst-md-tablewrap"><table {...props} /></div>,
};

export default function Markdown({ children }) {
  return (
    <div className="asst-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>{children || ''}</ReactMarkdown>
    </div>
  );
}
