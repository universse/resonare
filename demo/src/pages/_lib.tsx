import {
	getThemesAndOptions,
	type ThemeConfig,
	type ThemeStore,
} from 'palettez'
import pallettezGlobal from 'palettez/raw?raw'
import { usePalettez } from 'palettez/react'
import * as React from 'react'

const config = {
	color: {
		options: ['neutral', 'red', 'orange', 'green', 'blue', 'purple', 'pink'],
	},
	colorScheme: {
		options: [
			{
				value: 'system',
				media: ['(prefers-color-scheme: dark)', 'dark', 'light'],
			},
			'light',
			'dark',
		],
	},
	contrast: {
		options: ['standard', 'high'],
	},
	spacing: {
		options: ['80%', '90%', '100%', '110%', '120%'],
		defaultOption: '100%',
	},
	fontSize: {
		options: ['80%', '90%', '100%', '110%', '120%'],
		defaultOption: '100%',
	},
} as const satisfies ThemeConfig

const storeKey = 'demo'

declare module 'palettez' {
	interface ThemeStoreRegistry {
		demo: ThemeStore<typeof config>
	}
}

const themesAndOptions = getThemesAndOptions(config)

export async function updateDom({
	key,
	config,
}: {
	key: string
	config: ThemeConfig
}) {
	const themeStore = window.palettez.createThemeStore({
		key,
		config,
	})

	themeStore.subscribe(({ resolvedThemes }) => {
		Object.entries(resolvedThemes).forEach(([theme, option]) => {
			document.documentElement.dataset[theme] = option
		})
	})

	await themeStore.restore()
	themeStore.sync()
}

export const themeScript = `${pallettezGlobal}
(${updateDom.toString()})(${JSON.stringify({ key: storeKey, config })})`

const ThemeLabels = {
	color: 'color',
	colorScheme: 'color scheme',
	contrast: 'contrast',
	spacing: 'spacing',
	fontSize: 'font size',
} as const

export function ThemeSelect() {
	const { themes, setThemes } = usePalettez(() =>
		window.palettez.getThemeStore(storeKey),
	)

	return (
		<div className='theme-select'>
			{themesAndOptions.map(([theme, options]) => (
				<React.Fragment key={theme}>
					{/* <input type="hidden" name="key" value={storeKey} /> */}
					<label htmlFor={theme} style={{ textTransform: 'capitalize' }}>
						{ThemeLabels[theme]}
					</label>
					<select
						id={theme}
						name={theme}
						onChange={(e) => {
							setThemes({ [theme]: e.target.value })
						}}
						value={themes[theme]}
					>
						{options.map((option) => (
							<option key={option} value={option}>
								{option}
							</option>
						))}
					</select>
				</React.Fragment>
			))}
		</div>
	)
}
