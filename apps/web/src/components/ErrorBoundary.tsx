import { Component, type ReactNode } from 'react';

interface ErrorBoundaryState {
  readonly error: Error | undefined;
}

/**
 * Catches a part model that throws while the bench is being built, so a bug
 * in your code shows as a message rather than a blank page.
 */
export class ErrorBoundary extends Component<{ readonly children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: undefined };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="crash">
        <div className="card">
          <p className="eyebrow">Something threw</p>
          <h2>The bench couldn’t start</h2>
          <pre>{error.message}</pre>
          <p>Fix it and save. The page reloads by itself.</p>
        </div>
      </main>
    );
  }
}
