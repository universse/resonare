# Resonare [![Version](https://img.shields.io/npm/v/resonare.svg?labelColor=black&color=blue)](https://www.npmjs.com/package/resonare)

A configuration-based store for restoring user preferences without flash of inaccurate styles.

## Features

- Define and manage user preferences, e.g.:
  - Color scheme: system, light, dark
  - Contrast preference: standard, high
  - Spacing: compact, comfortable, spacious
  - Showing/hiding sections
  - Sidebar width
  - etc.
- Framework-agnostic
- Prevent flicker on page load
- Honor system preferences
- Create sections with independent theming
- Sync theme selection across tabs and windows
- Flexible client-side persistence options, defaulting to localStorage
- Support server-side persistence

## Demo

[Check it out](https://resonare.universse.workers.dev).

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

It's recommended to initialize Resonare in a synchronous script to avoid flicker on page load.

Load via CDN:

```html
<script src="https://unpkg.com/resonare"></script>
<!-- or -->
<script src="https://cdn.jsdelivr.net/npm/resonare"></script>

<script>
  ;(() => {
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
          ],
        },
      },
    })

    themeStore.subscribe(({ resolvedThemes }) => {
      for (const [theme, option] of Object.entries(resolvedThemes)) {
        document.documentElement.dataset[theme] = option
      }
    })

    themeStore.restore()

    themeStore.sync()
  })()
</script>
```

Alternatively, inline the stringified version to reduce the number of HTTP requests:

```ts
import { type ThemeConfig, type ThemeStore } from 'resonare'
import { resonareInlineScript } from 'resonare/inline-script'

const themeConfig = {
  colorScheme: {
    options: [
      {
        value: 'system',
        media: ['(prefers-color-scheme: dark)', 'dark', 'light'],
      },
      'light',
      'dark',
    ],
  },
} as const satisfies ThemeConfig

declare module 'resonare' {
  interface ThemeStoreRegistry {
    resonare: ThemeStore<typeof themeConfig>
  }
}

function initTheme({ config }: { config: ThemeConfig }) {
  const themeStore = window.resonare.createThemeStore({ config })

  themeStore.subscribe(({ resolvedThemes }) => {
    Object.entries(resolvedThemes).forEach(([theme, option]) => {
      document.documentElement.dataset[theme] = option
    })
  })

  themeStore.restore()
  themeStore.sync()
}

export const themeScript = `${resonareInlineScript};
(${initTheme.toString()})(${JSON.stringify({ config: themeConfig })})`
```

Add a triple-slash directive to any `.d.ts` file in your project (e.g. `env.d.ts`):

```ts
/// <reference types="resonare/global" />
```

## API

### `createThemeStore`

```ts
import { createThemeStore, type ThemeConfig, type ThemeStore } from 'resonare'

const themeConfig = {
  colorScheme: {
    options: [
      {
        value: 'system',
        media: ['(prefers-color-scheme: dark)', 'dark', 'light'],
      },
      'light',
      'dark',
    ],
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
    initialValue: 'standard',
  },
  sidebarWidth: {
    initialValue: 240,
  },
} as const satisfies ThemeConfig

declare module 'resonare' {
  interface ThemeStoreRegistry {
    resonare: ThemeStore<typeof themeConfig>
  }
}

const themeStore = createThemeStore({
  // optional, default 'resonare'
  // should be unique, also used as client storage key
  key: 'resonare',

  // required, specify theme and options
  config: themeConfig,

  // optional, useful for server-side persistence
  initialState: persistedStateFromDb, // persisted state returned by themeStore.toPersist()

  // optional, specify your own client storage
  // localStorage is used by default
  storage: ({ abortController }) => ({
    get: (key: string) => {
      return JSON.parse(localStorage.getItem(key) || 'null')
    },

    set: (key: string, value: object) => {
      localStorage.setItem(key, JSON.stringify(value))
    },

    watch: (cb: (key: string, value: unknown) => void) => {
      const controller = new AbortController()

      window.addEventListener(
        'storage',
        (e) => {
          if (e.storageArea !== window.localStorage) return

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

// get current theme selection
// e.g.: { colorScheme: 'system', contrast: 'standard', sidebarWidth: 240 }
themeStore.getThemes()

// get resolved theme selection (after media queries)
// e.g.: { colorScheme: 'dark', contrast: 'standard', sidebarWidth: 240 }
themeStore.getResolvedThemes()

// update theme
themeStore.setThemes({ colorScheme: 'light', sidebarWidth: 280 })

// get state to persist, useful for server-side persistence
// to restore, pass the returned object to createThemeStore's initialState
themeStore.toPersist()

// restore persisted state from client-side storage
themeStore.restore()

// sync theme selection across tabs/windows if supported by the storage adapter
themeStore.sync()

// subscribe to theme changes
themeStore.subscribe(({ themes, resolvedThemes }) => {
  for (const [key, value] of Object.entries(resolvedThemes)) {
    if (key === 'sidebarWidth') {
      document.documentElement.style.setProperty('--sidebar-width', `${value}px`)
    } else {
      document.documentElement.dataset[key] = value
    }
  }
})
```

### `getThemeStore`

```ts
import { getThemeStore } from 'resonare'

// get an existing theme store by key
const themeStore = getThemeStore('resonare')
```

### `destroyThemeStore`

```ts
import { destroyThemeStore } from 'resonare'

// destroy an existing theme store by key
destroyThemeStore('resonare')
```

## Framework Integrations

### React

Ensure that you have initialized Resonare as per instructions under [Basic Usage](#basic-usage).

```tsx
import * as React from 'react'
import { getThemesAndOptions, type ThemeConfig } from 'resonare'
import { useResonare } from 'resonare/react'

const themeConfig = {
  colorScheme: {
    options: [
      {
        value: 'system',
        media: ['(prefers-color-scheme: dark)', 'dark', 'light'],
      },
      'light',
      'dark',
    ],
  },
} as const satisfies ThemeConfig

function ThemeSelect() {
  const { themes, setThemes } = useResonare(() =>
    window.resonare.getThemeStore(),
  )

  return getThemesAndOptions(themeConfig).map(([theme, options]) => (
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

## Server-side Persistence

Use `memoryStorageAdapter` to avoid storing any data client-side. The synchronous script is not required.

```tsx
import {
  createThemeStore,
  getThemesAndOptions,
  memoryStorageAdapter,
  type ThemeConfig,
} from 'resonare'
import { useResonare } from 'resonare/react'
import * as React from 'react'

const themeConfig = {
  colorScheme: {
    options: ['light', 'dark'],
  },
  contrast: {
    options: ['standard', 'high'],
  },
} as const satisfies ThemeConfig

export function ThemeSelect({ persistedStateFromDb }) {
  const [themeStore] = React.useState(() =>
    createThemeStore({
      config: themeConfig,
      initialState: persistedStateFromDb,
      storage: memoryStorageAdapter(),
    }),
  )

  const { themes, setThemes } = useResonare(() => themeStore, {
    initOnMount: true,
  })

  return getThemesAndOptions(themeConfig).map(([theme, options]) => (
    <div key={theme}>
      <label htmlFor={theme}>{theme}</label>
      <select
        id={theme}
        name={theme}
        onChange={async (e) => {
          setThemes({ [theme]: e.target.value })

          // save to server-side storage
          await saveToDb(themeStore.toPersist())
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
