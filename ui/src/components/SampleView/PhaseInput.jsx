import React from 'react';
import { Form } from 'react-bootstrap';
import { useDispatch, useSelector } from 'react-redux';

import { changeCurrentPhase } from '../../actions/sampleview';
import styles from './PhaseInput.module.css';

function PhaseInput() {
  const dispatch = useDispatch();

  const value = useSelector((state) => state.sampleview.currentPhase);
  const options = useSelector((state) => state.sampleview.phaseList);
  const state = useSelector(
    (state) => state.beamline.hardwareObjects.diffractometer?.state,
  );

  return (
    <Form.Select
      id="PhaseInput"
      className={styles.select}
      value={value ?? ''}
      data-busy={state === 'BUSY' || undefined}
      onChange={(evt) => {
        if (evt.target.value.toUpperCase() !== 'UNKNOWN') {
          dispatch(changeCurrentPhase(evt.target.value));
        }
      }}
    >
      {/* An unknown phase must not show as the first option */}
      {!options.includes(value) && (
        <option value={value ?? ''} disabled>
          {value}
        </option>
      )}
      {options.map((option) => (
        // value: an option's text is trimmed ("CENTRING " has a trailing space)
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </Form.Select>
  );
}

export default PhaseInput;
