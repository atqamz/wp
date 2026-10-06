import { Component } from "react";
import type { ReactNode } from "react";
import { canResetView } from "./recovery.ts";
import { text } from "./text.ts";

type State = { failed: boolean };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  resetView = () => {
    location.hash = "";
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="splash" role="alert">
        <p>{text.crashed}</p>
        <div className="form-actions">
          <button type="button" onClick={() => location.reload()}>
            {text.reload}
          </button>
          {canResetView(location.hash) && (
            <button type="button" className="secondary" onClick={this.resetView}>
              {text.resetView}
            </button>
          )}
        </div>
      </div>
    );
  }
}
