// Constants that are unused within this file but defined here
// for ease of reuse. However eslint complains as soon as they
// are not used within the same file. So disable eslint for this
// section

export const QUEUE_STARTED = 'QueueStarted';
export const QUEUE_RUNNING = 'QueueRunning';
export const QUEUE_STOPPED = 'QueueStopped';

/** BeamlineActions command name; must match PX1BeamlineActions ControllerCommand id. */
export const UNATTENDED_COLLECT_QUEUE_ACTION = 'UnattendedCollectQueuedSamples';
export const QUEUE_PAUSED = 'QueuePaused';

/**
 * Auto mode: while the queue executes, goniometer moves from the UI are
 * disabled - the goniometer takes one command at a time and the queue's
 * procedures own it. The server refuses them too; this only keeps the UI
 * from offering them.
 */
export function isQueueExecuting(queueStatus) {
  return queueStatus === QUEUE_RUNNING || queueStatus === QUEUE_STARTED;
}

export const GONIO_LOCKED_MSG =
  'Goniometer moves are disabled while the queue runs';
export const QUEUE_FAILED = 'QueueFailed';

export const SAMPLE_MOUNTED = 0x8;
export const TASK_COLLECTED = 0x4;
export const TASK_COLLECT_FAILED = 0x2;
export const TASK_COLLECT_WARNING = 0x3;
export const TASK_RUNNING = 0x1;
export const TASK_UNCOLLECTED = 0x0;
/**
 * A task the queue reached but deliberately did not run - a task of an
 * unattended collect after an earlier scan found no spots. Distinct from
 * collected (it did nothing) and from failed (nothing went wrong).
 * Must match WARNING in mxcubeweb/core/components/queue.py.
 */
export const TASK_SKIPPED = 0x10;

export const READY = 0;
export const RUNNING = 0x1;

export const AUTO_LOOP_CENTRING = 1;
export const CLICK_CENTRING = 0;

export const TWO_STATE_ACTUATOR = 'INOUT';

/**
 * Short badge tag for a task, as shown in the samples table. Returns null for a
 * type with no defined tag so the caller decides the fallback.
 */
export function taskTagName(task) {
  switch (task.type) {
    case 'DataCollection': {
      return 'DC';
    }
    case 'Characterisation': {
      return 'C';
    }
    case 'Workflow': {
      return 'WF';
    }
    case 'xrf_spectrum': {
      return 'XRF';
    }
    case 'energy_scan': {
      return 'ESCAN';
    }
    case 'UnattendedCollect': {
      return 'UC';
    }
    default: {
      return null;
    }
  }
}

/**
 * Fixed-point format for a value that may be absent, so a missing number
 * renders as a dash rather than throw on toFixed().
 */
export function formatNumber(value, digits) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(digits)
    : '-';
}

export function isCollected(task) {
  return (task.state & TASK_COLLECTED) === TASK_COLLECTED; // eslint-disable-line no-bitwise
}

export function isUnCollected(task) {
  return task.state === TASK_UNCOLLECTED;
}

/** True once the queue is finished with a task, whatever the verdict. */
export function isTerminalTaskState(state) {
  return (
    state === TASK_COLLECTED ||
    state === TASK_SKIPPED ||
    state === TASK_COLLECT_FAILED
  );
}

/**
 * Execution-state colour class for a task row. The classes themselves are in
 * components/SampleQueue/app.css; this is the single definition of which state
 * maps to which, replacing the copies that had been pasted into every row type.
 */
export function taskStateClass(state) {
  switch (state) {
    case TASK_RUNNING: {
      return ' running';
    }
    case TASK_COLLECTED: {
      return ' success';
    }
    case TASK_COLLECT_FAILED: {
      return ' error';
    }
    case TASK_SKIPPED: {
      return ' warning';
    }
    default: {
      return '';
    }
  }
}

/**
 * Icon describing what the queue did with a task. This is the cue that tells a
 * running phase from a finished one without having to read the row's background
 * colour - the only indication the panel used to offer.
 */
