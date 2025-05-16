import { createThemeStore } from 'palettez'
import { memoryStorageAdapter } from 'palettez/storage'
import * as React from 'react'

const ThemeStoreContext = React.createContext(null)

export function useThemeStoreContext() {
	return React.useContext(ThemeStoreContext)
}

export function ThemeStoreProvider({
	configsByKey,
	initialThemesByKey,
	children,
}: { initialThemesByKey: any; configsByKey: any; children: React.ReactNode }) {
	const stores = React.useMemo(() => {
		return Object.keys(configsByKey).reduce((acc, key) => {
			acc[key] = createThemeStore({
				key,
				config: configsByKey[key],
				initialThemes: initialThemesByKey[key],
				storage: memoryStorageAdapter(),
			})
			return acc
		}, {})
	}, [configsByKey, initialThemesByKey])

	return (
		<ThemeStoreContext.Provider value={stores}>
			{children}
		</ThemeStoreContext.Provider>
	)
}
