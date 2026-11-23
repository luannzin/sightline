import "@fontsource-variable/inter";
import "@fontsource-variable/geist-mono";
import "./index.css";
import { Analytics } from "@vercel/analytics/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { ToastProvider } from "./components/ui/toast";
import { TooltipProvider } from "./components/ui/tooltip";

// biome-ignore lint/style/noNonNullAssertion: index.html always has #root
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <TooltipProvider>
        <div className="isolate">
          <App />
        </div>
      </TooltipProvider>
    </ToastProvider>
    {/* Page views, with the address cut at the `#`: the link's secret never leaves the page */}
    <Analytics beforeSend={(e) => ({ ...e, url: e.url.split("#")[0] })} />
  </StrictMode>,
);
