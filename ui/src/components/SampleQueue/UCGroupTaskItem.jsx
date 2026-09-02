/* eslint-disable react/jsx-handler-names */
import React, { Component } from 'react';
import { ProgressBar } from 'react-bootstrap';
import './app.css';
import {
  TASK_UNCOLLECTED,
  TASK_COLLECTED,
  TASK_COLLECT_FAILED,
  TASK_RUNNING,
} from '../../constants';

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

  stateClass() {
    switch (this.props.state) {
      case TASK_RUNNING: {
        return ' running';
      }
      case TASK_COLLECTED: {
        return ' success';
      }
      case TASK_COLLECT_FAILED: {
        return ' error';
      }
      default: {
        return '';
      }
    }
  }

  render() {
    const { data, state, readOnly, phaseCount } = this.props;

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
    }${this.stateClass()}`;

    return (
      <div className="node node-sample">
        <div onClick={this.taskHeaderOnClick}>
          <div className={taskCSS} style={{ display: 'flex' }}>
            <b>
              <span className="node-name" style={{ display: 'flex' }}>
                <i className="fas fa-layer-group me-2" />
                {data.label}
                {phaseCount ? ` (${phaseCount} phases)` : ''}
                {state === TASK_RUNNING && (
                  <span
                    style={{
                      width: '150px',
                      right: '60px',
                      position: 'absolute',
                    }}
                  >
                    <ProgressBar
                      variant="info"
                      striped
                      style={{ marginBottom: 0, height: '18px' }}
                      min={0}
                      max={1}
                      animated
                      now={this.props.progress || 0}
                    />
                  </span>
                )}
              </span>
            </b>
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
