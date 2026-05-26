/* eslint-disable react/jsx-handler-names */
import React from 'react';
import { connect } from 'react-redux';
import { reduxForm } from 'redux-form';
import { Modal, Button, Form, ButtonToolbar } from 'react-bootstrap';
import { DraggableModal } from '../DraggableModal';

class UnattendedCollect extends React.Component {
  constructor(props) {
    super(props);

    this.submitAddToQueue = this.submitAddToQueue.bind(this);
    this.submitRunNow = this.submitRunNow.bind(this);
    this.addToQueue = this.addToQueue.bind(this);
  }

  submitAddToQueue() {
    this.props.handleSubmit(this.addToQueue.bind(this, false))();
  }

  submitRunNow() {
    this.props.handleSubmit(this.addToQueue.bind(this, true))();
  }

  addToQueue(runNow, params) {
    const parameters = {
      ...params,
      type: 'UnattendedCollect',
      label: 'Unattended collect',
      shape: this.props.pointID,
    };
    this.props.addTask(parameters, [], runNow);
    this.props.hide();
  }

  render() {
    const sampleCount = Array.isArray(this.props.sampleIds)
      ? this.props.sampleIds.length
      : 1;

    return (
      <DraggableModal show={this.props.show} onHide={this.props.hide}>
        <Modal.Header closeButton>
          <Modal.Title>Unattended collect</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <p>
              One unattended-collect task will be added to each selected
              sample ({sampleCount} sample{sampleCount === 1 ? '' : 's'}).
            </p>
            <p>
              For each sample the queue will: mount (if not already mounted)
              &rarr; murko centring &rarr; X-ray centring &rarr; data
              collection &rarr; unmount.
            </p>
            <p>
              Per-task parameters will be exposed in a future iteration; the
              backend currently derives them from <code>paramCollect.xml</code>
              {' '}and the sample&apos;s LIMS entry.
            </p>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <div className="input-group-btn d-flex">
            <ButtonToolbar>
              <Button
                className="me-3 ms-3"
                size="sm"
                variant="success"
                onClick={this.submitRunNow}
              >
                Run Now
              </Button>
              <Button
                size="sm"
                variant="outline-secondary"
                onClick={this.submitAddToQueue}
              >
                {this.props.taskData.sampleID ? 'Change' : 'Add to Queue'}
              </Button>
            </ButtonToolbar>
          </div>
        </Modal.Footer>
      </DraggableModal>
    );
  }
}

const UnattendedCollectForm = reduxForm({
  form: 'unattendedcollect',
})(UnattendedCollect);

export default connect()(UnattendedCollectForm);
