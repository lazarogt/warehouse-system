export const triggerAlertsRefresh = () => {
  window.dispatchEvent(new Event("alerts:refresh"));
};
