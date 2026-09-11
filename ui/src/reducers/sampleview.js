const INITIAL_STATE = {
  clickCentring: false,
  clickCentringPoints: [],
  clickCentringClicksLeft: -1,
  measureDistance: false,
  distancePoints: [],
  width: 659,
  height: 493,
  videoFormat: 'MJPEG',
  videoHash: '',
  videoURL: '',
  // Streams discovered from argussight; empty when it is disabled or down, in
  // which case the single direct video-streamer URL is used and the switcher is
  // not rendered.
  cameras: [],
  selectedCamera: '',
  // Centring geometry (beam position, pixelsPerMm, click-to-centre) is only
  // valid on the OAV camera, so it is disabled while another one is shown.
  centringEnabled: true,
  sourceIsScalable: false,
  videoSizes: [],
  autoScale: true,
  imageRatio: 0,
  pixelsPerMm: [0, 0],
  sourceScale: 1,
  apertureList: [],
  currentAperture: 0,
  currentPhase: '',
  beamPosition: [0, 0],
  beamShape: 'ellipse',
  beamSize: { x: 0, y: 0 },
  cinema: false,
  phaseList: [],
  drawGrid: false,
  videoMessageOverlay: { show: false, msg: '' },
  savedPointId: '',
  selectedShapes: [],
};

// Seed the camera switcher from the sample-image metadata. The view opens on
// the OAV/centring camera when argussight declares one, else on the first
// discovered stream; with no streams at all the switcher is not rendered and
// the single direct video-streamer URL is used.
function initialCameraState(cameraMetaData) {
  const cameras = cameraMetaData.cameras || [];
  const oav = cameras.find((cam) => cam.oav) || cameras[0];

  return {
    cameras,
    selectedCamera: oav ? oav.name : '',
    centringEnabled: true,
  };
}

// Point the player at another argussight stream. Returns the state unchanged
// for an unknown name, so a stale click cannot blank the video.
function selectCameraState(state, name) {
  const cam = state.cameras.find((c) => c.name === name);

  if (!cam) {
    return state;
  }

  return {
    ...state,
    selectedCamera: cam.name,
    videoURL: cam.url,
    // argussight URLs already carry the stream name.
    videoHash: '',
    videoFormat: cam.format,
    width: cam.width || state.width,
    height: cam.height || state.height,
    centringEnabled: Boolean(cam.oav),
  };
}

