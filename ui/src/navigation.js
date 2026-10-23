// Lets actions change page without importing the router (components/App.jsx,
// which imports the containers that import the actions)
let navigateFn = null;

export function setNavigate(fn) {
  navigateFn = fn;
}

export function navigateTo(path) {
  if (navigateFn && window.location.pathname !== path) {
    navigateFn(path);
  }
}
