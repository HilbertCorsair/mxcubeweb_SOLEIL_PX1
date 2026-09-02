/* eslint-disable react/jsx-handler-names */
import React, { Component } from 'react';
import { ProgressBar, Collapse, Table } from 'react-bootstrap';
import './app.css';
import {
  TASK_UNCOLLECTED,
  TASK_COLLECTED,
  TASK_COLLECT_FAILED,
  TASK_RUNNING,
  formatNumber as num,
} from '../../constants';

/** Phases whose acquisition subset is worth showing; the rest carry no parameters. */
const PHASES_WITH_PARAMETERS = new Set([
  'GridScan',
  'UnattendedDataCollection',
]);

/**
 * One phase row of an unattended-collect pipeline.
 *
 * Deliberately lighter than the generic TaskItem: the phase nodes carry only a
 * six-field acquisition subset (file paths, motors and sample identity are
 * derived per sample at execute time), and the pipeline is atomic, so a phase
 * offers neither a delete cross nor drag reordering - both act on the whole
 * group via its header row.
 */
export default class UCPhaseTaskItem extends Component {
  constructor(props) {
    super(props);
    this.taskHeaderOnClick = this.taskHeaderOnClick.bind(this);
    this.deleteTask = this.deleteTask.bind(this);
  }

  taskHeaderOnClick(e) {
    if (this.props.taskHeaderOnClickHandler) {
      this.props.taskHeaderOnClickHandler(e, this.props.index);
    }
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

  progressBar() {
    const progress = this.props.progress || 0;
    return (
      <span style={{ width: '120px', right: '20px', position: 'absolute' }}>
        <ProgressBar
          variant="info"
          striped
          style={{ marginBottom: 0, height: '14px' }}
          min={0}
          max={1}
          animated={progress < 1}
          label={`${(progress * 100).toPrecision(3)} %`}
          now={progress}
        />
      </span>
    );
  }

  parameterTable() {
    const { data } = this.props;
    const { parameters = {} } = data;

    return (
      <Table
        striped
        bordered
        hover
        style={{ fontSize: 'smaller', marginBottom: 0 }}
        className="task-parameters-table"
      >
        <thead>
          <tr>
            <th>Start &deg;</th>
            <th>Osc. &deg;</th>
            <th>t (s)</th>
            <th># Img</th>
            <th>T (%)</th>
            <th>Res. (&Aring;)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{num(parameters.osc_start, 2)}</td>
            <td>{num(parameters.osc_range, 2)}</td>
            <td>{num(parameters.exp_time, 6)}</td>
            <td>{parameters.num_images ?? '-'}</td>
            <td>{num(parameters.transmission, 2)}</td>
            <td>{num(parameters.resolution, 3)}</td>
          </tr>
        </tbody>
      </Table>
    );
  }

  render() {
    const { data, state, show, phaseNumber, readOnly } = this.props;
    const showParameters = PHASES_WITH_PARAMETERS.has(data.type);
    // A phase that belongs to a pipeline is deleted through its group header;
    // a standalone phase owns its TaskGroup and can be removed on its own.
    const deletable =
      !readOnly &&
      state === TASK_UNCOLLECTED &&
      (data.ucGroupID === null || data.ucGroupID === undefined) &&
      Boolean(this.props.deleteTask);

    return (
      <div className="node node-task uc-phase-item">
        <div onClick={this.taskHeaderOnClick}>
          <div
            className={`task-head${this.stateClass()}`}
            style={{ display: 'flex', padding: '0.3rem 1rem' }}
          >
            <span className="node-name" style={{ display: 'flex' }}>
              {phaseNumber === undefined ? '' : `${phaseNumber}. `}
              {data.label}
              {state === TASK_RUNNING && this.progressBar()}
            </span>
            {deletable && (
              <i
                className="fas fa-times"
                onClick={this.deleteTask}
                style={{
                  display: 'flex',
                  marginLeft: 'auto',
                  alignItems: 'center',
                  paddingLeft: '10px',
                  paddingRight: '10px',
                  color: '#d9534f',
                  cursor: 'pointer',
                }}
              />
            )}
          </div>
        </div>
        {showParameters && (
          <Collapse in={Boolean(show)}>
            <div className="task-body">{this.parameterTable()}</div>
          </Collapse>
        )}
      </div>
    );
  }
}

UCPhaseTaskItem.defaultProps = {
  state: TASK_UNCOLLECTED,
  readOnly: false,
};
