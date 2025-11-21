import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

import { AvatarProvider } from "./context/AvatarContext";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AvatarProvider>
      <App />
    </AvatarProvider>
  </React.StrictMode>
);
