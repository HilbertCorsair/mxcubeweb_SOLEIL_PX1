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
export const QUEUE_FAILED = 'QueueFailed';

export const SAMPLE_MOUNTED = 0x8;
export const TASK_COLLECTED = 0x4;
export const TASK_COLLECT_FAILED = 0x2;
export const TASK_COLLECT_WARNING = 0x3;
export const TASK_RUNNING = 0x1;
export const TASK_UNCOLLECTED = 0x0;

export const READY = 0;
export const RUNNING = 0x1;

export const AUTO_LOOP_CENTRING = 1;
export const CLICK_CENTRING = 0;

export const TWO_STATE_ACTUATOR = 'INOUT';

/**
 * Task types of the unattended-collect pipeline phases.
 * Kept in step with Queue.UC_PHASE_TYPES on the backend.
 */
export const UC_PHASE_TYPES = [
  'OpticalCentring',
  'GridScan',
  'LineScan',
  'FinalizeCentring',
  'UnattendedDataCollection',
  'Unmount',
];

export function isUCPhase(task) {
  return UC_PHASE_TYPES.includes(task.type);
}

/**
 * True for a phase row belonging to a decomposed pipeline, as opposed to a
 * phase added on its own from the "Add UC phase" menu. The backend tags the
 * former with the owning TaskGroup's node id.
 */
export function isUCPipelinePhase(task) {
  return (
    isUCPhase(task) && task.ucGroupID !== null && task.ucGroupID !== undefined
  );
}

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
    case 'OpticalCentring': {
      return task.parameters?.zoom === 'zoom2' ? 'AC2' : 'AC1';
    }
    case 'GridScan': {
      return 'GS';
    }
    case 'LineScan': {
      return `LS${Number(task.parameters?.index ?? 0) + 1}`;
    }
    case 'FinalizeCentring': {
      return 'FC';
    }
    case 'UnattendedDataCollection': {
      return 'DC';
    }
    case 'Unmount': {
      return 'UM';
    }
    default: {
      return null;
    }
  }
}

/**
 * Fixed-point format for a value that may be absent: not every task carries the
 * full DataCollection acquisition set (the unattended phases carry a subset),
 * so a missing number must render as a dash rather than throw on toFixed().
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
