import {
  groupSummary,
  TASK_COLLECT_FAILED,
  TASK_COLLECT_WARNING,
  TASK_COLLECTED,
  TASK_RUNNING,
  TASK_UNCOLLECTED,
} from '../../constants';
import ElapsedTime from './ElapsedTime';
import styles from './Item.module.css';

const STATE_STYLES = {
  [TASK_RUNNING]: styles.taskRunning,
  [TASK_COLLECTED]: styles.taskSuccess,
  [TASK_COLLECT_WARNING]: styles.taskWarning,
  [TASK_COLLECT_FAILED]: styles.taskError,
};

const STATE_ICONS = {
  [TASK_UNCOLLECTED]: ['far fa-circle', 'Waiting'],
  [TASK_RUNNING]: ['fas fa-circle-notch fa-spin', 'Running'],
  [TASK_COLLECTED]: ['fas fa-check-circle', 'Done'],
  [TASK_COLLECT_WARNING]: ['fas fa-exclamation-circle', 'Done, with warnings'],
  [TASK_COLLECT_FAILED]: ['fas fa-times-circle', 'Failed'],
};

/**
 * The tasks of one task group: a header with the state, progress and time
 * of the group, then its tasks.
 *
 * @param {Object} props
 * @param {Array} props.tasks - The tasks of the group, in order
 * @param {string} [props.title] - Shown in the header
 * @param {React.ReactNode} props.children - The task items
 */
export default function TaskGroupItem({
  tasks,
  title = 'Task group',
  children,
}) {
  const summary = groupSummary(tasks);
  const [icon, iconTitle] = STATE_ICONS[summary.state];

  return (
    <div className={styles.taskGroup}>
      <div
        className={`${styles.taskHead} ${STATE_STYLES[summary.state] || ''}`}
        style={{ display: 'flex', alignItems: 'center' }}
      >
        <span className={styles.nodeName} style={{ fontWeight: 'bold' }}>
          <i className={`${icon} ${styles.stateIcon}`} title={iconTitle} />
          {title} ({summary.done}/{tasks.length}
          {summary.running && ` — ${summary.running}`})
        </span>
        <ElapsedTime
          className={styles.elapsed}
          startedAt={summary.startedAt}
          endedAt={summary.endedAt}
        />
      </div>
      <div className={styles.taskGroupBody}>{children}</div>
    </div>
  );
}
