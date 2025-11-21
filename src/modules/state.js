// src/modules/state.js

export function getState() {
  try {
    const json = localStorage.getItem("pm_state_v4");
    return json ? JSON.parse(json) : {};
  } catch {
    return {};
  }
}
