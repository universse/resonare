# Resonare [![Version](https://img.shields.io/npm/v/resonare.svg?labelColor=black&color=blue)](https://www.npmjs.com/package/resonare)

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

- [Demo](https://resonare.universse.workers.dev)

## Installation

To install:

```bash
npm i resonare
# or
yarn add resonare
# or
pnpm add resonare
```

## Basic Usage

It's recommended to initialize Resonare in a synchronous script to avoid theme flicker on page load. If your project's bundler supports importing static asset as string, you can inline the minified version of Resonare to reduce the number of HTTP requests. Check out the demo for example of this pattern with Vite.

```html
<script src="https://unpkg.com/resonare"></script>
<!-- or -->
<script src="https://cdn.jsdelivr.net/npm/resonare"></script>

<script>
  ;(async () => {
    const themeStore = window.resonare.createThemeStore({
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

    themeStore.subscribe(({ resolvedThemes }) => {
      for (const [theme, optionKey] of Object.entries(resolvedThemes)) {
        document.documentElement.dataset[theme] = optionKey
      }
    })

    await themeStore.restore()
    themeStore.sync()
  })()
</script>
```

If you are using TypeScript, add `node_modules/resonare/global.d.ts` to `include` in `tsconfig.json`.

```json
{
  "include": [
    "node_modules/resonare/global.d.ts",
    // ...
  ]
}
```

## API

### `createThemeStore`

```ts
import { createThemeStore, type ThemeConfig, type ThemeStore } from 'resonare'

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

declare module 'resonare' {
  interface ThemeStoreRegistry {
    resonare: ThemeStore<typeof config>
  }
}


const themeStore = createThemeStore({
  // optional, default 'resonare'
  // should be unique, also used as client storage key
  key: 'resonare',

  // required, specify theme and options
  config,

  // optional, useful for SSR
  initialState: {
    themes: {
      colorScheme: 'dark',
      contrast: 'high',
    },
  },

  // optional, specify your own client storage
  // localStorage is used by default
  storage: ({ abortController }) => ({
    getItem: (key: string) => {
      return JSON.parse(localStorage.getItem(key) || 'null')
    },

    setItem: (key: string, value: object) => {
      localStorage.setItem(key, JSON.stringify(value))
    },

    watch: (cb: (key: string, value: unknown) => void) => {
      const controller = new AbortController()

      window.addEventListener(
        'storage',
        (e) => {
          if (e.storageArea !== localStorage) return

          cb(e.key, JSON.parse(e.newValue!))
        },
        {
          signal: AbortSignal.any([
            abortController.signal,
            controller.signal,
          ]),
        },
      )

      return () => {
        controller.abort()
      }
    },
  })
})
```

### `getThemeStore`

```ts
import { getThemeStore } from 'resonare'

// Get an existing theme store by key
const themeStore = getThemeStore('resonare') 
```

### `destroyThemeStore`

```ts
import { destroyThemeStore } from 'resonare'

// Get an existing theme store by key
const themeStore = destroyThemeStore('resonare') 
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

  // get state to persist, useful for server-side persistence
  // to restore, pass the returned object to initialState
  getStateToPersist(): object

  // restore persisted theme selection from client storage
  restore(): Promise<void>

  // sync theme selection across tabs/windows
  sync(): () => void

  // subscribe to theme changes
  subscribe(
    callback: ({
      themes,
      resolvedThemes,
    }: {
      themes: Record<string, string>
      resolvedThemes: Record<string, string>
    }) => void,
    options?: { immediate?: boolean }
  ): () => void
}
```

### React Integration

Ensure that you have initialized Resonare as per instructions under [Basic Usage](#basic-usage).

```tsx
import * as React from 'react'
import { getThemesAndOptions } from 'resonare'
import { useResonare } from 'resonare/react'

function ThemeSelect() {
  const { themes, setThemes } = useResonare(() =>
    window.resonare.getThemeStore(),
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

If you are storing theme selection on the server, you can choose to use `memoryStorageAdapter` to avoid storing any data client-side. There's no need to initialize Resonare in a synchronous script. Ensure you pass the persisted theme selection when initializing Resonare as `initialState`.

```tsx
import {
  createThemeStore,
  getThemesAndOptions,
  memoryStorageAdapter,
  type ThemeConfig,
  type Themes,
} from 'resonare'
import { useResonare } from 'resonare/react'
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
      initialState: {
        themes: persistedServerThemes,
      },
      storage: memoryStorageAdapter(),
    }),
  )

  const { themes, setThemes } = useResonare(() => themeStore, {
    initOnMount: true,
  })

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
