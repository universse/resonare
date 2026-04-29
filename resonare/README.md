# Resonare [![Version](https://img.shields.io/npm/v/resonare.svg?labelColor=black&color=blue)](https://www.npmjs.com/package/resonare)

 A state store for multi-dimensional themes and user preferences. [Check out the demo](https://resonare.universse.workers.dev).

## Features

- Define and manage themes and user preferences, e.g.:
  - Color scheme: system, light, dark
  - Contrast preference: standard, high
  - Spacing: compact, comfortable, spacious
  - Showing, hiding, or collapsing sidebar/sections
  - etc.
- Framework-agnostic
- Prevent flicker on page load
- Honor system preferences
- Support sections with independent theming
- Sync theme selection across tabs and windows
- Flexible client-side persistence options, defaulting to localStorage
- Support server-side persistence
- Type-safe

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

### 1. Create inline script

When storing theme selection in `localStorage`, an inline `<script>` that restores user preferences and updates the DOM before first paint is required to prevent flicker.

```ts
import { createInlineThemeScript, type ThemeStoreConfig } from 'resonare'

const CONFIG = {
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
} as const satisfies ThemeStoreConfig

export const themeScript = createInlineThemeScript({
  config: CONFIG,
  handler: ({ resolvedThemes }) => {
    Object.entries(resolvedThemes).forEach(([key, value]) => {
      document.documentElement.dataset[key] = value
    })
  },
})
```

### 2. Inject inline script

Inject the script into the `<head>` of your HTML document. The exact pattern differs by framework. Here are some examples.

```tsx
// React.js
<script suppressHydrationWarning>{themeScript}</script>

// TanStack Router/Start
import { ScriptOnce } from '@tanstack/router'

<ScriptOnce>{themeScript}</ScriptOnce>

// Astro.js
<script is:inline set:html={themeScript} />
```

### 3. Initialize the store

Refer to the [Framework Integration](#framework-integration) section for examples.

## API

### `createThemeStore`

```ts
import {
  createThemeStore,
  localStorageAdapter,
  type ThemeStoreConfig,
} from 'resonare'

const CONFIG = {
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
} as const satisfies ThemeStoreConfig

const themeStore = createThemeStore(CONFIG, {
  // optional, useful for server-side persistence
  initialState: persistedStateFromDb, // persisted state returned by themeStore.toPersist()

  // optional, specify your own client storage or null to disable client-side persistence
  // localStorage is used by default
  storage: localStorageAdapter({ key: 'resonare' }),
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

// sync user preferences across tabs/windows if supported by the storage adapter
const stopSync = themeStore.sync()

stopSync?.()

// subscribe to theme changes
const unsubscribe = themeStore.subscribe(({ themes, resolvedThemes }) => {
  Object.entries(resolvedThemes).forEach(([key, value]) => {
    if (key === 'sidebarWidth') {
      document.documentElement.style.setProperty('--sidebar-width', `${value}px`)
    } else {
      document.documentElement.dataset[key] = value
    }
  })
})

unsubscribe()

// destroy the store and clean up event listeners
themeStore.destroy()
```

### `createInlineThemeScript`

Generates a self-contained script string that restores persisted user preferences before first paint.

```ts
import { createInlineThemeScript, type ThemeStoreConfig } from 'resonare'

const CONFIG = {
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
} as const satisfies ThemeStoreConfig

const script = createInlineThemeScript({
  config: CONFIG,
  handler: ({ resolvedThemes }) => {
    Object.entries(resolvedThemes).forEach(([key, value]) => {
      document.documentElement.dataset[key] = value
    })
  },
})
```

## Framework Integration

### React

#### Client-side persistence

```tsx
import {
  createInlineThemeScript,
  createThemeStore,
  getThemesAndOptions,
  type ThemeScriptParameter,
} from 'resonare'
import { useResonare } from 'resonare/react'

const PARAM = {
  key: 'demo',
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
    },
  },
  handler: ({ resolvedThemes }) => {
    Object.entries(resolvedThemes).forEach(([key, value]) => {
      document.documentElement.dataset[key] = String(value)
    })
  },
} as const satisfies ThemeScriptParameter

export const themeScript = createInlineThemeScript(PARAM)

const themeStore = createThemeStore(PARAM.config)


function ThemeSelect() {
  const { themes, setThemes } = useResonare(themeStore)

  React.useEffect(() => {
    const unsubscribe = subscribe(PARAM.handler)

    const stopSync = sync()

    restore()

    return () => {
      stopSync?.()

      unsubscribe()
    }
  }, [subscribe, restore, sync])

  return getThemesAndOptions(PARAM.config).map(([theme, options]) => (
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

#### Server-side persistence

The inline script is not required.

```tsx
import * as React from 'react'
import {
  createThemeStore,
  getThemesAndOptions,
  memoryStorageAdapter,
  type ThemeStoreConfig,
} from 'resonare'
import { useResonare } from 'resonare/react'

const CONFIG = {
  colorScheme: {
    options: ['light', 'dark'],
  },
  contrast: {
    options: ['standard', 'high'],
  },
} as const satisfies ThemeStoreConfig

export function ThemeSelect({ persistedStateFromDb }) {
  const [themeStore] = React.useState(() =>
    createThemeStore(CONFIG, {
      initialState: persistedStateFromDb,
      // pass null instead if syncing across tabs/windows is not needed
      storage: memoryStorageAdapter({ key: 'resonare' }),
    }),
  )

  const { themes, setThemes, subscribe, sync } = useResonare(themeStore)

  React.useEffect(() => {
    const unsubscribe = subscribe(({ resolvedThemes }) => {
      Object.entries(resolvedThemes).forEach(([key, value]) => {
        document.documentElement.dataset[key] = String(value)
      })
    })

    const stopSync = sync()

    return () => {
      stopSync?.()

      unsubscribe()
    }
  }, [subscribe, sync])

  return getThemesAndOptions(CONFIG).map(([theme, options]) => (
    <div key={theme}>
      <label htmlFor={theme}>{theme}</label>
      <select
        id={theme}
        name={theme}
        onChange={async (e) => {
          setThemes({ [theme]: e.target.value })

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
