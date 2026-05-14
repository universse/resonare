import { name as PACKAGE_NAME } from '../package.json' with { type: 'json' }
import {
	localStorageAdapter,
	type StorageAdapter,
	type StorageAdapterCreate,
} from './storage'

export * from './storage'

type ThemeValue = string | number | boolean

type ThemeOption<T extends ThemeValue = string> = {
	value: T
	media?: [string, T, T]
}

type ThemeConfig<T extends ThemeValue = string> =
	| {
			options: ReadonlyArray<T | ThemeOption<T>>
			initialValue?: T
	  }
	| { initialValue: T; options?: never }

export type ThemeStoreConfig = Record<
	string,
	ThemeConfig<string> | ThemeConfig<number> | ThemeConfig<boolean>
>

// { [themeKey]: { [optionKey]: ThemeOption } }
type KeyedThemeStoreConfig<T extends ThemeStoreConfig> = {
	[K in keyof T]: Record<string, ThemeOption>
}

export type Themes<T extends ThemeStoreConfig> = {
	[K in keyof T]: T[K] extends { options: ReadonlyArray<infer U> }
		? U extends ThemeOption
			? U['value']
			: U
		: T[K] extends { initialValue: infer U }
			? U extends string
				? string
				: U extends number
					? number
					: boolean
			: never
}

type Listener<T extends ThemeStoreConfig> = (value: {
	themes: Themes<T>
	resolvedThemes: Themes<T>
}) => void

type ThemeKeysWithSystemOption<T extends ThemeStoreConfig> = {
	[K in keyof T]: T[K] extends { options: ReadonlyArray<infer U> }
		? U extends { media: ReadonlyArray<unknown> }
			? K
			: never
		: never
}[keyof T]

type NonSystemOptionValues<
	T extends ThemeStoreConfig,
	K extends keyof T,
> = T[K] extends { options: ReadonlyArray<infer U> }
	? U extends ThemeValue
		? U
		: U extends ThemeOption
			? U extends { media: [string, string, string] }
				? never
				: U['value']
			: never
	: never

type SystemOptions<T extends ThemeStoreConfig> = {
	[K in ThemeKeysWithSystemOption<T>]?: [
		NonSystemOptionValues<T, K>,
		NonSystemOptionValues<T, K>,
	]
}

type PersistedState<T extends ThemeStoreConfig> = {
	themes: Partial<Themes<T>>
	systemOptions: SystemOptions<T>
}

type ThemeStoreOptions<T extends ThemeStoreConfig> = {
	initialState?: Partial<PersistedState<T>>
	storage?: StorageAdapterCreate | null
}

type ThemeAndOptions<T extends ThemeStoreConfig> = Array<
	{
		[K in keyof T]: [
			K,
			Array<
				T[K] extends { options: ReadonlyArray<infer U> }
					? U extends ThemeOption
						? U['value']
						: U
					: never
			>,
		]
	}[keyof T]
>

export function getThemesAndOptions<T extends ThemeStoreConfig>(config: T) {
	return Object.entries(config).map(([themeKey, themeConfig]) => {
		return [
			themeKey,
			(themeConfig.options || []).map((option) =>
				typeof option === 'object' ? option.value : option,
			),
		]
	}) as ThemeAndOptions<T>
}

export function getDefaultThemes<T extends ThemeStoreConfig>(config: T) {
	return Object.fromEntries(
		Object.entries(config).map(([themeKey, themeConfig]) => {
			return [
				themeKey,
				themeConfig.initialValue ??
					(typeof themeConfig.options[0] === 'object'
						? themeConfig.options[0].value
						: themeConfig.options[0]),
			]
		}),
	) as Themes<T>
}

class ThemeStore<T extends ThemeStoreConfig> {
	#defaultThemes: Themes<T>

	#currentThemes: Themes<T>

	#keyedConfig: KeyedThemeStoreConfig<T>

	#systemOptions: SystemOptions<T>

	#storage: StorageAdapter | null

	#mediaQueryCache: Record<string, MediaQueryList> = {}

	#listeners: Set<Listener<T>> = new Set<Listener<T>>()

	#abortController = new AbortController()

