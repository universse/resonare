import babel from '@rolldown/plugin-babel'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'tsdown'

declare global {
	namespace NodeJS {
		interface ProcessEnv {
			CI: string | undefined
		}
	}
}

const define = {
	DEBUG: process.env.CI ? 'false' : 'true',
	PROD: 'process.env.NODE_ENV === "production"',
}

export default defineConfig([
	{
		entry: ['src/index.ts', 'src/react.ts'],
		dts: {
			sourcemap: true,
		},

		platform: 'neutral',
		target: 'ES2023',
		plugins: [
			react(),
			babel({
				presets: [reactCompilerPreset({ target: '18' })],
			}),
		],

		clean: true,
		define,
	},
])
