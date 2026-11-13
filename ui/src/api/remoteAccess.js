import api from './api';

const endpoint = api.url('/ra');

export function fetchRemoteAccessState() {
  return endpoint.get('/').safeJson();
}

export function sendUpdateAllowRemote(allow) {
  return endpoint.post({ allow }, '/allow_remote').res();
}

export function sendUpdateNickname(name) {
  return endpoint.post({ name }, '/update_user_nickname').res();
}

export function sendRequestControl() {
  return endpoint.post(undefined, '/request_control').res();
}

export function sendOfferControl(username) {
  return endpoint.post({ username }, '/offer_control').res();
}

export function sendCancelControlRequest() {
  return endpoint.post(undefined, '/cancel_request').res();
}

export function sendHandoverResponse(accept) {
  return endpoint.post({ accept }, '/handover_response').res();
}

export function sendTakeControl() {
  return endpoint.post(undefined, '/take_control').res();
}

export function sendReleaseControl() {
  return endpoint.post(undefined, '/release_control').res();
}

export function sendMuteUser(username, muted) {
  return endpoint.post({ username, muted }, '/mute').res();
}

export function sendLogoutUser(username) {
  return endpoint.post({ username }, '/logout_user').res();
}

export function fetchChatMessages() {
  return endpoint.get('/chat').safeJson();
}

export function sendChatMessage(message) {
  return endpoint.post({ message }, '/chat').res();
}

export function sendSetAllMessagesRead() {
  return endpoint.post(undefined, '/chat/set_all_read').res();
}
