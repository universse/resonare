import { name as PACKAGE_NAME } from '../package.json' with { type: 'json' }
import {
	localStorageAdapter,
	type StorageAdapter,
	type StorageAdapterCreate,
} from './storage'

type ThemeValue = string | number | boolean

type ThemeOption<T extends ThemeValue = string> = {
	value: T
	media?: [string, T, T]
}

type ThemeConfig<T extends ThemeValue = string> =
	| {
			options: [
				T | ThemeOption<T>,
				T | ThemeOption<T>,
				...ReadonlyArray<T | ThemeOption<T>>,
			]
			initialValue?: T
	  }
	| T

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
		: T[K] extends infer U
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
	version: 1
	themes: Partial<Themes<T>>
	systemOptions: SystemOptions<T>
}

type ThemeStoreConstructor<T extends ThemeStoreConfig> = {
	key?: string
	config: T
	initialState?: Partial<PersistedState<T>>
	storage?: StorageAdapterCreate | null
}

export type ThemeAndOptions<T extends ThemeStoreConfig> = Array<
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
			typeof themeConfig === 'object'
				? themeConfig.options.map((option) =>
						typeof option === 'object' ? option.value : option,
					)
				: [],
		]
	}) as ThemeAndOptions<T>
}

export function getDefaultThemes<T extends ThemeStoreConfig>(config: T) {
	return Object.fromEntries(
		Object.entries(config).map(([themeKey, themeConfig]) => {
			if (typeof themeConfig === 'object') {
				return [
					themeKey,
					themeConfig.initialValue ??
						(typeof themeConfig.options[0] === 'object'
							? themeConfig.options[0].value
							: themeConfig.options[0]),
				]
			} else {
				return [themeKey, themeConfig]
			}
		}),
	) as Themes<T>
}

export class ThemeStore<T extends ThemeStoreConfig> {
	#defaultThemes: Themes<T>
	#currentThemes: Themes<T>

