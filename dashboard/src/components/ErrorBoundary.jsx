import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(err) {
    console.error('View crashed:', err);
  }

  render() {
    if (this.state.error) {
      const message = String((this.state.error && this.state.error.message) || this.state.error);
      return (
        <div className="panel" style={{ padding: 24 }}>
          <h3 style={{ color: 'var(--danger)', marginBottom: 8 }}>This view had a problem</h3>
          <p className="muted" style={{ marginBottom: 14, wordBreak: 'break-word' }}>{message}</p>
          <div className="btn-row">
            <button className="mini" onClick={() => this.setState({ error: null })}>Try again</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
