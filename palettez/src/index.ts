import {
	localStorageAdapter,
	type StorageAdapter,
	type StorageAdapterCreate,
} from './storage'

const PACKAGE_NAME = 'palettez'

type ThemeOption = {
	value: string
	media?: [string, string, string]
}

export type ThemeConfig = Record<
	string,
	{
		options: Array<string | ThemeOption>
		defaultOption?: string
	}
>

// { [themeKey]: { [optionKey]: ThemeOption } }
type KeyedThemeConfig<T extends ThemeConfig> = {
	[K in keyof T]: Record<string, ThemeOption>
}

export type Themes<T extends ThemeConfig> = {
	[K in keyof T]: T[K]['options'] extends Array<infer U>
		? U extends string
			? U
			: U extends ThemeOption
				? U['value']
				: never
		: never
}

type Listener<T extends ThemeConfig> = (value: {
	themes: Themes<T>
	resolvedThemes: Themes<T>
}) => void

type PersistedState<T extends ThemeConfig> = {
	version: 1
	themes: Themes<T>
	systemOptions: {
		[K in keyof T]?: [Themes<T>[K], Themes<T>[K]]
	}
}

export type ThemeStoreOptions<T extends ThemeConfig> = {
	key?: string
	config: T
	initialState?: Partial<PersistedState<T>>
	storage?: StorageAdapterCreate
}

export type ThemeAndOptions<T extends ThemeConfig> = Array<
	{
		[K in keyof T]: [
			K,
			Array<
				T[K]['options'] extends Array<infer U>
					? U extends string
						? U
						: U extends ThemeOption
							? U['value']
							: never
					: never
			>,
		]
	}[keyof T]
>

export function getThemesAndOptions<T extends ThemeConfig>(config: T) {
	return Object.entries(config).map(([themeKey, { options }]) => {
		return [
			themeKey,
			options.map((option) =>
				typeof option === 'string' ? option : option.value,
			),
		]
	}) as ThemeAndOptions<T>
}

export function getDefaultThemes<T extends ThemeConfig>(config: T) {
	return Object.fromEntries(
		Object.entries(config).map(([themeKey, { options, defaultOption }]) => {
			const defaultOptionValue =
				defaultOption ??
				(typeof options[0] === 'string' ? options[0] : options[0]!.value)

			return [themeKey, defaultOptionValue]
		}),
	) as Themes<T>
}

const isClient = !!(
	typeof window !== 'undefined' &&
	typeof window.document !== 'undefined' &&
	typeof window.document.createElement !== 'undefined'
)

export class ThemeStore<T extends ThemeConfig> {
	#defaultThemes: Themes<T>
	#currentThemes: Themes<T>

