import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";

export default defineConfig({
	adapter: cloudflare(),
	integrations: [react()],
	vite: {
		resolve: {
			alias: {
				...(process.env.NODE_ENV === "production" && {
					"react-dom/server": "react-dom/server.edge",
				}),
			},
		},
	},
});
