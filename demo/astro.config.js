import cloudflare from '@astrojs/cloudflare'
import react from '@astrojs/react'
import { defineConfig } from 'astro/config'

export default defineConfig({
	adapter: cloudflare(),
	devToolbar: {
		enabled: false,
	},
	integrations: [react()],
})
