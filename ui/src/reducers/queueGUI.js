import { omit } from 'lodash/object';

import { TASK_RUNNING, isTerminalTaskState } from '../constants';

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
          action.sampleList[sampleID].tasks.forEach((task) => {
            if (!existingNodes.includes(task.queueID.toString())) {
              displayData[task.queueID] = {
                collapsed: false,
                selected: false,
                progress: 0,
                startedAt: null,
                endedAt: null,
              };
            }
          });
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

      // Phase timings, taken when the state change arrives. The queue emits
      // no durations of its own, and this is the cheapest place to learn one:
      // every start and every finish already passes through here.
      let { startedAt = null, endedAt = null } = previous;

      if (action.state === TASK_RUNNING) {
        // A second run of the same task restarts the clock; a repeated
        // RUNNING event for the run in progress must not.
        if (!startedAt || endedAt) {
          startedAt = Date.now();
        }
        endedAt = null;
      } else if (isTerminalTaskState(action.state)) {
        startedAt = startedAt || Date.now();
        endedAt = endedAt || Date.now();
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
          sampleList[sampleID].tasks.forEach((task) => {
            if (!existingNodes.includes(task.queueID.toString())) {
              displayData[task.queueID] = {
                collapsed: false,
                selected: false,
                progress: 0,
                startedAt: null,
                endedAt: null,
              };
            }
          });
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
