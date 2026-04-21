import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "./auth/AuthProvider";
import App from "./App";
import { ToastProvider } from "./components/ToastProvider";
import { WarehouseProvider } from "./context/WarehouseContext";
import { getApiBaseUrl } from "./lib/api";
import { DataProviderRoot } from "./services/data-provider";
import "./styles.css";

const bootSplashElement = document.getElementById("app-loading");

const hideBootSplash = () => {
  if (!bootSplashElement || bootSplashElement.dataset.state === "exit") {
    return;
  }

  bootSplashElement.dataset.state = "exit";
  window.setTimeout(() => {
    bootSplashElement.remove();
  }, 220);
};

window.addEventListener("warehouse:app-ready", hideBootSplash, { once: true });
window.setTimeout(hideBootSplash, 4_000);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToastProvider>
      <DataProviderRoot apiBaseUrl={getApiBaseUrl()}>
        <AuthProvider>
          <WarehouseProvider>
            <App />
          </WarehouseProvider>
        </AuthProvider>
      </DataProviderRoot>
    </ToastProvider>
  </React.StrictMode>,
);
