# Palettez

A flexible theme management library for JavaScript applications

## Features

- Manage multi-dimensional themes with multiple options, for eg:
  - Color scheme: light, dark, system
  - Contrast preference: standard, high
  - Spacing: compact, comfortable, spacious
- Framework-agnostic
- No theme flicker on page load
- Dynamically update themes based on system settings
- Multiple sections with independent theme selection
- Sync theme selection across tabs and windows
- Customizable data persistence; use localStorage by default

## Demos

- [Astro](https://palettez-astro-demo.vercel.app)
- [Next.js](https://palettez-nextjs-demo.vercel.app)
- [Remix](https://palettez-remix-demo.vercel.app)

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

It's recommended to initialize Palettez in a synchronous script to avoid theme flicker on page load. If your project's bundler supports importing static asset as string, you can inline the minified version of Palettez to reduce the number of HTTP requests. Check out the Astro/Remix demo for example of this pattern with Vite.

```html
<script src="https://unpkg.com/palettez"></script>
<!-- or -->
<script src="https://cdn.jsdelivr.net/npm/palettez"></script>

<script>
  ;(async () => {
    const themeStore = window.palettez.createThemeStore({
      config: {
        colorScheme: [
          {
            value: 'system',
            media: ['(prefers-color-scheme: dark)', 'dark', 'light'],
          },
          'light',
          'dark',
        ],
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
import { createThemeStore } from 'palettez'

type ThemeOption = {
  value: string
  isDefault?: boolean
  media?: [string, string, string] // [mediaQuery, valueIfMatch, valueIfNotMatch]
}

const themeStore = createThemeStore({
  // optional, default 'palettez'
  // should be unique, also used as storage key
  key: 'palettez',

  // required, specify theme and options
  config: {
    colorScheme: [
      {
        value: 'system',
        isDefault: true, 
        media: ['(prefers-color-scheme: dark)', 'dark', 'light'],
      },
      { value: 'light' },
      { value: 'dark' },
    ],
    contrast: [
      {
        value: 'system',
        media: [
          '(prefers-contrast: more) and (forced-colors: none)',
          'high',
          'standard',
        ],
      },
      { value: 'standard', isDefault: true },
      { value: 'high' },
    ],
  },

  // optional, initial theme values
  initialThemes?: Record<string, string>,

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
  // Get current theme selections
  getThemes(): Record<string, string>

  // Get resolved theme values (after media queries)
  getResolvedThemes(): Record<string, string>

  // Update theme selections
  setThemes(themes: Partial<Record<string, string>>): Promise<void>

  // Restore persisted theme selections
  restore(): Promise<void>

  // Sync theme selections across tabs/windows
  sync(): () => void

  // Subscribe to theme changes
  subscribe(callback: (
    themes: Record<string, string>,
    resolvedThemes: Record<string, string>
  ) => void): () => void

  // Clean up resources
  destroy(): void
}
```

## React Integration

### Client-side Usage

```tsx
import { usePalettez } from 'palettez/react'

function ThemeSelect() {
  const {
    themes,            // Current theme selections
    resolvedThemes,    // Resolved theme values
    setThemes,         // Update themes
    restore,           // Restore from storage
    sync,              // Sync across tabs
    subscribe          // Subscribe to changes
  } = usePalettez(() => window.palettez.getThemeStore())

  // ... rest of component
}
```

### Client-only persistence

Ensure that you have initialized Palettez as per instructions under [Basic Usage](#basic-usage). As theme selection is only known on the client, you should only render component with `usePalettez` once the app has mounted.

```tsx
import * as React from 'react'
import { usePalettez } from 'palettez/react'

function ThemeSelect() {
  const { 
    themes,
    setThemes,
    
    getResolvedThemes,
    restore,
    sync,
    subscribe,
  } = usePalettez(window.palettez.getThemeStore())

  return themesAndOptions.map((theme) => (
    <div key={theme.key}>
      <label htmlFor={theme.key}>{theme.label}</label>
      <select
        id={theme.key}
        name={theme.key}
        onChange={(e) => {
          setThemes({ [theme.key]: e.target.value })
        }}
        value={themes[theme.key]}
      >
        {theme.options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.value}
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
import { createThemeStore, memoryStorageAdapter } from 'palettez'
import { usePalettez } from 'palettez/react'
import * as React from 'react'

export function ThemeSelect({
  persistedServerThemes,
}: { persistedServerThemes: Record<string, string> }) {
  const [themeStore] = React.useState(() =>
    createThemeStore({
      config: {
        colorScheme: {
          label: 'Color scheme',
          options: {
            system: {
              value: 'System',
              isDefault: true,
              media: {
                query: '(prefers-color-scheme: dark)',
                ifMatch: 'dark',
                ifNotMatch: 'light',
              },
            },
            light: { value: 'Light' },
            dark: { value: 'Dark' },
          },
        },
        contrast: {
          label: 'Contrast',
          options: {
            standard: { value: 'Standard', isDefault: true },
            high: { value: 'High' },
          },
        },
      },
      initialThemes: persistedServerThemes,
      storage: memoryStorageAdapter(),
    }),
  )

  const { themesAndOptions, themes, setThemes, subscribe } = usePalettez(themeStore)

  React.useEffect(() => {
    const unsubscribe = subscribe((_, resolvedThemes) => {
      for (const [theme, optionKey] of Object.entries(resolvedThemes)) {
        ;(
          (document.querySelector('.theme') as
            | HTMLElementTagNameMap['main']
            | null) || document.documentElement
        ).dataset[theme] = optionKey
      }
    })

    return () => {
      unsubscribe()
    }
  }, [subscribe])

  return themesAndOptions.map((theme) => (
    <div key={theme.key}>
      <label htmlFor={theme.key}>{theme.label}</label>{' '}
      <select
        id={theme.key}
        name={theme.key}
        onChange={(e) => {
          setThemes({ [theme.key]: e.target.value })
        }}
        value={themes[theme.key]}
      >
        {theme.options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.value}
          </option>
        ))}
      </select>
    </div>
  ))
}
```