	constructor(
		config: T,
		{
			initialState = {},
			storage = localStorageAdapter({ key: PACKAGE_NAME }),
		}: ThemeStoreOptions<T> = {},
	) {
		const systemOptions: Record<string, [ThemeValue, ThemeValue]> = {}

		this.#defaultThemes = getDefaultThemes(config)

		this.#currentThemes = { ...this.#defaultThemes, ...initialState.themes }

		this.#keyedConfig = Object.fromEntries(
			Object.entries(config).map(([themeKey, themeConfig]) => {
				const entries = (themeConfig.options || []).map((option) => {
					if (typeof option === 'object') {
						if (option.media) {
							systemOptions[themeKey] = [option.media[1], option.media[2]]
						}

						return [String(option.value), option]
					}

					return [String(option), { value: option }]
				})

				return [themeKey, Object.fromEntries(entries)]
			}),
		) as KeyedThemeStoreConfig<T>

		this.#systemOptions = { ...systemOptions, ...initialState.systemOptions }

		this.#storage =
			storage?.({
				abortController: this.#abortController,
			}) ?? null
	}

	getThemes = (): Themes<T> => {
		return this.#currentThemes
	}

	getResolvedThemes = (): Themes<T> => {
		return Object.fromEntries(
			Object.entries(this.#currentThemes).map(([themeKey, optionKey]) => {
				const option = this.#keyedConfig[themeKey]?.[optionKey]

				return [
					themeKey,
					option ? this.#resolveThemeOption({ themeKey, option }) : optionKey,
				]
			}),
		) as Themes<T>
	}

	setThemes = (
		themes:
			| Partial<Themes<T>>
			| ((currentThemes: Themes<T>) => Partial<Themes<T>>),
	): void => {
		const updatedThemes =
			typeof themes === 'function' ? themes(this.#currentThemes) : themes

		this.#setThemesAndNotify({ ...this.#currentThemes, ...updatedThemes })

		const stateToPersist = this.toPersist()

		if (this.#storage) {
			this.#storage.set(stateToPersist)
			this.#storage.broadcast?.(stateToPersist)
		}
	}

	updateSystemOption = <K extends ThemeKeysWithSystemOption<T>>(
		themeKey: K,
		[ifMatch, ifNotMatch]: [
			NonSystemOptionValues<T, K>,
			NonSystemOptionValues<T, K>,
		],
	): void => {
		this.#systemOptions[themeKey] = [ifMatch, ifNotMatch]

		this.setThemes({ ...this.#currentThemes })
	}

	toPersist = (): PersistedState<T> => {
		return {
			themes: this.#currentThemes,
			systemOptions: this.#systemOptions,
		}
	}

	restore = (): void => {
		const persistedState = this.#storage?.get()

		if (!persistedState) {
			this.#setThemesAndNotify({ ...this.#defaultThemes })
			return
		}

		this.#systemOptions = {
			...this.#systemOptions,
			...persistedState.systemOptions,
		}

		this.#setThemesAndNotify({
			...this.#defaultThemes,
			...persistedState.themes,
		})
	}

	subscribe = (callback: Listener<T>): (() => void) => {
		this.#listeners.add(callback)

		return () => {
			this.#listeners.delete(callback)
		}
	}

	sync = (): (() => void) | undefined => {
		if (!this.#storage?.watch) return

		return this.#storage.watch((persistedState) => {
			this.#systemOptions = (persistedState as PersistedState<T>).systemOptions

			this.#setThemesAndNotify((persistedState as PersistedState<T>).themes)
		})
	}

	/** Clears subscribers and aborts media-query listeners tied to this store instance. */
	destroy = (): void => {
		this.#listeners.clear()
		this.#abortController.abort()
	}

	#setThemesAndNotify = (themes: Themes<T>): void => {
		this.#currentThemes = themes

		for (const listener of this.#listeners) {
			listener({
				themes: this.#currentThemes,
				resolvedThemes: this.getResolvedThemes(),
			})
		}
	}

	#resolveThemeOption = ({
		themeKey,
		option,
	}: {
		themeKey: string
		option: ThemeOption
	}): string => {
		if (!option.media) return option.value

		if (
			!(
				typeof window !== 'undefined' &&
				typeof window.document !== 'undefined' &&
				typeof window.document.createElement !== 'undefined'
			)
		) {
			return option.value
		}

		const cache = this.#mediaQueryCache

		const [mediaQuery] = option.media

		if (!cache[mediaQuery]) {
			const mediaQueryList = window.matchMedia(mediaQuery)

			cache[mediaQuery] = mediaQueryList

			mediaQueryList.addEventListener(
				'change',
				() => {
					if (this.#currentThemes[themeKey] === option.value) {
						this.#setThemesAndNotify({ ...this.#currentThemes })
					}
				},
				{ signal: this.#abortController.signal },
			)
		}

		const [ifMatch, ifNotMatch] = this.#systemOptions[themeKey]!

		return cache[mediaQuery].matches ? ifMatch : ifNotMatch
	}
}

