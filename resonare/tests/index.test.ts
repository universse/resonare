// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	createThemeStore,
	destroyThemeStore,
	getThemeStore,
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
	sidebar: {
		initialValue: 200,
	},
} as const satisfies ThemeConfig

declare module '../dist' {
	interface ThemeStoreRegistry {
		resonare: ThemeStore<typeof mockConfig>
	}
}

const mockStorage = {
	getItem: vi.fn(),
	setItem: vi.fn(),
	removeItem: vi.fn(),
	watch: vi.fn(),
}

const mockOptions = {
	key: 'resonare',
	config: mockConfig,
	storage: () => mockStorage,
} as const satisfies ThemeStoreOptions<typeof mockConfig>

describe('ThemeStore', () => {
	beforeEach(() => {
		vi.clearAllMocks()

		destroyThemeStore('resonare')

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

		expect(themeStore.getThemes()).toEqual({
			colorScheme: 'system',
			contrast: 'standard',
			sidebar: 200,
		})

		expect(themeStore.getResolvedThemes()).toEqual({
			colorScheme: 'light',
			contrast: 'standard',
			sidebar: 200,
		})
	})

	it('should set themes', async () => {
		const themeStore = createThemeStore(mockOptions)

		themeStore.setThemes({
			colorScheme: 'dark',
			contrast: 'high',
			sidebar: 300,
		})

		expect(themeStore.getThemes()).toEqual({
			colorScheme: 'dark',
			contrast: 'high',
			sidebar: 300,
		})

		expect(mockStorage.setItem).toBeCalledWith(
			'resonare',
			themeStore.getStateToPersist(),
		)
	})

	it('should respond to media query changes', async () => {
		setSystemColorScheme('dark')

		const themeStore = createThemeStore(mockOptions)

		expect(themeStore.getResolvedThemes()).toEqual({
			colorScheme: 'dark',
			contrast: 'standard',
			sidebar: 200,
		})

		themeStore.updateSystemOption('colorScheme', [
			'dark-modern',
			'light-modern',
		])

		expect(themeStore.getResolvedThemes()).toEqual({
			colorScheme: 'dark-modern',
			contrast: 'standard',
			sidebar: 200,
		})

		expect(mockStorage.setItem).toBeCalledWith('resonare', {
			version: 1,
			themes: {
				colorScheme: 'system',
				contrast: 'standard',
				sidebar: 200,
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
					sidebar: 300,
				},
				systemOptions: {
					colorScheme: ['dark-modern', 'light-modern'],
				},
			},
		})

		expect(themeStore.getThemes()).toEqual({
			colorScheme: 'system',
			contrast: 'high',
			sidebar: 300,
		})

		expect(themeStore.getResolvedThemes()).toEqual({
			colorScheme: 'dark-modern',
			contrast: 'high',
			sidebar: 300,
		})
	})

	it('should restore from storage', async () => {
		setSystemColorScheme('dark')

		mockStorage.getItem.mockResolvedValue({
			version: 1,
			themes: {
				colorScheme: 'system',
				contrast: 'high',
				sidebar: 300,
			},
			systemOptions: {
				colorScheme: ['dark-modern', 'light-modern'],
			},
		})

		const themeStore = createThemeStore(mockOptions)

		await themeStore.restore()

		expect(themeStore.getThemes()).toEqual({
			colorScheme: 'system',
			contrast: 'high',
			sidebar: 300,
		})

		expect(themeStore.getResolvedThemes()).toEqual({
			colorScheme: 'dark-modern',
			contrast: 'high',
			sidebar: 300,
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
			themes: { colorScheme: 'system', contrast: 'standard', sidebar: 200 },
			resolvedThemes: {
				colorScheme: 'light',
				contrast: 'standard',
				sidebar: 200,
			},
		})

		expect(mockListener).toHaveBeenNthCalledWith(2, {
			themes: { colorScheme: 'system', contrast: 'high', sidebar: 200 },
			resolvedThemes: { colorScheme: 'light', contrast: 'high', sidebar: 200 },
		})

		expect(mockListener).toHaveBeenCalledTimes(2)
	})
})

describe('create and read functions', () => {
	it('should create and read a ThemeStore instance', () => {
		const themeStore = createThemeStore(mockOptions)

		const store = getThemeStore('resonare')

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
