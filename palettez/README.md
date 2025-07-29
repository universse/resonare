# Palettez [![Version](https://img.shields.io/npm/v/palettez.svg?labelColor=black&color=blue)](https://www.npmjs.com/package/palettez)

A configuration-based theme store for building deeply personal user interface.

## Features

- Define and manage multi-dimensional themes, eg:
  - Color scheme: system, light, dark
  - Contrast preference: standard, high
  - Spacing: compact, comfortable, spacious
  - etc
- Framework-agnostic
- Prevent theme flicker on page load
- Honor system preferences
- Create sections with independent theming
- Sync theme selection across tabs and windows
- Flexible persistence options, defaulting to localStorage
- SSR-friendly

## Demo

- [Demo](https://palettez.universse.workers.dev)

## Installation

To install:

```bash
npm i palettez
# or
yarn add palettez
# or
pnpm add palettez
```

## Basic Usage

It's recommended to initialize Palettez in a synchronous script to avoid theme flicker on page load. If your project's bundler supports importing static asset as string, you can inline the minified version of Palettez to reduce the number of HTTP requests. Check out the demo for example of this pattern with Vite.

```html
<script src="https://unpkg.com/palettez"></script>
<!-- or -->
<script src="https://cdn.jsdelivr.net/npm/palettez"></script>

<script>
  ;(async () => {
    const themeStore = window.palettez.createThemeStore({
      config: {
        colorScheme: {
          options: [
            {
              value: 'system',
              media: ['(prefers-color-scheme: dark)', 'dark', 'light'],
            },
            'light',
            'dark',
          ]
        },
      },
    })

    themeStore.subscribe((_, resolvedThemes) => {
      for (const [theme, optionKey] of Object.entries(resolvedThemes)) {
        document.documentElement.dataset[theme] = optionKey
      }
    })

    await themeStore.restore()
    themeStore.sync()
  })()
</script>
```

If you are using TypeScript, add `palettez/global` to `compilerOptions.types` in `tsconfig.json`.

```json
{
  "compilerOptions": {
    "types": ["palettez/global"]
  }
}
```

## API

### `createThemeStore`

```ts
import { createThemeStore, type ThemeConfig, type ThemeStore } from 'palettez'

const config = {
  colorScheme: {
    options: [
      {
        value: 'system',
        media: ['(prefers-color-scheme: dark)', 'dark', 'light'],
      },
      'light',
      'dark',
    ]
  },
  contrast: {
    options: [
      {
        value: 'system',
        media: [
          '(prefers-contrast: more) and (forced-colors: none)',
          'high',
          'standard',
        ],
      },
      'standard',
      'high',
    ],
    defaultOption: 'standard',
  }
} as const satisfies ThemeConfig

declare module 'palettez' {
	interface ThemeStoreRegistry {
		palettez: ThemeStore<typeof config>
	}
}


const themeStore = createThemeStore({
  // optional, default 'palettez'
  // should be unique, also used as storage key
  key: 'palettez',

  // required, specify theme and options
  config,

  // optional, useful for SSR
  initialThemes: {
    colorScheme: 'dark',
    contrast: 'high',
  },

  // optional, specify your own storage solution
  // localStorage is used by default
  storage: ({ abortController }) => ({
    getItem: async (key: string) => {
      try {
        return JSON.parse(localStorage.getItem(key) || 'null')
      } catch {
        return null
      }
    },

    setItem: async (key: string, value: object) => {
      localStorage.setItem(key, JSON.stringify(value))
    },

    watch: (cb: (key: string, value: unknown) => void) => {
      const controller = new AbortController()

      window.addEventListener(
        'storage',
        (e) => {
          if (e.storageArea !== localStorage) return
          const persistedThemes = JSON.parse(e.newValue || 'null')
          cb(e.key, persistedThemes)
        },
        {
          signal: AbortSignal.any([
            abortController.signal,
            controller.signal,
          ]),
        },
      )

      return () => controller.abort()
    },
  })
})
```

### `getThemeStore`

```ts
import { getThemeStore } from 'palettez'

// Get an existing theme store by key
const themeStore = getThemeStore('palettez') 
```

### ThemeStore Methods

```ts
interface ThemeStore<T> {
  // get current theme selection
  getThemes(): Record<string, string>

  // get resolved theme selection (after media queries)
  getResolvedThemes(): Record<string, string>

  // update theme
  setThemes(themes: Partial<Record<string, string>>): Promise<void>

  // restore persisted theme selection from storage
  restore(): Promise<void>

  // sync theme selection across tabs/windows
  sync(): () => void

  // subscribe to theme changes
  subscribe(callback: (
    themes: Record<string, string>,
    resolvedThemes: Record<string, string>
  ) => void): () => void

  // clean up resources
  destroy(): void
}
```

### React Integration

Ensure that you have initialized Palettez as per instructions under [Basic Usage](#basic-usage).

```tsx
import * as React from 'react'
import { getThemesAndOptions } from 'palettez'
import { usePalettez } from 'palettez/react'

function ThemeSelect() {
  const { themes, setThemes } = usePalettez(() =>
    window.palettez.getThemeStore(),
  )

  return getThemesAndOptions(config).map(([theme, options]) => (
    <div key={theme}>
      <label htmlFor={theme}>{theme}</label>
      <select
        id={theme}
        name={theme}
        onChange={(e) => {
          setThemes({ [theme]: e.target.value })
        }}
        value={themes[theme]}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  ))
}
```

### Server-side persistence

If you are storing theme selection on the server, you can choose to use `memoryStorageAdapter` to avoid storing any data client-side. There's no need to initialize Palettez in a synchronous script. Ensure you pass the persisted theme selection when initializing Palettez as `initialThemes`.

```tsx
import {
  createThemeStore,
  getThemesAndOptions,
  memoryStorageAdapter,
  type ThemeConfig,
  type Themes,
} from 'palettez'
import { usePalettez } from 'palettez/react'
import * as React from 'react'

const config = {
  colorScheme: {
    options: ['light', 'dark'],
  },
  contrast: {
    options: ['standard', 'high'],
  },
} as const satisfies ThemeConfig

export function ThemeSelect({
  persistedServerThemes,
}: { persistedServerThemes: Themes<typeof config> }) {
  const [themeStore] = React.useState(() =>
    createThemeStore({
      config,
      initialThemes: persistedServerThemes,
      storage: memoryStorageAdapter(),
    }),
  )

  const { themes, setThemes } = usePalettez(() => themeStore)

  return getThemesAndOptions(config).map(([theme, options]) => (
    <div key={theme}>
      <label htmlFor={theme}>{theme}</label>
      <select
        id={theme}
        name={theme}
        onChange={(e) => {
          setThemes({ [theme]: e.target.value })
        }}
        value={themes[theme]}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  ))
}
```
