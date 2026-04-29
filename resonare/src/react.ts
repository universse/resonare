import * as React from 'react'
import type { ThemeStore, ThemeStoreConfig } from '.'

/**
 * Subscribes a React component to a theme store.
 * @example
 * ```tsx
 * export function ThemeToggle() {
 *   const { themes, resolvedThemes, setThemes } = useResonare(store)
 *
 *   // ...
 * }
 * ```
 */
export function useResonare<T extends ThemeStoreConfig>(store: ThemeStore<T>) {
	const {
		destroy,
		getResolvedThemes,
		getThemes,
		restore,
		setThemes,
		subscribe,
		sync,
		toPersist,
		updateSystemOption,
	} = store

	const themes = React.useSyncExternalStore(subscribe, getThemes, getThemes)

	return {
		themes,
		// @ts-expect-error - workaround for React compiler as getResolvedThemes is not called again without 'themes' dependency
		resolvedThemes: getResolvedThemes(themes),
		destroy,
		restore,
		setThemes,
		subscribe,
		sync,
		toPersist,
		updateSystemOption,
	}
}
