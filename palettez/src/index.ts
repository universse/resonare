import {
	type StorageAdapter,
	type StorageAdapterCreate,
	type StorageAdapterCreator,
	localStorageAdapter,
	memoryStorageAdapter,
	sessionStorageAdapter,
} from './storage'

export {
	createThemeStore,
	getThemeStore,
	localStorageAdapter,
	sessionStorageAdapter,
	memoryStorageAdapter,
	getThemesAndOptions,
	type ThemeConfig,
	type ThemeStoreOptions,
	type ThemeStore,
	type StorageAdapterCreator,
	// type Themes,
}

const PACKAGE_NAME = 'palettez'

type ThemeOption = {
	value: string
	isDefault?: boolean
	media?: [string, string, string]
}

type ThemeConfig = Record<string, Array<string | ThemeOption>>

type KeyedThemeConfig = Record<string, Record<string, ThemeOption>>

type Themes<T extends ThemeConfig> = {
	[K in keyof T]: T[K] extends Array<infer U>
		? U extends string
			? U
			: U extends ThemeOption
				? U['value']
				: never
		: never
}

type Listener<T extends ThemeConfig> = (
	updatedThemes: Themes<T>,
	resolvedThemes: Themes<T>,
) => void

type ThemeStoreOptions = {
	key?: string
	config: ThemeConfig
	initialThemes?: Record<string, string>
	storage?: StorageAdapterCreate
}

const isClient = !!(
	typeof window !== 'undefined' &&
	typeof window.document !== 'undefined' &&
	typeof window.document.createElement !== 'undefined'
)

function getThemesAndOptions(
	config: ThemeConfig,
): Array<[string, Array<string>]> {
	return Object.entries(config).map(([theme, options]) => {
		return [
			theme,
			options.map((option) =>
				typeof option === 'string' ? option : option.value,
			),
		]
	})
}

