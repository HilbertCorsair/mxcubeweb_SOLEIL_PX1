import { Button } from 'react-bootstrap';
import { useDispatch, useSelector } from 'react-redux';

import { startAutoCentring } from '../../actions/sampleview';
import { isQueueExecuting } from '../../constants';
import styles from './SampleControls.module.css';

function AutoCentringControl() {
  const dispatch = useDispatch();
  const isActive = useSelector((state) => state.sampleview.clickCentring);
  const locked = useSelector((state) =>
    isQueueExecuting(state.queue.queueStatus),
  );

  return (
    <Button
      className={styles.controlBtn}
      data-default-styles
      active={isActive}
      disabled={locked}
      title="Start automatic centring"
      onClick={() => dispatch(startAutoCentring())}
    >
      <i className={`${styles.controlIcon} fas fa-robot`} />
      <span className={styles.controlLabel}>Auto Centring</span>
    </Button>
  );
}

export default AutoCentringControl;
