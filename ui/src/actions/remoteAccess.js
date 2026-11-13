import {
  fetchRemoteAccessState,
  sendCancelControlRequest,
  sendHandoverResponse,
  sendLogoutUser,
  sendMuteUser,
  sendOfferControl,
  sendReleaseControl,
  sendRequestControl,
  sendTakeControl,
  sendUpdateAllowRemote,
  sendUpdateNickname,
  sendSetAllMessagesRead,
} from '../api/remoteAccess';
import { showErrorPanel } from './general';
import { getLoginInfo } from './login';

export function getRaState() {
  return async (dispatch) => {
    const data = await fetchRemoteAccessState();
    dispatch({ type: 'SET_RA_STATE', data: data.data });
  };
}

/* Run a remote-access request, then refresh login and session state.
   Refusals from the server (403/404/409) are shown in the error panel. */
function raRequest(send) {
  return async (dispatch) => {
    try {
      await send();
    } catch (error) {
      if ([403, 404, 409].includes(error.status)) {
        dispatch(showErrorPanel(true, error.text));
        return;
      }
      throw error;
    }
    dispatch(getLoginInfo());
    dispatch(getRaState());
  };
}

export function updateNickname(name) {
  return raRequest(() => sendUpdateNickname(name));
}

export function requestControl() {
  return raRequest(sendRequestControl);
}

export function offerControl(username) {
  return raRequest(() => sendOfferControl(username));
}

export function cancelControlRequest() {
  return raRequest(sendCancelControlRequest);
}

export function respondHandover(accept) {
  return raRequest(() => sendHandoverResponse(accept));
}

export function takeControl() {
  return raRequest(sendTakeControl);
}

export function releaseControl() {
  return raRequest(sendReleaseControl);
}

export function logoutUser(username) {
  return raRequest(() => sendLogoutUser(username));
}

export function muteUser(username, muted) {
  return raRequest(() => sendMuteUser(username, muted));
}

export function updateAllowRemote(allow) {
  return async (dispatch) => {
    await sendUpdateAllowRemote(allow);
    dispatch({ type: 'SET_ALLOW_REMOTE', allow });
  };
}

export function setObservers(observers) {
  return { type: 'SET_OBSERVERS', observers };
}

export function resetChatMessageCount() {
  return async (dispatch) => {
    await sendSetAllMessagesRead();
    dispatch({ type: 'RESET_CHAT_MESSAGE_COUNT' });
  };
}

export function incChatMessageCount(count = 1) {
  return { type: 'INC_CHAT_MESSAGE_COUNT', count };
}
