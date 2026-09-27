import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

// Contain a render failure to one panel instead of blanking the whole page.
export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[ErrorBoundary]', this.props.name || '', error, info?.componentStack); }
  componentDidUpdate(prev) { if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 16, marginTop: 12, borderRadius: 14, border: '1px solid rgba(239,83,80,0.35)', background: 'rgba(239,83,80,0.08)', color: 'var(--text-secondary)' }}>
        <AlertTriangle size={18} color="#ef5350" />
        <span>{this.props.message || 'This panel hit an error.'} <button type="button" onClick={() => this.setState({ error: null })} style={{ background: 'none', border: 0, color: 'var(--accent-cyan)', cursor: 'pointer', font: 'inherit', padding: 0 }}>Try again</button></span>
      </div>
    );
  }
}
