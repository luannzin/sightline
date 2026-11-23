import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// The link's secret lives in the page, so the built page runs only code from the site: its own,
// and Vercel's page view counter at /_vercel/insights (src/main.tsx cuts the `#` off what it
// sends). The rest of the network is the signaling relays (wss:). Dev skips it: Vite injects
// inline scripts there.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self' wss:",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join("; ");

const csp: Plugin = {
  name: "csp",
  apply: "build",
  transformIndexHtml: () => [
    {
      tag: "meta",
      attrs: { "http-equiv": "Content-Security-Policy", content: CSP },
      injectTo: "head-prepend",
    },
  ],
};

// Link previews need the page's absolute address. On Vercel it's the production domain, read
// before Vite loads the env files so it takes precedence over `.env`'s default.
if (process.env.VERCEL_PROJECT_PRODUCTION_URL && !process.env.VITE_SITE_URL)
  process.env.VITE_SITE_URL = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;

export default defineConfig({
  // Relative asset paths, so the same build works at a domain root and under a subpath.
  base: "./",
  plugins: [react(), tailwindcss(), csp],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