class ThemeStore<T extends ThemeConfig> {
	#options: Required<Omit<ThemeStoreOptions, 'config'>> & {
		config: KeyedThemeConfig
	}
	#storage: StorageAdapter

	#defaultThemes: Themes<T>
	#currentThemes: Themes<T>
	#resolvedOptionsByTheme: Record<string, Record<string, string>>

	#listeners: Set<Listener<T>> = new Set<Listener<T>>()
	#abortController = new AbortController()

	constructor({
		key = PACKAGE_NAME,
		config,
		initialThemes = {},
		storage = localStorageAdapter(),
	}: ThemeStoreOptions) {
		const keyedConfig: KeyedThemeConfig = Object.fromEntries(
			Object.entries(config).map(([theme, options]) => [
				theme,
				Object.fromEntries(
					options.map((option) => {
						return typeof option === 'string'
							? [option, { value: option }]
							: [option.value, option]
					}),
				),
			]),
		)

		this.#options = { key, config: keyedConfig, initialThemes, storage }

		this.#defaultThemes = Object.fromEntries(
			Object.entries(keyedConfig).map(([theme, themeOptions]) => {
				const options = Object.values(themeOptions)
				const defaultOption =
					options.find((option) => option.isDefault) || options[0]
				return [theme, defaultOption!.value]
			}),
		) as Themes<T>

		this.#currentThemes = { ...this.#defaultThemes, ...initialThemes }

		this.#storage = this.#options.storage({
			abortController: this.#abortController,
		})

		this.#resolvedOptionsByTheme = Object.fromEntries(
			Object.keys(keyedConfig).map((theme) => [theme, {}]),
		)
	}

	getThemes = (): Themes<T> => {
		return this.#currentThemes
	}

	getResolvedThemes = (): Themes<T> => {
		return this.#resolveThemes()
	}

	setThemes = async (themes: Partial<Themes<T>>): Promise<void> => {
		this.#setThemesAndNotify({ ...this.#currentThemes, ...themes })

		await this.#storage.setItem(this.#options.key, this.#currentThemes)

		this.#storage.broadcast?.(this.#options.key, this.#currentThemes)
	}

	restore = async (): Promise<void> => {
		const persistedThemes = await this.#storage.getItem(this.#options.key)

		for (const key of Object.keys(persistedThemes)) {
			if (!Object.hasOwn(this.#defaultThemes, key)) {
				delete persistedThemes[key as keyof typeof persistedThemes]
			}
		}

		this.#setThemesAndNotify({ ...this.#defaultThemes, ...persistedThemes })
	}

	// clear = async (): Promise<void> => {
	// 	this.#setThemesAndNotify({ ...this.#defaultThemes })

	// 	await this.#storage.removeItem(this.#options.key)

	// 	this.#storage.broadcast?.(this.#options.key, this.#currentThemes)
	// }

	subscribe = (callback: Listener<T>): (() => void) => {
		this.#listeners.add(callback)

		return () => {
			this.#listeners.delete(callback)

			if (this.#listeners.size === 0) {
				this.destroy()
			}
		}
	}

	sync = (): (() => void) => {
		if (!this.#storage.watch) {
			throw new Error(
				`[${PACKAGE_NAME}] No watch method was provided for storage.`,
			)
		}

		return this.#storage.watch((key, persistedThemes) => {
			if (key !== this.#options.key) return

			this.#setThemesAndNotify(
				(persistedThemes as Themes<T>) || this.#defaultThemes,
			)
		})
	}

	destroy = (): void => {
		this.#listeners.clear()
		this.#abortController.abort()
		registry.delete(this.#options.key)
	}

	#setThemesAndNotify = (theme: Themes<T>): void => {
		this.#currentThemes = theme
		const resolvedThemes = this.#resolveThemes()
		this.#notify(resolvedThemes)
	}

	#resolveThemes = (): Themes<T> => {
		return Object.fromEntries(
			Object.entries(this.#currentThemes).map(([theme, optionKey]) => {
				const option = this.#options.config[theme]![optionKey]!

				const resolved = this.#resolveThemeOption({ theme, option })

				return [theme, resolved]
			}),
		) as Themes<T>
	}

	#resolveThemeOption = ({
		theme,
		option,
	}: {
		theme: string
		option: ThemeOption
	}): string => {
		if (!option.media) return option.value

		if (!isClient) {
			console.warn(
				`[${PACKAGE_NAME}] Option with key "media" cannot be resolved in server environment.`,
			)
			return option.value
		}

		if (!this.#resolvedOptionsByTheme[theme]![option.value]) {
			const {
				media: [media, ifMatch, ifNotMatch],
			} = option

			const mq = window.matchMedia(media)

			this.#resolvedOptionsByTheme[theme]![option.value] = mq.matches
				? ifMatch
				: ifNotMatch

			mq.addEventListener(
				'change',
				(e) => {
					this.#resolvedOptionsByTheme[theme]![option.value] = e.matches
						? ifMatch
						: ifNotMatch

					if (this.#currentThemes[theme] === option.value) {
						this.#setThemesAndNotify({ ...this.#currentThemes })
					}
				},
				{ signal: this.#abortController.signal },
			)
		}

		return this.#resolvedOptionsByTheme[theme]![option.value]!
	}

	#notify = (resolvedThemes: Themes<T>): void => {
		for (const listener of this.#listeners) {
			listener(this.#currentThemes, resolvedThemes)
		}
	}
}

const registry = new Map<string, ThemeStore<ThemeConfig>>()

function createThemeStore<T extends ThemeStoreOptions>(
	options: T,
): ThemeStore<T['config']> {
	const storeKey = options.key || PACKAGE_NAME

	if (registry.has(storeKey)) {
		registry.get(storeKey)!.destroy()
	}

	const themeStore = new ThemeStore<T['config']>(options)

	registry.set(storeKey, themeStore)

	return themeStore
}

function getThemeStore<T extends string = typeof PACKAGE_NAME>(key?: T) {
	const storeKey = key || PACKAGE_NAME

	if (!registry.has(storeKey)) {
		throw new Error(
			`[${PACKAGE_NAME}] Theme store with key '${storeKey}' could not be found. Please run \`createThemeStore\` with key '${storeKey}' first.`,
		)
	}

	return registry.get(storeKey)! as ThemeStoreRegistry[T]
}

export interface ThemeStoreRegistry extends Record<string, ThemeStore<any>> {}
