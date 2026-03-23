import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "./auth/AuthProvider";
import App from "./App";
import { ToastProvider } from "./components/ToastProvider";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToastProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ToastProvider>
  </React.StrictMode>,
);