	#options: Required<Omit<ThemeStoreOptions<T>, 'config' | 'initialState'>> & {
		config: KeyedThemeConfig<T>
	}

	#systemOptions: PersistedState<T>['systemOptions']

	#storage: StorageAdapter

	#listeners: Set<Listener<T>> = new Set<Listener<T>>()

	#mediaQueryCache: Record<string, MediaQueryList>

	#abortController = new AbortController()

	constructor({
		key = PACKAGE_NAME,
		config,
		initialState = {},
		storage = localStorageAdapter(),
	}: ThemeStoreOptions<T>) {
		const keyedConfig: Record<string, Record<string, ThemeOption>> = {}
		const systemOptions: Record<string, [string, string]> =
			initialState.systemOptions || {}

		Object.entries(config).forEach(([themeKey, { options }]) => {
			keyedConfig[themeKey] = keyedConfig[themeKey] || {}

			options.forEach((option) => {
				if (typeof option === 'string') {
					keyedConfig[themeKey]![option] = { value: option }
				} else {
					if (option.media && !initialState.systemOptions?.[themeKey]) {
						systemOptions[themeKey] = [option.media[1], option.media[2]]
					}

					keyedConfig[themeKey]![option.value] = option
				}
			})
		})

		this.#options = {
			key,
			config: keyedConfig as KeyedThemeConfig<T>,
			storage,
		}

		this.#systemOptions = systemOptions as PersistedState<T>['systemOptions']

		this.#defaultThemes = getDefaultThemes(config)

		this.#currentThemes = { ...this.#defaultThemes, ...initialState.themes }

		this.#storage = this.#options.storage({
			abortController: this.#abortController,
		})

		this.#mediaQueryCache = {}
	}

	getThemes = (): Themes<T> => {
		return this.#currentThemes
	}

	getResolvedThemes = (): Themes<T> => {
		return this.#resolveThemes()
	}

	setThemes = async (
		themes:
			| Partial<Themes<T>>
			| ((currentThemes: Themes<T>) => Partial<Themes<T>>),
	): Promise<void> => {
		const updatedThemes =
			typeof themes === 'function' ? themes(this.#currentThemes) : themes

		this.#setThemesAndNotify({ ...this.#currentThemes, ...updatedThemes })

		const stateToPersist = this.getStateToPersist()

		await this.#storage.setItem(this.#options.key, stateToPersist)

		this.#storage.broadcast?.(this.#options.key, stateToPersist)
	}

	updateSystemOption = <K extends keyof T>(
		themeKey: K,
		[ifMatch, ifNotMatch]: [Themes<T>[K], Themes<T>[K]],
	) => {
		this.#systemOptions[themeKey] = [ifMatch, ifNotMatch]

		this.setThemes({ ...this.#currentThemes })
	}

	getStateToPersist = (): PersistedState<T> => {
		return {
			version: 1,
			themes: this.#currentThemes,
			systemOptions: this.#systemOptions,
		}
	}

	restore = async (): Promise<void> => {
		let persistedState = await this.#storage.getItem(this.#options.key)

		if (!persistedState) {
			this.#setThemesAndNotify({ ...this.#defaultThemes })
			return
		}

		// for backwards compatibility
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
		if (!this.#storage.watch) {
			console.warn(
				`[${PACKAGE_NAME}] No watch method was provided for storage.`,
			)

			return
		}

		return this.#storage.watch((key, persistedState) => {
			if (key !== this.#options.key) return

			this.#systemOptions = (persistedState as PersistedState<T>).systemOptions

			this.#setThemesAndNotify((persistedState as PersistedState<T>).themes)
		})
	}

	_destroy = (): void => {
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
				const option = this.#options.config[themeKey]![optionKey]!

				const resolved = this.#resolveThemeOption({ themeKey, option })

				return [themeKey, resolved]
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

		if (!isClient) {
			console.warn(
				`[${PACKAGE_NAME}] Option with key "media" cannot be resolved in server environment.`,
			)

			return option.value
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
	#registry = new Map<string, ThemeStore<ThemeConfig>>()

	create = <T extends ThemeConfig>(
		options: ThemeStoreOptions<T>,
	): ThemeStore<T> => {
		const storeKey = options.key || PACKAGE_NAME

		if (this.#registry.has(storeKey)) {
			this.destroy(storeKey as any)
		}

		const themeStore = new ThemeStore<T>(options)

		this.#registry.set(storeKey, themeStore as ThemeStore<ThemeConfig>)

		return themeStore
	}

	get = <T extends keyof ThemeStoreRegistry>(key?: T) => {
		const storeKey = key || PACKAGE_NAME

		if (!this.#registry.has(storeKey)) {
			throw new Error(
				`[${PACKAGE_NAME}] Theme store with key '${storeKey}' could not be found. Please run \`createThemeStore\` with key '${storeKey}' first.`,
			)
		}

		return this.#registry.get(storeKey)!
	}

	destroy = <T extends keyof ThemeStoreRegistry>(key?: T) => {
		const storeKey = key || PACKAGE_NAME

		if (!this.#registry.has(storeKey)) {
			throw new Error(
				`[${PACKAGE_NAME}] Theme store with key '${storeKey}' could not be found. Please run \`createThemeStore\` with key '${storeKey}' first.`,
			)
		}

		this.#registry.get(storeKey)!._destroy()
		this.#registry.delete(storeKey)
	}
}

const registry = new Registry()

export const createThemeStore = registry.create
export const getThemeStore = registry.get
export const destroyThemeStore = registry.destroy

export interface ThemeStoreRegistry {}
