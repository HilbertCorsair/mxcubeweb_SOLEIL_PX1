/* eslint-disable react/no-array-index-key */
/* eslint-disable react/jsx-handler-names */
import React from 'react';
import './app.css';
import { ListGroup, Form, Button } from 'react-bootstrap';
import { QUEUE_RUNNING, UC_PHASE_TYPES } from '../../constants';
import UCGroupTaskItem from './UCGroupTaskItem';
import UCPhaseTaskItem from './UCPhaseTaskItem';

export default class TodoTree extends React.Component {
  constructor(props) {
    super(props);
    this.setSearchWord = this.setSearchWord.bind(this);
    this.showAddSampleForm = this.showAddSampleForm.bind(this);
    this.mountAndSwitchTab = this.mountAndSwitchTab.bind(this);
    this.state = { searchWord: '' };
  }

  setSearchWord(searchWord) {
    this.setState({ searchWord: searchWord.target.value });
  }

  showAddSampleForm() {
    this.props.prepareBeamlineForNewSample();
    this.props.showForm('AddSample');
  }

  mountAndSwitchTab(sampleData) {
    this.props.mount(sampleData);
    this.props.showList('current');
  }

  filter(list, searchWord) {
    return list.filter((sampleID) => String(sampleID).includes(searchWord));
  }

  /**
   * Render the tasks queued on an upcoming sample, read-only.
   *
   * Upstream this tab showed the sample name and a Mount button only, so a
   * queued sample looked empty however many tasks it carried. Unattended
   * collect in particular queues a group header plus eight ordered phases per
   * sample, and none of it was visible before the sample was mounted.
   */
  renderSampleTasks(sampleData) {
    const tasks = sampleData.tasks || [];

    if (tasks.length === 0) {
      return null;
    }

    return (
      <div className="task-list">
        {tasks.map((taskData, i) => {
          if (taskData.type === 'UnattendedCollect') {
            return (
              <UCGroupTaskItem
                key={taskData.queueID}
                index={i}
                data={taskData}
                sampleId={sampleData.sampleID}
                state={taskData.state}
                phaseCount={taskData.ucPhaseCount}
                readOnly
              />
            );
          }

          if (UC_PHASE_TYPES.includes(taskData.type)) {
            return (
              <UCPhaseTaskItem
                key={taskData.queueID}
                index={i}
                data={taskData}
                sampleId={sampleData.sampleID}
                state={taskData.state}
                phaseNumber={
                  taskData.ucPhaseIndex === null ||
                  taskData.ucPhaseIndex === undefined
                    ? undefined
                    : taskData.ucPhaseIndex + 1
                }
                readOnly
              />
            );
          }

          // Everything else (DC, characterisation, workflows, scans) gets a
          // plain read-only label row; the full parameter panels stay in the
          // Current tab, where the task can actually be edited.
          return (
            <div key={taskData.queueID} className="node node-task">
              <div
                className="task-head"
                style={{ display: 'flex', padding: '0.3rem 1rem' }}
              >
                <span className="node-name">{taskData.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  render() {
    if (!this.props.show) {
      return <div />;
    }

    const list = this.filter(this.props.list, this.state.searchWord); // eslint-disable-line unicorn/no-array-method-this-argument

    return (
      <ListGroup variant="flush">
        <ListGroup.Item
          className="d-flex list-head"
          style={{ borderBottom: 'none' }}
        >
          <div className="me-auto">
            <Form.Control
              type="text"
              size="sm"
              className="form-control"
              placeholder="Search Upcoming"
              onChange={this.setSearchWord}
              style={{ width: '90%' }}
            />
          </div>
          <div>
            <Button
              disabled={this.props.queueStatus === QUEUE_RUNNING}
              className="btn-primary"
              size="sm"
              onClick={this.showAddSampleForm}
            >
              Create new sample
            </Button>
          </div>
        </ListGroup.Item>
        <ListGroup.Item className="d-flex list-body">
          {list.map((key, id) => {
            const sampleData = this.props.sampleList[key];
            const sampleName = sampleData.sampleName || '';
            const proteinAcronym = sampleData.proteinAcronym
              ? `${sampleData.proteinAcronym} -`
              : '';

            return (
              <div key={id} className="node node-sample">
                <div className="task-head">
                  <div className="d-flex node-name">
                    <p className="pt-1 me-auto">
                      <b>{`${sampleData.sampleID} `}</b>
                      {`${proteinAcronym} ${sampleName}`}
                    </p>

                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={() => this.mountAndSwitchTab(sampleData)}
                    >
                      Mount
                    </Button>
                  </div>
                </div>
                {this.renderSampleTasks(sampleData)}
              </div>
            );
          })}
        </ListGroup.Item>
      </ListGroup>
    );
  }
}
