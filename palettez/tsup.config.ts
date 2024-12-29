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
		clean: true,
		entry: {
			[packageName]: 'src/umd.ts',
		},
		globalName: packageName,
		format: ['iife'],
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
	},
	{
		clean: true,
		dts: true,
		entry: ['src/index.ts', 'src/react.ts'],
		format: ['esm', 'cjs'],
		minify: !!process.env.CI,
	},
])
