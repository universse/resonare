import * as React from 'react'
import {
	createInlineThemeScript,
	createThemeStore,
	getThemesAndOptions,
	localStorageAdapter,
	type ThemeScriptParameter,
} from 'resonare'
import { useResonare } from 'resonare/react'

const PARAM = {
	key: 'demo',
	config: {
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
	},
	handler: ({ resolvedThemes }) => {
		Object.entries(resolvedThemes).forEach(([key, value]) => {
			document.documentElement.dataset[key] = String(value)
		})
	},
} as const satisfies ThemeScriptParameter

export const themeScript = createInlineThemeScript([PARAM])

const THEME_LABELS = {
	color: 'color',
	colorScheme: 'color scheme',
	contrast: 'contrast',
	spacing: 'spacing',
	fontSize: 'font size',
} as const

const themeStore = createThemeStore(PARAM.config, {
	storage: localStorageAdapter({ key: PARAM.key }),
})

export function ThemeSelect() {
	const { themes, setThemes, subscribe, sync, restore } =
		useResonare(themeStore)

	const themesAndOptions = getThemesAndOptions(PARAM.config)

	React.useEffect(() => {
		const unsubscribe = subscribe(PARAM.handler)

		const stopSync = sync()

		restore()

		return () => {
			stopSync?.()

			unsubscribe()
		}
	}, [subscribe, restore, sync])

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
