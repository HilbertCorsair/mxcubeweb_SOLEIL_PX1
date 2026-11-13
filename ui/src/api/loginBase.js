/**
 * Unauthenticated `/login/*` endpoints.
 * Separate from authenticated endpoints to avoid import cycle with `api.js`.
 */
import baseApi from './apiBase';

const endpoint = baseApi.url('/login');

export function sendLogIn(proposal, password, role) {
  return endpoint.post({ proposal, password, role }, '/').safeJson();
}

export function fetchLoginInfo() {
  return endpoint.get('/login_info').safeJson();
}