function sampleViewReducer(state = INITIAL_STATE, action = {}) {
  // eslint-disable-next-line sonarjs/max-switch-cases
  switch (action.type) {
    case 'TOOGLE_CINEMA': {
      return { ...state, cinema: !state.cinema };
    }
    case 'SET_PIXELS_PER_MM': {
      return { ...state, pixelsPerMm: action.pixelsPerMm };
    }
    case 'START_CLICK_CENTRING': {
      return { ...state, clickCentring: true, clickCentringPoints: [] };
    }
    case 'STOP_CLICK_CENTRING': {
      return { ...state, clickCentring: false, clickCentringPoints: [] };
    }
    case 'CLEAR_SELECTED_SHAPES': {
      return { ...state, selectedShapes: [] };
    }
    case 'ADD_CENTRING_POINT': {
      return state.clickCentringPoints.length === 2
        ? { ...state, clickCentring: false, clickCentringPoints: [] }
        : {
            ...state,
            clickCentringPoints: [
              ...state.clickCentringPoints,
              { x: action.x, y: action.y },
            ],
          };
    }
    case 'DRAW_GRID': {
      let { selectedGrids } = state;
      if (!state.drawGrid) {
        selectedGrids = [];
      }

      return { ...state, drawGrid: !state.drawGrid, selectedGrids };
    }
    case 'MEASURE_DISTANCE': {
      return { ...state, measureDistance: action.mode, distancePoints: [] };
    }
    case 'ADD_DISTANCE_POINT': {
      return state.distancePoints.length === 2
        ? { ...state, measureDistance: false, distancePoints: [] }
        : {
            ...state,
            distancePoints: [
              ...state.distancePoints,
              { x: action.x, y: action.y },
            ],
          };
    }
    case 'SAVE_IMAGE_SIZE': {
      return {
        ...state,
        width: action.width,
        height: action.height,
        pixelsPerMm: action.pixelsPerMm,
        beamPosition: action.beamPosition,
        sourceScale: action.sourceScale,
      };
    }
    case 'CENTRING_CLICKS_LEFT': {
      return { ...state, clickCentringClicksLeft: action.clicksLeft };
    }
    case 'SET_IMAGE_RATIO': {
      return { ...state, imageRatio: action.clientWidth / state.width };
    }
    case 'SET_VIDEO_SIZE': {
      return { ...state, videoSize: action.width };
    }
    case 'TOGGLE_AUTO_SCALE': {
      const imageRatio = state.autoScale ? 1 : action.width / state.width;
      return { ...state, autoScale: !state.autoScale, imageRatio };
    }
    case 'SET_APERTURE': {
      return { ...state, currentAperture: action.size };
    }
    case 'SET_BEAM_INFO': {
      return {
        ...state,
        beamPosition: action.info.position,
        beamShape: action.info.shape,
        beamSize: { x: action.info.size_x, y: action.info.size_y },
        currentAperture: action.info.label,
      };
    }
    case 'SET_CURRENT_PHASE': {
      return { ...state, currentPhase: action.phase };
    }
    case 'SHOW_VIDEO_MESSAGE_OVERLAY': {
      return {
        ...state,
        videoMessageOverlay: { show: action.show, msg: action.msg },
      };
    }
    case 'SET_CENTRING_METHOD': {
      return { ...state, centringMethod: action.centringMethod };
    }
    case 'UPDATE_SHAPES': {
      let selectedShapes = [...state.selectedShapes];

      action.shapes.forEach((shape) => {
        // Shape was selected, or shape was de-selected, add or remove to selectedShapes
        if (shape.selected && !state.selectedShapes.includes(shape.id)) {
          selectedShapes.push(shape.id);
        } else if (!shape.selected && state.selectedShapes.includes(shape.id)) {
          selectedShapes = selectedShapes.filter((id) => id !== shape.id);
        }
      });

      return { ...state, selectedShapes };
    }
    case 'DELETE_SHAPE': {
      const selectedShapes = state.selectedShapes.filter(
        (id) => id !== action.id,
      );
      return { ...state, selectedShapes };
    }
    case 'CLEAR_ALL':
    case 'SET_CURRENT_SAMPLE': {
      return {
        ...state,
        distancePoints: [],
        clickCentringPoints: [],
        gridList: [],
        gridCount: 0,
        selectedShapes: [],
      };
    }
    case 'CLEAR_QUEUE': {
      return {
        ...state,
        distancePoints: [],
        clickCentringPoints: [],
        gridList: [],
        gridCount: 0,
      };
    }
    case 'SELECT_CAMERA': {
      return selectCameraState(state, action.name);
    }
    case 'SET_INITIAL_STATE': {
      return {
        ...state,
        ...initialCameraState(action.data.Camera),
        width: action.data.Camera.imageWidth,
        height: action.data.Camera.imageHeight,
        videoFormat: action.data.Camera.format,
        videoSizes: action.data.Camera.videoSizes,
        sourceIsScalable: action.data.Camera.sourceIsScalable,
        videoHash: action.data.Camera.videoHash,
        videoURL: action.data.Camera.videoURL,
        apertureList: action.data.beamInfo.apertureList,
        currentAperture: action.data.beamInfo.currentAperture,
        beamPosition: action.data.beamInfo.position,
        beamShape: action.data.beamInfo.shape,
        beamSize: {
          x: action.data.beamInfo.size_x,
          y: action.data.beamInfo.size_y,
        },
        phaseList: action.data.phaseList,
        currentPhase: action.data.currentPhase,
        pixelsPerMm: action.data.Camera.pixelsPerMm,
        sourceScale: action.data.Camera.scale,
      };
    }
    default: {
      return state;
    }
  }
}

export default sampleViewReducer;
