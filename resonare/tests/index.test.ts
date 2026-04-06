// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	createThemeStore,
	getThemesAndOptions,
	type ThemeStoreConfig,
} from '../dist'

const CONFIG = {
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
	sidebar: { initialValue: 200 },
} as const satisfies ThemeStoreConfig

const mockStorage = {
	get: vi.fn(),
	set: vi.fn(),
	del: vi.fn(),
	watch: vi.fn(),
}

const OPTIONS = {
	storage: () => mockStorage,
} as const

describe('getThemesAndOptions', () => {
	it('should return the themes and options', () => {
		const themesAndOptions = getThemesAndOptions(CONFIG)

		expect(themesAndOptions).toEqual([
			[
				'colorScheme',
				['system', 'light', 'light-modern', 'dark', 'dark-modern'],
			],
			['contrast', ['standard', 'high']],
			['sidebar', []],
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
		const themeStore = createThemeStore(CONFIG, OPTIONS)

		expect(themeStore).toBeDefined()
	})

	it('should get default themes', () => {
		const themeStore = createThemeStore(CONFIG, OPTIONS)

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

	it('should set themes', () => {
		const themeStore = createThemeStore(CONFIG, OPTIONS)

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

		expect(mockStorage.set).toHaveBeenCalledWith(themeStore.toPersist())
	})

	it('should respond to media query changes', () => {
		setSystemColorScheme('dark')

		const themeStore = createThemeStore(CONFIG, OPTIONS)

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

		expect(mockStorage.set).toHaveBeenCalledWith({
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

	it('should restore from initial state', () => {
		setSystemColorScheme('dark')

		const themeStore = createThemeStore(CONFIG, {
			...OPTIONS,
			initialState: {
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

	it('should restore from storage', () => {
		setSystemColorScheme('dark')

		mockStorage.get.mockReturnValue({
			themes: {
				colorScheme: 'system',
				contrast: 'high',
				sidebar: 300,
			},
			systemOptions: {
				colorScheme: ['dark-modern', 'light-modern'],
			},
		})

		const themeStore = createThemeStore(CONFIG, OPTIONS)

		themeStore.restore()

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

	it('should subscribe and unsubscribe to theme changes', () => {
		const themeStore = createThemeStore(CONFIG, OPTIONS)

		const mockListener = vi.fn()

		const unsubscribe = themeStore.subscribe(mockListener)

		themeStore.setThemes({ contrast: 'high' })

		unsubscribe()

		themeStore.setThemes({ contrast: 'standard' })

		expect(mockListener).toHaveBeenNthCalledWith(1, {
			themes: { colorScheme: 'system', contrast: 'high', sidebar: 200 },
			resolvedThemes: { colorScheme: 'light', contrast: 'high', sidebar: 200 },
		})

		expect(mockListener).toHaveBeenCalledTimes(1)
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
