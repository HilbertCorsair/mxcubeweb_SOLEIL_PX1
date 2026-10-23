import { showErrorPanel } from './general';
import { selectCamera } from './sampleview';
import { navigateTo } from '../navigation';
import { clearCurrentSample } from './queue'; // eslint-disable-line import/no-cycle
import {
  fetchLoadedSample,
  fetchSampleChangerContents,
  sendAbortSampleChanger,
  sendMountSample,
  sendSampleChangerCommand,
  sendScanSampleChanger,
  sendSelectContainer,
  sendUnmountCurrentSample,
} from '../api/sampleChanger';

export function setContents(contents) {
  return { type: 'SET_SC_CONTENTS', data: { sampleChangerContents: contents } };
}

export function setSCState(state) {
  return { type: 'SET_SC_STATE', state };
}

export function setLoadedSample(data) {
  return { type: 'SET_LOADED_SAMPLE', data };
}

export function setSCGlobalState(data) {
  return { type: 'SET_SC_GLOBAL_STATE', data };
}

export function setCurrentPlate(plate_index) {
  return { type: 'SET_SC_CURRENT_PLATE', plate_index };
}

export function setSelectedWell(row, col) {
  return { type: 'SET_SC_SELECTED_WELL', row, col };
}

export function setSelectedDrop(drop_index) {
  return { type: 'SET_SC_SELECTED_DROP', drop_index };
}

export function setPlate(plate_index) {
  return (dispatch) => {
    dispatch(setCurrentPlate(plate_index));
  };
}

export function selectWell(row, col) {
  return (dispatch) => {
    dispatch(setSelectedWell(row, col));
  };
}

export function selectDrop(drop_index) {
  return (dispatch) => {
    dispatch(setSelectedDrop(drop_index));
  };
}

export function refresh() {
  return async (dispatch) => {
    const [contents, sample] = await Promise.all([
      fetchSampleChangerContents(),
      fetchLoadedSample(),
    ]);

    dispatch(setContents(contents));
    dispatch(setLoadedSample(sample));
  };
}

export function select(address) {
  return async (dispatch) => {
    const contents = await sendSelectContainer(address);
    dispatch(setContents(contents));
  };
}

export function scan(address) {
  return async (dispatch) => {
    const contents = await sendScanSampleChanger(address);
    dispatch(setContents(contents));
  };
}

// Mount/Unmount from the UI show the transfer on the hutch cameras (names of
// server.yaml ARGUSSIGHT_CAMERAS; selectCamera ignores a missing one)
const MOUNT_CAMERAS = {
  dewar: 'hutch_1',
  robot: 'hutch_2',
  head: 'hutch_3',
  oav: 'oav',
};
const MOUNT_CAMERAS_TIMEOUT = 180_000; // ms, then the OAV anyway

// The UI mount in progress: the location mounted, the camera timers, and
// whether the goniometer was seen empty (an exchange starts with the old pin
// still detected on it)
let pendingMount = null;

function endMountCameras(dispatch, camera) {
  if (pendingMount) {
    pendingMount.timers.forEach(clearTimeout);
    pendingMount = null;
    if (camera) {
      dispatch(selectCamera(camera));
    }
  }
}

function startMountCameras(dispatch, location, gonioEmpty) {
  endMountCameras(dispatch);
  const show = (camera, delay) =>
    setTimeout(() => dispatch(selectCamera(camera)), delay);

  dispatch(selectCamera(MOUNT_CAMERAS.dewar));
  pendingMount = {
    location,
    sawEmpty: gonioEmpty,
    timers: [
      show(MOUNT_CAMERAS.robot, 2500),
      show(MOUNT_CAMERAS.head, 4500),
      setTimeout(
        () => endMountCameras(dispatch, MOUNT_CAMERAS.oav),
        MOUNT_CAMERAS_TIMEOUT,
      ),
    ],
  };
}

// sample_detected: the goniometer sees a pin (or no pin)
export function mountSampleDetected(detected) {
  return (dispatch) => {
    if (!pendingMount) {
      return;
    }
    if (!detected) {
      pendingMount.sawEmpty = true;
    } else if (pendingMount.sawEmpty) {
      endMountCameras(dispatch, MOUNT_CAMERAS.oav);
    }
  };
}

// loaded_sample_changed: the end of the mount, if no detection came first
export function mountSampleLoaded(address) {
  return (dispatch) => {
    if (pendingMount && address === pendingMount.location) {
      endMountCameras(dispatch, MOUNT_CAMERAS.oav);
    }
  };
}

export function mountSample(sampleData) {
  return async (dispatch, getState) => {
    const state = getState();
    if (state.sampleChanger.loadedSample.address === sampleData.location) {
      return;
    }

    navigateTo('/datacollection');
    // A manual mount has no robot transfer to show
    if (sampleData.location !== 'Manual') {
      startMountCameras(
        dispatch,
        sampleData.location,
        !state.sampleChanger.loadedSample.address,
      );
    }

    try {
      await sendMountSample(sampleData);
    } catch (error) {
      endMountCameras(dispatch);
      dispatch(showErrorPanel(true, error.response.headers.get('message')));
      throw error;
    }
  };
}

export function unmountSample() {
  return async (dispatch) => {
    navigateTo('/datacollection');
    endMountCameras(dispatch);
    dispatch(selectCamera(MOUNT_CAMERAS.robot));
    try {
      await sendUnmountCurrentSample();
      dispatch(clearCurrentSample());
    } catch (error) {
      dispatch(showErrorPanel(true, error.response.headers.get('message')));
    }
  };
}

export function abort() {
  return async (dispatch) => {
    await sendAbortSampleChanger();
    dispatch(showErrorPanel(true, 'action aborted'));
  };
}

export function sendCommand(cmdparts, args) {
  return async (dispatch) => {
    try {
      await sendSampleChangerCommand(cmdparts, args);
    } catch (error) {
      dispatch(showErrorPanel(true, error.response.headers.get('message')));
    }
  };
}
