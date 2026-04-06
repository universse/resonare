import * as React from 'react'
import type { ThemeStore, ThemeStoreConfig } from '.'

export function useResonare<T extends ThemeStoreConfig>(store: ThemeStore<T>) {
	const {
		getThemes,
		getResolvedThemes,
		setThemes,
		updateSystemOption,
		toPersist,
		restore,
		sync,
		subscribe,
		destroy,
	} = store

	const themes = React.useSyncExternalStore(subscribe, getThemes, getThemes)

	return {
		themes,
		resolvedThemes: getResolvedThemes(),
		setThemes,
		updateSystemOption,
		toPersist,
		restore,
		sync,
		subscribe,
		destroy,
	}
}
