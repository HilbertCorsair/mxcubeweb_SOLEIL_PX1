/* eslint-disable react/jsx-handler-names */
import React from 'react';
import { connect } from 'react-redux';
import { reduxForm } from 'redux-form';
import { Modal, Button, Form, ButtonToolbar } from 'react-bootstrap';
import { DraggableModal } from '../DraggableModal';

import { FieldsHeader, InputField, FieldsRow } from './fields';

// Per-phase presentation: the friendly title, whether the acquisition subset
// is shown, and whether the helical index field is shown. The keys match the
// task `type` posted to the backend (add_uc_phase / _handle_uc_phase).
const PHASE_INFO = {
  OpticalCentring: { label: 'Auto centring', acq: false, index: false },
  GridScan: { label: 'Grid scan', acq: true, index: false },
  LineScan: { label: 'Line scan', acq: true, index: true },
  FinalizeCentring: { label: 'Finalize centring', acq: false, index: false },
  UnattendedDataCollection: { label: 'Data collection', acq: true, index: false },
  Unmount: { label: 'Unmount', acq: false, index: false },
};

class UCPhase extends React.Component {
  constructor(props) {
    super(props);

    this.submitAddToQueue = this.submitAddToQueue.bind(this);
    this.submitRunNow = this.submitRunNow.bind(this);
    this.addToQueue = this.addToQueue.bind(this);
  }

  phaseType() {
    // TaskContainer passes the CamelCase form name (e.g. "GridScan"); this is
    // the `type` the backend dispatch (add_uc_phase) matches. taskData.type is
    // the lowercased form key, so prefer the explicit phaseType prop.
    return this.props.phaseType || this.props.taskData.type || 'GridScan';
  }

  submitAddToQueue() {
    this.props.handleSubmit(this.addToQueue.bind(this, false))();
  }

  submitRunNow() {
    this.props.handleSubmit(this.addToQueue.bind(this, true))();
  }

  addToQueue(runNow, params) {
    const type = this.phaseType();
    const info = PHASE_INFO[type] || { label: type };

    const parameters = {
      // taskData.parameters carries the fixed extraParams (zoom for auto
      // centring, index for line scans) even when the form renders no field
      // for them; the edited form values override.
      ...this.props.taskData.parameters,
      ...params,
      type,
      label: info.label,
      shape: -1,
    };

    // Form values arrive as strings; doAddTask converts everything not listed
    // here back to a number. zoom is a string token ("zoom1"/"zoom2").
    const stringFields = [
      'type',
      'label',
      'shape',
      'prefix',
      'subdir',
      'path',
      'prefixTemplate',
      'subDirTemplate',
      'zoom',
    ];

    this.props.addTask(parameters, stringFields, runNow);
    this.props.hide();
  }

  render() {
    const type = this.phaseType();
    const info = PHASE_INFO[type] || { label: type, acq: false, index: false };
    const sampleCount = Array.isArray(this.props.sampleIds)
      ? this.props.sampleIds.length
      : 1;

    return (
      <DraggableModal show={this.props.show} onHide={this.props.hide}>
        <Modal.Header closeButton>
          <Modal.Title>{info.label}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            One &quot;{info.label}&quot; phase task will be added to each
            selected sample ({sampleCount} sample
            {sampleCount === 1 ? '' : 's'}). Phase tasks run against the shared
            X-ray centring session, so add them in the natural pipeline order
            (auto centring &rarr; grid scan &rarr; line scans &rarr; finalize
            &rarr; data collection &rarr; unmount).
          </p>

          <Form>
            {info.index && (
              <>
                <FieldsHeader title="Helical scan" />
                <FieldsRow>
                  <InputField
                    propName="index"
                    type="number"
                    label="Line scan index (0-based)"
                  />
                </FieldsRow>
              </>
            )}

            {info.acq && (
              <>
                <FieldsHeader title="Acquisition" />
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
              </>
            )}
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

const UCPhaseForm = reduxForm({
  form: 'ucphase',
})(UCPhase);

export default connect((state) => ({
  initialValues: {
    ...state.taskForm.taskData.parameters,
  },
}))(UCPhaseForm);
