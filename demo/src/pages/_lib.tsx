import * as React from 'react'
import {
	createInlineThemeScript,
	createThemeStore,
	getThemesAndOptions,
	localStorageAdapter,
} from 'resonare'
import { useResonare } from 'resonare/react'

const STORE = {
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
} as const satisfies Parameters<typeof createInlineThemeScript>[0][number]

export const themeScript = createInlineThemeScript([STORE])

const THEME_LABELS = {
	color: 'color',
	colorScheme: 'color scheme',
	contrast: 'contrast',
	spacing: 'spacing',
	fontSize: 'font size',
} as const

const themeStore = createThemeStore(STORE.config, {
	storage: localStorageAdapter({ key: STORE.key }),
})

export function ThemeSelect() {
	const { themes, setThemes, restore, subscribe, sync } =
		useResonare(themeStore)

	React.useEffect(() => {
		restore()
		const unsubscribe = subscribe(STORE.handler)
		const stopSync = sync()

		return () => {
			unsubscribe()
			stopSync?.()
		}
	}, [restore, subscribe, sync])

	const themesAndOptions = getThemesAndOptions(STORE.config)

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
