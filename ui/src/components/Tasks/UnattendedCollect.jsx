/* eslint-disable react/jsx-handler-names */
import React from 'react';
import { connect } from 'react-redux';
import { reduxForm } from 'redux-form';
import { Modal, Button, Form, ButtonToolbar } from 'react-bootstrap';
import { DraggableModal } from '../DraggableModal';

import { FieldsHeader, InputField, FieldsRow } from './fields';

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
      shape: -1,
    };

    // Form values arrive as strings; everything not listed here is converted
    // back to a number by doAddTask.
    const stringFields = [
      'type',
      'label',
      'shape',
      'method',
      'prefix',
      'subdir',
      'path',
      'fileName',
      'fullPath',
      'prefixTemplate',
      'subDirTemplate',
      'experiment_type',
    ];

    this.props.addTask(parameters, stringFields, runNow);
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
          <p>
            One unattended collect will be added to each selected sample (
            {sampleCount} sample{sampleCount === 1 ? '' : 's'}). For each sample
            the queue mounts the pin, centres it optically and with X-rays,
            collects with the parameters below, then unmounts.
          </p>

          <FieldsHeader title="Acquisition" />
          <Form>
            <FieldsRow>
              <InputField
                propName="osc_start"
                type="number"
                label="Oscillation start"
              />
              <InputField
                propName="osc_range"
                type="number"
                label="Oscillation range"
              />
            </FieldsRow>
            <FieldsRow>
              <InputField
                propName="exp_time"
                type="number"
                label="Exposure time (s)"
              />
              <InputField
                propName="num_images"
                type="number"
                label="Number of images"
              />
            </FieldsRow>
            <FieldsRow>
              <InputField
                propName="transmission"
                type="number"
                label="Transmission"
              />
              <InputField
                propName="resolution"
                type="number"
                label="Resolution"
              />
            </FieldsRow>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <div className="input-group-btn d-flex">
            <ButtonToolbar>
              <Button
                className="me-3 ms-3"
                size="sm"
                variant="success"
                disabled={this.props.invalid}
                onClick={this.submitRunNow}
              >
                Run Now
              </Button>
              <Button
                size="sm"
                variant="outline-secondary"
                disabled={this.props.invalid}
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

export default connect((state) => ({
  initialValues: {
    ...state.taskForm.taskData.parameters,
  },
}))(UnattendedCollectForm);
