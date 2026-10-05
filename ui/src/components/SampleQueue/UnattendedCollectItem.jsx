import React from 'react';
import { Collapse, ProgressBar, Table } from 'react-bootstrap';
import './app.css';
import {
  TASK_RUNNING,
  TASK_SKIPPED,
  TASK_UNCOLLECTED,
  formatNumber as num,
  groupSummary,
  taskStateClass,
} from '../../constants';
import ElapsedTime from './ElapsedTime';
import TaskStateIcon from './TaskStateIcon';

const ICON_STYLE = {
  display: 'flex',
  alignItems: 'center',
  paddingLeft: '10px',
  paddingRight: '10px',
  cursor: 'pointer',
};

function parameterTable(parameters) {
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

/**
 * An unattended collect: a header and one row per task of its task group.
 *
 * @param {Object} props
 * @param {Array} props.tasks - The task rows of the group, in order
 * @param {number} props.index - Index of the first row in the sample's tasks
 * @param {Object} props.displayData - queueGUI.displayData, timing and progress
 */
export default function UnattendedCollectItem(props) {
  const { tasks, index, sampleId, displayData, readOnly } = props;
  const [first] = tasks;
  const last = tasks.at(-1);
  const summary = groupSummary(tasks);
  const pending = summary.state === TASK_UNCOLLECTED && summary.done === 0;
  const rowData = (task) => displayData[task.queueID] || {};

  return (
    <div className="node node-sample">
      <div
        className={`task-head${taskStateClass(summary.state)}`}
        style={{ display: 'flex' }}
      >
        <b>
          <span className="node-name" style={{ display: 'flex' }}>
            <i className="fas fa-layer-group me-2" />
            Unattended collect ({summary.done}/{tasks.length}
            {summary.running && ` — ${summary.running}`})
          </span>
        </b>
        <span
          style={{ display: 'flex', marginLeft: 'auto', paddingLeft: '10px' }}
        >
          <ElapsedTime
            startedAt={rowData(first).startedAt}
            endedAt={
              summary.done === tasks.length ? rowData(last).endedAt : null
            }
          />
          <TaskStateIcon state={summary.state} />
        </span>
        {!readOnly && pending && (
          <>
            <i
              className="fas fa-pen"
              title="Edit the acquisition parameters"
              onClick={() => props.showForm(first.type, sampleId, first, -1)}
              style={{ ...ICON_STYLE, color: '#337ab7' }}
            />
            <i
              className="fas fa-times"
              title="Remove the unattended collect"
              onClick={() => props.deleteTask(sampleId, index)}
              style={{ ...ICON_STYLE, color: '#d9534f' }}
            />
          </>
        )}
      </div>

      {tasks.map((task, i) => {
        const { progress = 0, collapsed } = rowData(task);
        const collect = task.parameters.method === 'collect';

        return (
          <div
            key={task.queueID}
            className={`node node-task${
              task.state === TASK_RUNNING ? ' uc-phase-running' : ''
            }`}
          >
            <div>
              <div
                className={`task-head${taskStateClass(task.state)}`}
                style={{ display: 'flex', padding: '0.3rem 1rem' }}
              >
                <span className="node-name" style={{ display: 'flex' }}>
                  <TaskStateIcon state={task.state} />
                  {i + 1}. {task.label}
                  {task.state === TASK_SKIPPED && (
                    <em className="ms-2">- skipped</em>
                  )}
                </span>
                {task.state === TASK_RUNNING && progress > 0 && (
                  <span style={{ width: '120px', marginLeft: '10px' }}>
                    <ProgressBar
                      variant="info"
                      striped
                      animated
                      style={{ marginBottom: 0, height: '14px' }}
                      min={0}
                      max={1}
                      now={progress}
                    />
                  </span>
                )}
                <ElapsedTime
                  startedAt={rowData(task).startedAt}
                  endedAt={rowData(task).endedAt}
                />
              </div>
            </div>
            {collect && (
              <Collapse in={Boolean(collapsed)}>
                <div className="task-body">
                  {parameterTable(task.parameters)}
                </div>
              </Collapse>
            )}
          </div>
        );
      })}
    </div>
  );
}

UnattendedCollectItem.defaultProps = {
  readOnly: false,
  displayData: {},
};
