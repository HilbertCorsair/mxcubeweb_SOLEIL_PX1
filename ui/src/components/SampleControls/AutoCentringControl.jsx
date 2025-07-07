import { Button } from 'react-bootstrap';
import { useDispatch, useSelector } from 'react-redux';

import { startAutoCentring } from '../../actions/sampleview';
import styles from './SampleControls.module.css';

function AutoCentringControl() {
  const dispatch = useDispatch();
  const isActive = useSelector((state) => state.sampleview.clickCentring);

  return (
    <Button
      className={styles.controlBtn}
      data-default-styles
      active={isActive}
      title="Start automatic centring"
      onClick={() => dispatch(startAutoCentring())}
    >
      <i className={`${styles.controlIcon} fas fa-robot`} />
      <span className={styles.controlLabel}>Auto Centring</span>
    </Button>
  );
}

export default AutoCentringControl;