export function taskStateIcon(state) {
  switch (state) {
    case TASK_RUNNING: {
      return {
        className: 'fas fa-circle-notch fa-spin',
        color: '#337ab7',
        title: 'Running',
      };
    }
    case TASK_COLLECTED: {
      return {
        className: 'fas fa-check-circle',
        color: '#4a9c1f',
        title: 'Done',
      };
    }
    case TASK_SKIPPED: {
      return {
        className: 'fas fa-exclamation-circle',
        color: '#b58900',
        title: 'Skipped',
      };
    }
    case TASK_COLLECT_FAILED: {
      return {
        className: 'fas fa-times-circle',
        color: '#d9534f',
        title: 'Failed',
      };
    }
    default: {
      return { className: 'far fa-circle', color: '#adb5bd', title: 'Waiting' };
    }
  }
}

/** First row of a task group (e.g. the tasks of an unattended collect). */
export function isGroupHead(task, i, tasks) {
  return (
    typeof task.groupID === 'number' && tasks[i - 1]?.groupID !== task.groupID
  );
}

/** State and progress of a task group, from its rows. */
export function groupSummary(rows) {
  const ended = rows.filter((row) => isTerminalTaskState(row.state));
  const running = rows.find((row) => row.state === TASK_RUNNING);
  let state = TASK_UNCOLLECTED;

  if (running) {
    state = TASK_RUNNING;
  } else if (rows.some((row) => row.state === TASK_COLLECT_FAILED)) {
    state = TASK_COLLECT_FAILED;
  } else if (ended.length === rows.length) {
    state = rows.every((row) => row.state === TASK_COLLECTED)
      ? TASK_COLLECTED
      : TASK_SKIPPED;
  }

  return { state, done: ended.length, running: running?.label };
}

/** One item per task, a task group (unattended collect) counting as one. */
export function groupedTasks(tasks) {
  return tasks.flatMap((task, i) => {
    if (typeof task.groupID !== 'number') {
      return [task];
    }

    const rows = tasks.filter((t) => t.groupID === task.groupID);
    return isGroupHead(task, i, tasks)
      ? [{ ...task, state: groupSummary(rows).state }]
      : [];
  });
}

export function hasLimsData(sample) {
  return sample.limsID !== undefined;
}

export function taskHasLimsData(task) {
  return (
    task.limsResultData &&
    (task.limsResultData.dataCollectionId ||
      task.limsResultData.dataCollectionGroupId)
  );
}

export function twoStateActuatorIsActive(state) {
  return ['in', 'on', 'enabled'].includes(String(state).toLowerCase());
}

export const SPACE_GROUPS = [
  '',
  'P1',
  'P2',
  'P21',
  'C2',
  'P222',
  'P2221',
  'P21212',
  'P212121',
  'C222 ',
  'C2221',
  'F222',
  'I222',
  'I212121',
  'P4',
  'P41',
  'P42',
  'P43',
  'P422',
  'P4212',
  'P4122',
  'P41212',
  'P4222',
  'P42212',
  'P4322',
  'P43212',
  'I4',
  'I41',
  'I422',
  'I4122',
  'P3',
  'P31',
  'P32',
  'P312',
  'P321',
  'P3112',
  'P3121',
  'P3212',
  'P3221',
  'P6',
  'P61',
  'P65',
  'P62',
  'P64',
  'P63',
  'P622',
  'P6122',
  'P6522',
  'P6222',
  'P6422',
  'P6322',
  'R3',
  'R32',
  'P23',
  'P213',
  'P432',
  'P4232',
  'P4332',
  'P4132',
  'F23',
  'F432',
  'F4132',
  'I23',
  'I213',
  'I432',
  'I4132',
];

/*
 * Base hardware object states: https://github.com/mxcube/mxcubecore/blob/03c89f2eef8af604b211f5788813df3ad4216138/mxcubecore/BaseHardwareObjects.py#L61
 * Also used for motors: https://github.com/mxcube/mxcubecore/blob/03c89f2eef8af604b211f5788813df3ad4216138/mxcubecore/HardwareObjects/abstract/AbstractMotor.py#L40
 */
export const HW_STATE = {
  UNKNOWN: 'UNKNOWN',
  WARNING: 'WARNING',
  BUSY: 'BUSY',
  READY: 'READY',
  FAULT: 'FAULT',
  OFF: 'OFF',
};
