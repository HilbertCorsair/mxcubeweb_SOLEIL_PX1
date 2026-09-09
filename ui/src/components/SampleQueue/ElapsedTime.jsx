import React from 'react';

function format(milliseconds) {
  const total = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/**
 * How long a task has been running, or how long it took.
 *
 * The timestamps come from queueGUI.displayData and are recorded client-side
 * when the state change arrives, so a browser that reloads or joins mid-run
 * times the running phase from that moment. Timing it on the server would mean
 * new fields on every task payload, which is more than a progress hint is
 * worth.
 */
export default class ElapsedTime extends React.Component {
  constructor(props) {
    super(props);
    this.timer = null;
    this.state = { now: Date.now() };
  }

  componentDidMount() {
    this.syncTimer();
  }

  componentDidUpdate() {
    this.syncTimer();
  }

  componentWillUnmount() {
    this.clearTimer();
  }

  /** Tick once a second while the task runs, and only while it runs. */
  syncTimer() {
    const running = Boolean(this.props.startedAt) && !this.props.endedAt;

    if (running && this.timer === null) {
      this.timer = setInterval(() => {
        this.setState({ now: Date.now() });
      }, 1000);
    } else if (!running) {
      this.clearTimer();
    }
  }

  clearTimer() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  render() {
    const { startedAt, endedAt } = this.props;

    if (!startedAt) {
      return null;
    }

    return (
      <span className="task-elapsed">
        {format((endedAt || this.state.now) - startedAt)}
      </span>
    );
  }
}
