/* eslint-disable react/jsx-handler-names */
import React from 'react';
import { connect } from 'react-redux';
import { reduxForm } from 'redux-form';
import { Modal, Button, Form, ButtonToolbar, ModalBody, ModalFooter } from 'react-bootstrap';
import { DraggableModal } from '../DraggableModal';

class TestTask extends React.Component {
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
      type: 'TestTask',
      label: 'Test Task',
      shape: this.props.pointID,
    };
    this.props.addTask(parameters, [], runNow);
    this.props.hide();
  }

  render() {
    return (
      <DraggableModal show={this.props.show} onHide={this.props.hide}>
        <Modal.Header closeButton>
          <Modal.Title>Test Task</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <p>This is a test task</p>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <div className="input-group-btn d-flex">
            <ButtonToolbar>
              <Button
                classname="me-3 ms-3"
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

const TestTaskForm = reduxForm({
  form: 'testtask',
})(TestTask);

export default connect()(TestTaskForm);
