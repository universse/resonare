// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	createThemeStore,
	destroyThemeStore,
	getThemeStore,
	getThemesAndOptions,
	type ThemeConfig,
	type ThemeStore,
	type ThemeStoreOptions,
} from '../dist'

const mockConfig = {
	colorScheme: {
		options: [
			{
				value: 'system',
				media: ['(prefers-color-scheme: dark)', 'dark', 'light'],
			},
			'light',
			'light-modern',
			'dark',
			'dark-modern',
		],
	},
	contrast: {
		options: ['standard', 'high'],
	},
} as const satisfies ThemeConfig

declare module '../dist' {
	interface ThemeStoreRegistry {
		palettez: ThemeStore<typeof mockConfig>
	}
}

const mockStorage = {
	getItem: vi.fn(),
	setItem: vi.fn(),
	removeItem: vi.fn(),
	watch: vi.fn(),
}

const mockOptions = {
	key: 'palettez',
	config: mockConfig,
	storage: () => mockStorage,
} as const satisfies ThemeStoreOptions<typeof mockConfig>

describe('getThemesAndOptions', () => {
	it('should return the themes and options', () => {
		const themesAndOptions = getThemesAndOptions(mockConfig)

		expect(themesAndOptions).toEqual([
			[
				'colorScheme',
				['system', 'light', 'light-modern', 'dark', 'dark-modern'],
			],
			['contrast', ['standard', 'high']],
		])
	})
})

describe('ThemeStore', () => {
	beforeEach(() => {
		vi.clearAllMocks()

		setSystemColorScheme('light')
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('should create a ThemeStore instance', () => {
		const themeStore = createThemeStore(mockOptions)

		expect(themeStore).toBeDefined()
	})

	it('should get default themes', () => {
		const themeStore = createThemeStore(mockOptions)

		const themes = themeStore.getThemes()

		expect(themes).toEqual({ colorScheme: 'system', contrast: 'standard' })

		const resolvedThemes = themeStore.getResolvedThemes()

		expect(resolvedThemes).toEqual({
			colorScheme: 'light',
			contrast: 'standard',
		})
	})

	it('should set themes', async () => {
		const themeStore = createThemeStore(mockOptions)

		themeStore.setThemes({ colorScheme: 'dark', contrast: 'high' })

		const themes = themeStore.getThemes()

		expect(themes).toEqual({ colorScheme: 'dark', contrast: 'high' })

		expect(mockStorage.setItem).toBeCalledWith(
			'palettez',
			themeStore.getStateToPersist(),
		)
	})

	it('should respond to media query changes', async () => {
		setSystemColorScheme('dark')

		const themeStore = createThemeStore(mockOptions)

		const resolvedThemes1 = themeStore.getResolvedThemes()

		expect(resolvedThemes1).toEqual({
			colorScheme: 'dark',
			contrast: 'standard',
		})

		themeStore.updateSystemOption('colorScheme', [
			'dark-modern',
			'light-modern',
		])

		const resolvedThemes2 = themeStore.getResolvedThemes()

		expect(resolvedThemes2).toEqual({
			colorScheme: 'dark-modern',
			contrast: 'standard',
		})

		expect(mockStorage.setItem).toBeCalledWith('palettez', {
			version: 1,
			themes: {
				colorScheme: 'system',
				contrast: 'standard',
			},
			systemOptions: {
				colorScheme: ['dark-modern', 'light-modern'],
			},
		})
	})

	it('should restore from initial state', async () => {
		setSystemColorScheme('dark')

		const themeStore = createThemeStore({
			...mockOptions,
			initialState: {
				version: 1,
				themes: {
					colorScheme: 'system',
					contrast: 'high',
				},
				systemOptions: {
					colorScheme: ['dark-modern', 'light-modern'],
				},
			},
		})

		const themes = themeStore.getThemes()

		expect(themes).toEqual({ colorScheme: 'system', contrast: 'high' })

		const resolvedThemes = themeStore.getResolvedThemes()

		expect(resolvedThemes).toEqual({
			colorScheme: 'dark-modern',
			contrast: 'high',
		})
	})

	it('should restore from storage', async () => {
		setSystemColorScheme('dark')

		mockStorage.getItem.mockResolvedValue({
			version: 1,
			themes: {
				colorScheme: 'system',
				contrast: 'high',
			},
			systemOptions: {
				colorScheme: ['dark-modern', 'light-modern'],
			},
		})

		const themeStore = createThemeStore(mockOptions)

		await themeStore.restore()

		const themes = themeStore.getThemes()

		expect(themes).toEqual({ colorScheme: 'system', contrast: 'high' })

		const resolvedThemes = themeStore.getResolvedThemes()

		expect(resolvedThemes).toEqual({
			colorScheme: 'dark-modern',
			contrast: 'high',
		})
	})

	it('should subscribe and unsubscribe to theme changes', async () => {
		const themeStore = createThemeStore(mockOptions)

		const mockListener = vi.fn()

		const unsubscribe = themeStore.subscribe(mockListener, { immediate: true })

		await themeStore.setThemes({ contrast: 'high' })

		unsubscribe()

		themeStore.setThemes({ contrast: 'standard' })

		expect(mockListener).toHaveBeenNthCalledWith(1, {
			themes: { colorScheme: 'system', contrast: 'standard' },
			resolvedThemes: { colorScheme: 'light', contrast: 'standard' },
		})

		expect(mockListener).toHaveBeenNthCalledWith(2, {
			themes: { colorScheme: 'system', contrast: 'high' },
			resolvedThemes: { colorScheme: 'light', contrast: 'high' },
		})

		expect(mockListener).toHaveBeenCalledTimes(2)
	})
})

describe('create and read functions', () => {
	it('should create and read a ThemeStore instance', () => {
		const themeStore = createThemeStore(mockOptions)

		const store = getThemeStore('palettez')

		expect(store).toBe(themeStore)
	})

	it('should destroy', () => {
		createThemeStore(mockOptions)

		destroyThemeStore(mockOptions.key)

		expect(() => getThemeStore(mockOptions.key)).toThrow()
	})

	it('should throw an error when reading a non-existent ThemeStore', () => {
		expect(() => getThemeStore('non-existent' as any)).toThrow()
	})
})

function setSystemColorScheme(colorScheme: 'light' | 'dark') {
	Object.defineProperty(window, 'matchMedia', {
		writable: true,
		value: vi.fn().mockImplementation((query) => ({
			matches: colorScheme === 'dark',
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})),
	})
}