export type { ThemeStore }

export function createThemeStore<T extends ThemeStoreConfig>(
	config: T,
	options: ThemeStoreOptions<T> = {},
): ThemeStore<T> {
	return new ThemeStore<T>(config, options)
}

const restoreScript = <T extends ThemeValue>(
	params: Array<
		[string, Array<[string, T] | [string, T, T, string, T, T]>, Listener<any>]
	>,
) => {
	params.forEach(([key, flattenedConfig, handler]) => {
		const persistedThemes =
			JSON.parse(localStorage.getItem(key) || '{}').themes ?? {}

		handler(
			flattenedConfig.reduce<{
				themes: Record<string, ThemeValue>
				resolvedThemes: Record<string, ThemeValue>
			}>(
				(
					acc,
					[
						themeKey,
						initial,
						systemOptionValue,
						mediaQuery,
						ifMatch,
						ifNotMatch,
					],
				) => {
					const currentValue = persistedThemes[themeKey] ?? initial

					acc.resolvedThemes[themeKey] = acc.themes[themeKey] = currentValue

					if (currentValue === systemOptionValue) {
						acc.resolvedThemes[themeKey] = matchMedia(mediaQuery!).matches
							? ifMatch!
							: ifNotMatch!
					}

					return acc
				},
				{ themes: {}, resolvedThemes: {} },
			),
		)
	})
}

export type ThemeScriptParameter = {
	/** `localStorage` key; defaults to the 'resonare'. */
	key?: string
	config: ThemeStoreConfig
	handler: Listener<any>
}

/**
 * Creates an IIFE script string that reads persisted themes from `localStorage` and runs your handlers immediately.
 *
 * Useful for avoiding flash of incorrect styles.
 * @example
 * ```tsx
 * import { createInlineThemeScript } from 'resonare'
 *
 * const inlineScript = createInlineThemeScript([
 *   {
 *     key: 'my-app',
 *     config: {
 *       colorMode: { options: ['light', 'dark'] },
 *     },
 *     handler: ({ resolvedThemes }) => {
 *       document.documentElement.dataset.colorMode = String(
 *         resolvedThemes.colorMode,
 *       )
 *     },
 *   },
 * ])
 * ```
 */
export function createInlineThemeScript(
	themeScriptParameters: ThemeScriptParameter | Array<ThemeScriptParameter>,
) {
	const serializedArgs = (
		Array.isArray(themeScriptParameters)
			? themeScriptParameters
			: [themeScriptParameters]
	).map(({ key = PACKAGE_NAME, config, handler }) => {
		const flattenedConfig = Object.entries(config).map(
			([themeKey, { options, initialValue }]) => {
				const firstOption = options?.[0]

				const resolvedInitialValue =
					initialValue ??
					(typeof firstOption === 'object' ? firstOption.value : firstOption!)

				const systemOption = options?.find(
					(option): option is Required<ThemeOption> =>
						typeof option === 'object' && !!option.media,
				)

				if (systemOption) {
					const {
						value,
						media: [mediaQuery, ifMatch, ifNotMatch],
					} = systemOption

					return [
						themeKey,
						resolvedInitialValue,
						value,
						mediaQuery,
						ifMatch,
						ifNotMatch,
					]
				}

				return [themeKey, resolvedInitialValue]
			},
		)

		return `['${key}', ${JSON.stringify(flattenedConfig)}, ${handler}]`
	})

	return `(${restoreScript})([${serializedArgs}])`
}