	#options: {
		key: string
		config: KeyedThemeStoreConfig<T>
	}

	#systemOptions: SystemOptions<T>

	#storage: StorageAdapter | null

	#listeners: Set<Listener<T>> = new Set<Listener<T>>()

	#mediaQueryCache: Record<string, MediaQueryList>

	#abortController = new AbortController()

	constructor({
		key = PACKAGE_NAME,
		config,
		initialState = {},
		storage = localStorageAdapter(),
	}: ThemeStoreConstructor<T>) {
		const systemOptions: Record<string, [ThemeValue, ThemeValue]> = {
			...initialState.systemOptions,
		}

		const keyedConfig = Object.fromEntries(
			Object.entries(config).map(([themeKey, themeConfig]) => {
				const entries =
					typeof themeConfig === 'object'
						? themeConfig.options.map((option) => {
								if (typeof option === 'object') {
									if (option.media && !Object.hasOwn(systemOptions, themeKey)) {
										systemOptions[themeKey] = [option.media[1], option.media[2]]
									}
									return [String(option.value), option]
								}
								return [String(option), { value: option }]
							})
						: []
				return [themeKey, Object.fromEntries(entries)]
			}),
		) as KeyedThemeStoreConfig<T>

		this.#options = {
			key,
			config: keyedConfig,
		}

		this.#systemOptions = systemOptions as SystemOptions<T>

		this.#defaultThemes = getDefaultThemes(config)

		this.#currentThemes = { ...this.#defaultThemes, ...initialState.themes }

		this.#storage =
			storage?.({
				abortController: this.#abortController,
			}) ?? null

		this.#mediaQueryCache = {}
	}

	getThemes = (): Themes<T> => {
		return this.#currentThemes
	}

	getResolvedThemes = (): Themes<T> => {
		return this.#resolveThemes()
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
			this.#storage.set(this.#options.key, stateToPersist)
			this.#storage.broadcast?.(this.#options.key, stateToPersist)
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
			version: 1,
			themes: this.#currentThemes,
			systemOptions: this.#systemOptions,
		}
	}

	restore = (): void => {
		let persistedState = this.#storage?.get(this.#options.key)

		if (!persistedState) {
			this.#setThemesAndNotify({ ...this.#defaultThemes })
			return
		}

		// for backward compatibility
		if (!Object.hasOwn(persistedState, 'version')) {
			persistedState = {
				version: 1,
				themes: persistedState,
				systemOptions: this.#systemOptions,
			}
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

	subscribe = (
		callback: Listener<T>,
		{ immediate = false }: { immediate?: boolean } = {},
	): (() => void) => {
		if (immediate) {
			callback({
				themes: this.#currentThemes,
				resolvedThemes: this.#resolveThemes(),
			})
		}

		this.#listeners.add(callback)

		return () => {
			this.#listeners.delete(callback)
		}
	}

	sync = (): (() => void) | undefined => {
		if (!this.#storage?.watch) {
			// if (this.#storage) {
			// 	console.warn(
			// 		`[${PACKAGE_NAME}] No watch method was provided for storage.`,
			// 	)
			// } else {
			// 	console.warn(`[${PACKAGE_NAME}] No storage was provided.`)
			// }

			return
		}

		return this.#storage.watch((key, persistedState) => {
			if (key !== this.#options.key) return

			this.#systemOptions = (persistedState as PersistedState<T>).systemOptions

			this.#setThemesAndNotify((persistedState as PersistedState<T>).themes)
		})
	}

	___destroy = (): void => {
		this.#listeners.clear()
		this.#abortController.abort()
	}

	#setThemesAndNotify = (themes: Themes<T>): void => {
		this.#currentThemes = themes
		this.#notify()
	}

	#resolveThemes = (): Themes<T> => {
		return Object.fromEntries(
			Object.entries(this.#currentThemes).map(([themeKey, optionKey]) => {
				const option = this.#options.config[themeKey]?.[optionKey]

				return [
					themeKey,
					option ? this.#resolveThemeOption({ themeKey, option }) : optionKey,
				]
			}),
		) as Themes<T>
	}

	#resolveThemeOption = ({
		themeKey,
		option,
	}: {
		themeKey: string
		option: ThemeOption
	}): string => {
		if (!option.media) return option.value

		if (!IIFE) {
			if (
				!(
					typeof window !== 'undefined' &&
					typeof window.document !== 'undefined' &&
					typeof window.document.createElement !== 'undefined'
				)
			) {
				console.warn(
					`[${PACKAGE_NAME}] Option with key "media" cannot be resolved in server environment.`,
				)

				return option.value
			}
		}

		const [mediaQuery] = option.media

		if (!this.#mediaQueryCache[mediaQuery]) {
			const mediaQueryList = window.matchMedia(mediaQuery)

			this.#mediaQueryCache[mediaQuery] = mediaQueryList

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

		return this.#mediaQueryCache[mediaQuery].matches ? ifMatch : ifNotMatch
	}

	#notify = (): void => {
		for (const listener of this.#listeners) {
			listener({
				themes: this.#currentThemes,
				resolvedThemes: this.#resolveThemes(),
			})
		}
	}
}

class Registry {
	#registry = new Map<string, ThemeStore<ThemeStoreConfig>>()

	create = <T extends ThemeStoreConfig>(
		params: ThemeStoreConstructor<T>,
	): ThemeStore<T> => {
		const storeKey = params.key || PACKAGE_NAME

		let themeStore = this.#registry.get(storeKey) as ThemeStore<T>

		if (!themeStore) {
			themeStore = new ThemeStore<T>(params)
			this.#registry.set(storeKey, themeStore as ThemeStore<ThemeStoreConfig>)
		}

		return themeStore
	}

	get = <T extends keyof ThemeStoreRegistry>(key?: T) => {
		const storeKey = key || PACKAGE_NAME

		if (!this.#registry.has(storeKey)) {
			if (IIFE) {
				throw new Error(`Theme store '${storeKey}' not found.`)
			}
			throw new Error(
				`[${PACKAGE_NAME}] Theme store with key '${storeKey}' could not be found. Please run \`createThemeStore\` with key '${storeKey}' first.`,
			)
		}

		return this.#registry.get(storeKey)! as ThemeStoreRegistry[T]
	}

	destroy = <T extends keyof ThemeStoreRegistry>(key?: T) => {
		const storeKey = key || PACKAGE_NAME

		if (!this.#registry.has(storeKey)) return

		this.#registry.get(storeKey)!.___destroy()
		this.#registry.delete(storeKey)
	}
}

const registry = new Registry()

export const createThemeStore = registry.create
export const getThemeStore = registry.get
export const destroyThemeStore = registry.destroy

export * from './storage'

export interface ThemeStoreRegistry {}
