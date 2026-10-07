import { Component } from "react";
import type { ReactNode } from "react";
import { canResetView } from "./recovery.ts";
import { Recovery } from "./recovery-screen.tsx";
import { text } from "./text.ts";

type State = { failed: boolean };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidMount() {
    addEventListener("hashchange", this.retry);
  }

  componentWillUnmount() {
    removeEventListener("hashchange", this.retry);
  }

  retry = () => this.setState({ failed: false });

  resetView = () => {
    location.hash = "";
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Recovery title={text.crashedTitle} body={text.crashed}>
        <button type="button" onClick={() => location.reload()}>
          {text.reload}
        </button>
        {canResetView(location.hash) && (
          <button type="button" className="secondary" onClick={this.resetView}>
            {text.resetView}
          </button>
        )}
      </Recovery>
    );
  }
}
