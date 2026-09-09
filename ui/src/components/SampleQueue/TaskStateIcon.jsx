import React from 'react';
import { taskStateIcon } from '../../constants';

/**
 * The per-task execution-state glyph shared by every row of the queue panel.
 *
 * Before this the only cue a row carried was its background colour, which says
 * nothing on a small screen and nothing at all to a colour-blind operator.
 */
export default function TaskStateIcon(props) {
  const { className, color, title } = taskStateIcon(props.state);

  return (
    <i
      className={`${className} task-state-icon`}
      style={{ color }}
      title={title}
    />
  );
}
