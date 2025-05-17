import { defineConfig } from 'tsup'
import { name as packageName, version } from './package.json'

declare global {
	namespace NodeJS {
		interface ProcessEnv {
			CI: 'true' | undefined
		}
	}
}

export default defineConfig([
	{
		entry: {
			[packageName]: 'src/umd.ts',
		},
		format: ['iife'],
		globalName: packageName,
		dts: true,
		outExtension() {
			return { js: '.min.js' }
		},
		banner: {
			js: `/**
			* ${packageName} v${version}
			*
			* This source code is licensed under the MIT license found in the
			* LICENSE file in the root directory of this source tree.
			*/`,
		},
		minify: !!process.env.CI,
		clean: true,
	},
	{
		entry: ['src/index.ts', 'src/react.ts', 'src/storage.ts', 'src/umd.ts'],
		format: ['esm'],
		dts: true,
		minify: !!process.env.CI,
		clean: true,
	},
])
