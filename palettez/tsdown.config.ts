import react from '@vitejs/plugin-react'
import { defineConfig } from 'tsdown'
import packageJson from './package.json' with { type: 'json' }

declare global {
	namespace NodeJS {
		interface ProcessEnv {
			CI: string | undefined
			NODE_ENV: string
		}
	}
}

const define = {
	DEBUG: process.env.CI ? 'false' : 'true',
}

export default defineConfig([
	{
		entry: {
			[packageJson.name]: 'src/umd.ts',
		},
		format: 'iife',
		globalName: packageJson.name,
		outExtensions() {
			return { js: '.min.js' }
		},

		banner: {
			js: `/**
			* ${packageJson.name} v${packageJson.version}
			*
			* This source code is licensed under the MIT license found in the
			* LICENSE file in the root directory of this source tree.
			*/`,
		},
		platform: 'browser',

		clean: true,
		define,
		minify: !!process.env.CI,
	},
	{
		entry: ['src/index.ts', 'src/storage.ts', 'src/umd.ts', 'src/react.ts'],
		dts: true,

		platform: 'neutral',
		plugins: [
			react({
				babel: {
					plugins: [['babel-plugin-react-compiler', { target: '18' }]],
				},
			}),
		],

		clean: true,
		define,
	},
])
