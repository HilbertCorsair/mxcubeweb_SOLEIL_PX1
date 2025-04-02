import React from 'react';
import { Button, OverlayTrigger, Popover } from 'react-bootstrap';
import { useDispatch, useSelector } from 'react-redux';

import { HW_STATE } from '../../constants';
import { setAttribute } from '../../actions/beamline';
import styles from './SampleControls.module.css';

function LightControl() {
  const dispatch = useDispatch();

  const backlightObj = useSelector(
    (state) => true, // state.beamline.hardwareObject['diffractometer.backlight'],
  );

  // Add this for debugging

  console.log('Backlight object:', backlightObj);

  const { state } = backlightObj;
  const isActive = !!state;

  // More logging
  console.log('Backlight state:', state);
  console.log('isActive:', isActive);

  return (
    <Button
      className={styles.lightBtn}
      data-default-styles
      active={isActive}
      title={`VIS phase is ${isActive ? 'ON' : 'OFF'}`}
      onClick={() =>
        dispatch(
          setAttribute(
            'diffractometer.backlight.light_switch',
            isActive ? 'OFF' : 'ON',
          ),
        )
      }
    >
      <i className={`${styles.controlIcon} fas fa-lightbulb`} />
      <span className={styles.controlLabel}>backlight</span>
    </Button>
  );
}

export default LightControl;

/*

import { useState, useEffect } from 'react';
import axios from 'axios'; // For making API requests

const LightControl = () => {
  const [lightState, setLightState] = useState('OFF');
  const [isLoading, setIsLoading] = useState(false);

  // Function to toggle light state via API call
  const toggleLight = async () => {
    const newState = lightState === 'ON' ? 'OFF' : 'ON';
    setIsLoading(true);

    try {
           const response = await axios.post('/backlight', {
        light: newState
      });

      // If request was successful, update the local state
      if (response.status === 200) {
        setLightState(newState);
      }
    } catch (error) {
      console.error('Error toggling light:', error);
      // Handle error appropriately (could show an error message)
    } finally {
      setIsLoading(false);
    }
  };

  // Determine if button should be in active state
  const isActive = lightState === 'ON';

  return (
    <Button
      className={styles.lightBtn}
      data-default-styles
      active={isActive}
      disabled={isLoading}
      title={`Backlight is ${lightState}`}
      onClick={toggleLight}
    >
      <i className={`${styles.controlIcon} fas fa-lightbulb`} />
      <span className={styles.controlLabel}>backlight</span>
    </Button>
  );
};

export default LightControl;*/
