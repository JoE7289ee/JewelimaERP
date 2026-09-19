// The phone app, built into the Jewelima app's own public folder so it ships
// with every deploy like any other asset. Served from /assets/jewelima/jw/.
//
// The manifest is what lets the page find the hashed files: www/jwr.py reads it
// and writes the right <script> and <link> into the page, so a new build is
// picked up on the next load with no cache to fight.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	base: "/assets/jewelima/jw/",
	resolve: { alias: { "@": path.resolve(__dirname, "src") } },
	build: {
		outDir: path.resolve(__dirname, "../../jewelima/public/jw"),
		emptyOutDir: true,
		manifest: true,
		sourcemap: false,
		rollupOptions: { input: path.resolve(__dirname, "src/main.tsx") },
	},
	server: {
		// in development the API lives on the local bench
		proxy: { "/api": "http://development.localhost:8000" },
	},
});
