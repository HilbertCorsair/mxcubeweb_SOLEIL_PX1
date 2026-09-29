import { omit } from 'lodash/object';

import { TASK_RUNNING, isTerminalTaskState } from '../constants';

/**
 * The server's start/end stamps for a task, moved onto this browser's clock.
 *
 * The queue manager stamps every entry it runs, so these are the real times
 * whoever is watching and whenever the page was loaded. serverTime says what
 * the server clock read when it sent them; the difference to Date.now() is
 * the clock offset (plus a network hop, which is noise at 1 s resolution).
 * Returns null when the server sent no start, or when the task is not
 * running or done - a re-queued task's old stamps must not show.
 */
function serverTiming(timing, state) {
  if (!timing || !timing.startedAt) {
    return null;
  }
  if (state !== TASK_RUNNING && !isTerminalTaskState(state)) {
    return null;
  }

  const offset = timing.serverTime ? Date.now() - timing.serverTime : 0;
  if (state === TASK_RUNNING) {
    return { startedAt: timing.startedAt + offset, endedAt: null };
  }

  // Done: stop the clock, even if the server had no end stamp to send.
  return {
    startedAt: timing.startedAt + offset,
    endedAt: timing.endedAt ? timing.endedAt + offset : Date.now(),
  };
}

/** displayData entries for a freshly (re)loaded list of tasks. */
function seedTasks(displayData, existingNodes, tasks) {
  tasks.forEach((task) => {
    const server = serverTiming(task, task.state);

    if (!existingNodes.includes(task.queueID.toString())) {
      displayData[task.queueID] = {
        collapsed: false,
        selected: false,
        progress: 0,
        startedAt: null,
        endedAt: null,
        ...server,
      };
    } else if (server) {
      displayData[task.queueID] = { ...displayData[task.queueID], ...server };
    }
  });
}

const INITIAL_STATE = {
  showRestoreDialog: false,
  searchString: '',
  displayData: {},
  visibleList: 'current',
  loading: false,
  showResumeQueueDialog: false,
  showConfirmCollectDialog: false,
};

// eslint-disable-next-line sonarjs/cognitive-complexity
function queueGUIReducer(state = INITIAL_STATE, action = {}) {
  switch (action.type) {
    case 'redux-form/CHANGE': {
      if (action.form === 'search-sample') {
        return { ...state, searchString: action.value };
      }

      return state;
    }
    case 'SET_QUEUE': {
      const displayData = { ...state.displayData };
      const existingNodes = Object.keys(state.displayData);
      action.sampleOrder.forEach((sampleID) => {
        if (sampleID in action.sampleList) {
          seedTasks(
            displayData,
            existingNodes,
            action.sampleList[sampleID].tasks,
          );
        }
      });

      return { ...state, displayData };
    }
    case 'ADD_TASKS': {
      const displayData = { ...state.displayData };

      action.tasks.forEach((task) => {
        displayData[task.queueID] = {
          collapsed: false,
          selected: false,
          progress: 0,
          startedAt: null,
          endedAt: null,
        };
      });

      return { ...state, displayData };
    }
    case 'ADD_TASK_RESULT': {
      const previous = state.displayData[action.queueID] || {};

      // Phase timings: the server's own stamps when it sends them. Without
      // them (an older backend, or a "task" event from a collect signal),
      // fall back to when the state change arrived here.
      let { startedAt = null, endedAt = null } = previous;
      const server = serverTiming(action.timing, action.state);

      if (server) {
        ({ startedAt, endedAt } = server);
      } else if (action.state === TASK_RUNNING) {
        // A second run of the same task restarts the clock; a repeated
        // RUNNING event for the run in progress must not.
        if (!startedAt || endedAt) {
          startedAt = Date.now();
        }
        endedAt = null;
      } else if (isTerminalTaskState(action.state)) {
        // Never invent a start. Without a RUNNING event first there is no
        // duration to report, and a fabricated one reads as "0s" - a wrong
        // number where nothing at all is the honest answer.
        endedAt = startedAt ? endedAt || Date.now() : null;
      } else {
        startedAt = null;
        endedAt = null;
      }

      const displayData = {
        ...state.displayData,
        [action.queueID]: {
          ...previous,
          progress: action.progress,
          startedAt,
          endedAt,
        },
      };

      return { ...state, displayData };
    }

    case 'ADD_SAMPLES_TO_QUEUE': {
      const displayData = { ...state.displayData };
      action.samplesData.forEach((sample) => {
        displayData[sample.queueID] = {
          collpased: false,
          selected: false,
          progress: 0,
        };
      });

      return { ...state, displayData };
    }
    case 'REMOVE_TASK': {
      return { ...state, displayData: omit(state.displayData, action.queueID) };
    }
    case 'REMOVE_TASKS_LIST': {
      return {
        ...state,
        displayData: omit(state.displayData, action.queueIDList),
      };
    }
    case 'QUEUE_LOADING': {
      return { ...state, loading: action.loading };
    }
    // show list
    case 'SHOW_LIST': {
      return {
        ...state,
        visibleList: action.list_name,
      };
    }
    case 'SHOW_RESUME_QUEUE_DIALOG': {
      return { ...state, showResumeQueueDialog: action.show };
    }
    case 'SHOW_CONFIRM_COLLECT_DIALOG': {
      return { ...state, showConfirmCollectDialog: action.show };
    }
    case 'COLLAPSE_ITEM': {
      const displayData = { ...state.displayData };
      displayData[action.queueID].collapsed ^= 1; // eslint-disable-line no-bitwise

      return { ...state, displayData };
    }
    case 'SELECT_ITEM': {
      const displayData = { ...state.displayData };
      displayData[action.queueID].selected ^= 1; // eslint-disable-line no-bitwise

      return { ...state, displayData };
    }
    case 'SET_INITIAL_STATE': {
      const sampleList = { ...action.data.queue.sampleList.sampleList };
      const sampleOrder = [...action.data.queue.sampleList.sampleOrder];
      const displayData = { ...state.displayData };
      const existingNodes = Object.keys(state.displayData);

      sampleOrder.forEach((sampleID) => {
        if (sampleID in sampleList) {
          seedTasks(displayData, existingNodes, sampleList[sampleID].tasks);
        }
      });

      return { ...state, displayData };
    }
    case 'CLEAR_ALL': {
      return INITIAL_STATE;
    }
    default: {
      return state;
    }
  }
}

export default queueGUIReducer;
