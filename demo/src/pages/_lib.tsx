import * as React from 'react'
import type { ThemeConfig, ThemeStore } from 'resonare'
import resonareGlobal from 'resonare/raw?raw'
import { useResonare } from 'resonare/react'

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
		initialValue: '100%',
	},
	fontSize: {
		options: ['80%', '90%', '100%', '110%', '120%'],
		initialValue: '100%',
	},
} as const satisfies ThemeConfig

const storeKey = 'demo'

declare module 'resonare' {
	interface ThemeStoreRegistry {
		demo: ThemeStore<typeof config>
	}
}

export async function updateDom({
	key,
	config,
}: {
	key: string
	config: ThemeConfig
}) {
	const themeStore = window.resonare.createThemeStore({
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

export const themeScript = `${resonareGlobal}
(${updateDom.toString()})(${JSON.stringify({ key: storeKey, config })})`

const THEME_LABELS = {
	color: 'color',
	colorScheme: 'color scheme',
	contrast: 'contrast',
	spacing: 'spacing',
	fontSize: 'font size',
} as const

export function ThemeSelect() {
	const { themes, setThemes } = useResonare(() =>
		window.resonare.getThemeStore(storeKey),
	)

	const themesAndOptions = Object.entries(config).map(
		([themeKey, { options }]) => {
			return [
				themeKey,
				options.map((option) =>
					typeof option === 'string' ? option : option.value,
				),
			] as [keyof typeof config, Array<string>]
		},
	)

	return (
		<div className='theme-select'>
			{themesAndOptions.map(([theme, options]) => (
				<React.Fragment key={theme}>
					{/* <input type="hidden" name="key" value={storeKey} /> */}
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
