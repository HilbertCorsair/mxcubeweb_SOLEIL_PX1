const INITIAL_STATE = {
  // the null value is used to distinguish between signed out (null) or logged in (true/false)
  sid: null,
  observers: [],
  // everyone connected to the session (staff, user, guests)
  members: [],
  // pending control handover {kind: 'offer'|'request', from, to}
  pending: null,
  allowRemote: false,
  chatMessageCount: 0,
};

function remoteAccessReducer(state = INITIAL_STATE, action = {}) {
  switch (action.type) {
    case 'SET_RA_STATE': {
      return {
        ...state,
        observers: action.data.observers,
        members: action.data.members,
        pending: action.data.pending,
        allowRemote: action.data.allowRemote,
      };
    }
    case 'SET_MASTER': {
      return { ...state, sid: action.sid };
    }
    case 'SET_OBSERVERS': {
      return { ...state, observers: action.observers };
    }
    case 'SET_ALLOW_REMOTE': {
      return { ...state, allowRemote: action.allow };
    }
    case 'RESET_CHAT_MESSAGE_COUNT': {
      return { ...state, chatMessageCount: 0 };
    }
    case 'INC_CHAT_MESSAGE_COUNT': {
      return {
        ...state,
        chatMessageCount: state.chatMessageCount + action.count,
      };
    }
    case 'SET_INITIAL_STATE': {
      return {
        ...state,
        observers: action.data.remoteAccess.observers,
        sid: action.data.remoteAccess.sid,
        allowRemote: action.data.remoteAccess.allowRemote,
        members: action.data.remoteAccess.members,
        pending: action.data.remoteAccess.pending,
      };
    }
    default: {
      return state;
    }
  }
}

export default remoteAccessReducer;
