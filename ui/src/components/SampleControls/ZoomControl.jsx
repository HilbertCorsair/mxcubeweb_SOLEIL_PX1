/* eslint-disable jsx-a11y/control-has-associated-label */
import React, { useState, useEffect } from 'react';
import { Button, OverlayTrigger, Popover } from 'react-bootstrap';
import { useDispatch, useSelector } from 'react-redux';
import { HW_STATE } from '../../constants';
import { setAttribute } from '../../actions/beamline';
import styles from './SampleControls.module.css';

const ZOOM_HWO_ID = 'beam.beam_info.zoom';

function ZoomControl() {
  const dispatch = useDispatch();

  const { state, value, commands } = useSelector(
    (state) => state.beamline.hardwareObjects[ZOOM_HWO_ID],
  );

  // Find the index of the current zoom value in the commands array
  const zoomIndex = commands.indexOf(value);

  // Local state to track slider position during dragging
  const [sliderPosition, setSliderPosition] = useState(zoomIndex);

  // Update local state when Redux state changes
  useEffect(() => {
    setSliderPosition(zoomIndex);
  }, [zoomIndex]);

  // Handle slider movement without dispatching action
  const handleSliderMove = (evt) => {
    const position = Number.parseInt(evt.target.value, 10);
    setSliderPosition(position);
  };

  // Handle slider release - only now dispatch the action
  const handleSliderRelease = () => {
    dispatch(setAttribute(ZOOM_HWO_ID, commands[sliderPosition]));
  };

  // Handle direct click on a tick mark
  const handleTickClick = (position) => {
    setSliderPosition(position);
    dispatch(setAttribute(ZOOM_HWO_ID, commands[position]));
  };

  // Create an array of indices for the 7 zoom positions
  const zoomPositions = Array.from({ length: 7 }, (_, i) => i);

  return (
    <OverlayTrigger
      trigger="click"
      rootClose
      placement="bottom"
      overlay={
        <Popover id="ZoomControl_popover" className={styles.popover} body>
          <div className={styles.zoomSliderContainer}>
            <input
              type="range"
              className={styles.zoomSlider}
              min={0}
              max={6}
              step={1}
              value={sliderPosition}
              disabled={state !== HW_STATE.READY}
              onChange={handleSliderMove}
              onMouseUp={handleSliderRelease}
              onTouchEnd={handleSliderRelease}
            />

            {/* Tick marks container */}
            <div className={styles.tickMarksContainer}>
              {zoomPositions.map((pos) => (
                <div
                  key={pos}
                  className={`${styles.tickMark} ${
                    zoomIndex === pos ? styles.activeTick : ''
                  }`}
                  onClick={() => handleTickClick(pos)}
                >
                  <span className={styles.tickLabel}>
                    {commands[pos].slice(-1)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Popover>
      }
    >
      <Button
        className={styles.popoverBtn}
        data-default-styles
        name="zoomOut"
        title="Zoom in/out"
      >
        <i className={`${styles.controlIcon} fas fa-search`} />
        <span className={styles.controlLabel}>Zoom ({value}) </span>
      </Button>
    </OverlayTrigger>
  );
}

export default ZoomControl;
