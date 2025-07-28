import {
	type ThemeConfig,
	type ThemeStore,
	getThemesAndOptions,
} from 'palettez'
import pallettezGlobal from 'palettez/raw?raw'
import { usePalettez } from 'palettez/react'

const config = {
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
} as const satisfies ThemeConfig

const storeKey = 'single'

declare module 'palettez' {
	interface ThemeStoreRegistry {
		single: ThemeStore<typeof config>
	}
}

const themesAndOptions = getThemesAndOptions(config)

export async function updateDom({
	key,
	config,
}: { key: string; config: ThemeConfig }) {
	const themeStore = window.palettez.createThemeStore({
		key,
		config,
	})

	themeStore.subscribe((_, resolvedThemes) => {
		for (const [theme, optionKey] of Object.entries(resolvedThemes)) {
			document.documentElement.dataset[theme] = optionKey
		}
	})

	await themeStore.restore()
	themeStore.sync()
}

export const themeScript = `${pallettezGlobal}
(${updateDom.toString()})(${JSON.stringify({ key: storeKey, config })})`

export function ThemeSelect() {
	const { themes, setThemes } = usePalettez(() =>
		window.palettez.getThemeStore(storeKey),
	)

	return themesAndOptions.map(([theme, options]) => (
		<div key={theme}>
			<input type='hidden' name='key' value={storeKey} />
			<label htmlFor={theme}>{theme}</label>
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
		</div>
	))
}
