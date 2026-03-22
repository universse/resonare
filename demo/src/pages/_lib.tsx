import * as React from 'react'
import {
	getThemesAndOptions,
	type ThemeStore,
	type ThemeStoreConfig,
} from 'resonare'
import { resonareInlineScript } from 'resonare/inline-script'
import { useResonare } from 'resonare/react'

const STORE_KEY = 'demo'

const STORE_CONFIG = {
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
		initialValue: '100%',
	},
	fontSize: {
		options: ['80%', '90%', '100%', '110%', '120%'],
		initialValue: '100%',
	},
} as const satisfies ThemeStoreConfig

declare module 'resonare' {
	interface ThemeStoreRegistry {
		demo: ThemeStore<typeof STORE_CONFIG>
	}
}

function initTheme({ key, config }: { key: string; config: ThemeStoreConfig }) {
	const store = window.resonare.createThemeStore({
		key,
		config,
	})

	store.subscribe(({ resolvedThemes }) => {
		Object.entries(resolvedThemes).forEach(([key, value]) => {
			document.documentElement.dataset[key] = value
		})
	})

	store.restore()

	store.sync()
}

export const themeScript = `${resonareInlineScript}
(${initTheme.toString()})(${JSON.stringify({ key: STORE_KEY, config: STORE_CONFIG })})`

const THEME_LABELS = {
	color: 'color',
	colorScheme: 'color scheme',
	contrast: 'contrast',
	spacing: 'spacing',
	fontSize: 'font size',
} as const

export function ThemeSelect() {
	const { themes, setThemes } = useResonare(() =>
		window.resonare.getThemeStore(STORE_KEY),
	)

	const themesAndOptions = getThemesAndOptions(STORE_CONFIG)

	return (
		<div className='theme-select'>
			{themesAndOptions.map(([theme, options]) => (
				<React.Fragment key={theme}>
					<label htmlFor={theme} style={{ textTransform: 'capitalize' }}>
						{THEME_LABELS[theme]}
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
