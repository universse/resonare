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

type KeyedThemeConfig = Record<string, Record<string, ThemeOption>>

export type Themes<T extends ThemeConfig> = {
	[K in keyof T]: T[K]['options'] extends Array<infer U>
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

export type ThemeStoreOptions<T extends ThemeConfig> = {
	key?: string
	config: T
	initialThemes?: Partial<Themes<T>>
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
	#options: Required<Omit<ThemeStoreOptions<T>, 'config'>> & {
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
	}: ThemeStoreOptions<T>) {
		const keyedConfig: KeyedThemeConfig = Object.fromEntries(
			Object.entries(config).map(([themeKey, { options }]) => [
				themeKey,
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

		this.#defaultThemes = getDefaultThemes(config)

		this.#currentThemes = { ...this.#defaultThemes, ...initialThemes }

		this.#storage = this.#options.storage({
			abortController: this.#abortController,
		})

		this.#resolvedOptionsByTheme = Object.fromEntries(
			Object.keys(keyedConfig).map((themeKey) => [themeKey, {}]),
		)
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

	#setThemesAndNotify = (themes: Themes<T>): void => {
		this.#currentThemes = themes
		const resolvedThemes = this.#resolveThemes()
		this.#notify(resolvedThemes)
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

		if (!this.#resolvedOptionsByTheme[themeKey]![option.value]) {
			const {
				media: [media, ifMatch, ifNotMatch],
			} = option

			const mq = window.matchMedia(media)

			this.#resolvedOptionsByTheme[themeKey]![option.value] = mq.matches
				? ifMatch
				: ifNotMatch

			mq.addEventListener(
				'change',
				(e) => {
					this.#resolvedOptionsByTheme[themeKey]![option.value] = e.matches
						? ifMatch
						: ifNotMatch

					if (this.#currentThemes[themeKey] === option.value) {
						this.#setThemesAndNotify({ ...this.#currentThemes })
					}
				},
				{ signal: this.#abortController.signal },
			)
		}

		return this.#resolvedOptionsByTheme[themeKey]![option.value]!
	}

	#notify = (resolvedThemes: Themes<T>): void => {
		for (const listener of this.#listeners) {
			listener(this.#currentThemes, resolvedThemes)
		}
	}
}

const registry = new Map<string, ThemeStore<ThemeConfig>>()

export function createThemeStore<T extends ThemeConfig>(
	options: ThemeStoreOptions<T>,
): ThemeStore<T> {
	const storeKey = options.key || PACKAGE_NAME

	if (registry.has(storeKey)) {
		registry.get(storeKey)!.destroy()
	}

	const themeStore = new ThemeStore<T>(options)

	registry.set(storeKey, themeStore as ThemeStore<ThemeConfig>)

	return themeStore
}

export function getThemeStore<T extends keyof ThemeStoreRegistry>(key?: T) {
	const storeKey = key || PACKAGE_NAME

	if (!registry.has(storeKey)) {
		throw new Error(
			`[${PACKAGE_NAME}] Theme store with key '${storeKey}' could not be found. Please run \`createThemeStore\` with key '${storeKey}' first.`,
		)
	}

	return registry.get(storeKey)! as ThemeStoreRegistry[T]
}

export interface ThemeStoreRegistry {}
