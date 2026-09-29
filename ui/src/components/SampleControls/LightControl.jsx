import React from 'react';
import { Button } from 'react-bootstrap';
import { useDispatch, useSelector } from 'react-redux';

import { HW_STATE } from '../../constants';
import { setAttribute } from '../../actions/beamline';
import styles from './SampleControls.module.css';

/**
 * ON/OFF toggle for an N-state light object (e.g. diffractometer.backlight).
 * The button shows the value the server reports, not the last click.
 */
function LightControl(props) {
  const { hwoId, label } = props;
  const dispatch = useDispatch();
  const light = useSelector((state) => state.beamline.hardwareObjects[hwoId]);

  if (!light) {
    return null; // not configured on this beamline
  }

  const isOn = light.value === 'ON';
  const ready = light.state === HW_STATE.READY;

  return (
    <Button
      className={styles.lightBtn}
      data-default-styles
      active={isOn}
      disabled={!ready}
      title={`${label} is ${isOn ? 'ON' : 'OFF'}`}
      onClick={() => dispatch(setAttribute(hwoId, isOn ? 'OFF' : 'ON'))}
    >
      <i className={`${styles.controlIcon} fas fa-lightbulb`} />
      <span className={styles.controlLabel}>{label.toLowerCase()}</span>
    </Button>
  );
}

export default LightControl;
