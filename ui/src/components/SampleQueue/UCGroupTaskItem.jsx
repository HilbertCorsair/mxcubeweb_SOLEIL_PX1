/* eslint-disable react/jsx-handler-names */
import React, { Component } from 'react';
import './app.css';
import { TASK_UNCOLLECTED, taskStateClass } from '../../constants';
import TaskStateIcon from './TaskStateIcon';

/**
 * Header row of an unattended-collect pipeline.
 *
 * The eight phase rows the backend emits right after this one are rendered
 * beneath it by CurrentTree / TodoTree. The pipeline is atomic: deleting this
 * row removes the whole TaskGroup, which is what delete_entry_at already does
 * for any row of the group.
 */
export default class UCGroupTaskItem extends Component {
  constructor(props) {
    super(props);
    this.deleteTask = this.deleteTask.bind(this);
    this.taskHeaderOnClick = this.taskHeaderOnClick.bind(this);
    this.showForm = this.showForm.bind(this);
  }

  taskHeaderOnClick(e) {
    if (this.props.taskHeaderOnClickHandler) {
      this.props.taskHeaderOnClickHandler(e, this.props.index);
    }
  }

  showForm(e) {
    e.stopPropagation();
    const { data, sampleId } = this.props;
    this.props.showForm(data.type, sampleId, data, -1);
  }

  deleteTask(e) {
    e.stopPropagation();
    this.props.deleteTask(this.props.sampleId, this.props.index);
  }

  /**
   * How far the pipeline has got, and what it is doing.
   *
   * done/total/running are counted by the parent from the phase rows
   * themselves, not read from the header's ucPhasesDone: that field only
   * refreshes on a full getQueue(), which the operator in control never
   * performs during a run - so it stayed frozen for the one person watching.
   */
  phaseLabel() {
    const { state, done, running } = this.props;
    const total = this.props.total || this.props.phaseCount;

    if (!total) {
      return '';
    }

    if (state === TASK_UNCOLLECTED || done === undefined) {
      return ` (${total} phases)`;
    }

    return running
      ? ` (${done}/${total} phases — ${running})`
      : ` (${done}/${total} phases)`;
  }

  render() {
    const { data, state, readOnly } = this.props;

    const delTaskCSS = {
      display: 'flex',
      marginLeft: 'auto',
      alignItems: 'center',
      paddingLeft: '10px',
      paddingRight: '10px',
      color: '#d9534f',
      cursor: 'pointer',
    };

    const taskCSS = `task-head${
      this.props.selected ? ' task-head-selected' : ''
    }${taskStateClass(state)}`;

    return (
      <div className="node node-sample">
        <div onClick={this.taskHeaderOnClick}>
          <div className={taskCSS} style={{ display: 'flex' }}>
            <b>
              <span className="node-name" style={{ display: 'flex' }}>
                <i className="fas fa-layer-group me-2" />
                {data.label}
                {this.phaseLabel()}
              </span>
            </b>
            {/* The per-phase rows carry the detail; the header only says
                whether the pipeline is running, done or waiting. */}
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                marginLeft: 'auto',
                paddingLeft: '10px',
              }}
            >
              <TaskStateIcon state={state} />
            </span>
            {!readOnly && state === TASK_UNCOLLECTED && (
              <>
                <i
                  className="fas fa-pen"
                  title="Edit acquisition parameters"
                  onClick={this.showForm}
                  style={{ ...delTaskCSS, color: '#337ab7' }}
                />
                <i
                  className="fas fa-times"
                  title="Remove the whole pipeline"
                  onClick={this.deleteTask}
                  style={{ ...delTaskCSS, marginLeft: 0 }}
                />
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
}

UCGroupTaskItem.defaultProps = {
  state: TASK_UNCOLLECTED,
  readOnly: false,
};
