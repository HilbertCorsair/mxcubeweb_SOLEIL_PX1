/* eslint-disable jsx-a11y/control-has-associated-label */
import React from 'react';
import { Button } from 'react-bootstrap';
import { useDispatch, useSelector } from 'react-redux';

//import { HW_STATE } from '../../constants';
import { setAttribute } from '../../actions/beamline';
import styles from './SampleControls.module.css';

function LightControl() {
  const dispatch = useDispatch();
  const light = useSelector((state) => state.beamline.hardwareObject["diffractometer.backlight"]);
  const isActive = light ? true :false

  return (
    <Button
      className={styles.lightBtn}
      data-default-styles
      active={light == 'OFF' ? false : true}
      title={`VIS phase is ${isActive ? 'ON' : 'OFF'}`}
      onClick={() => dispatch(setAttribute("diffractometer.backlight.light", isActive ? "OFF" : "ON" ))} >
      <i className={`${styles.controlIcon} fas fa-lightbulb`} />
      <span className={styles.controlLabel}>backlight</span>
    </Button>
  );

}

export default LightControl;
