import { name as PACKAGE_NAME } from '../package.json' with { type: 'json' }

export type StorageAdapter = {
	getItem: (key: string) => object | null | Promise<object | null>
	setItem: (key: string, value: object) => void | Promise<void>
	// removeItem: (key: string) => void | Promise<void>
	broadcast?: (key: string, value: object) => void
	watch?: (cb: (key: string | null, value: object) => void) => () => void
}

export type StorageAdapterCreate = ({
	abortController,
}: {
	abortController: AbortController
}) => StorageAdapter

export type StorageAdapterCreator<Options> = (
	options?: Options,
) => StorageAdapterCreate

export const localStorageAdapter: StorageAdapterCreator<{
	storageType?: 'localStorage' | 'sessionStorage'
}> = ({ storageType = 'localStorage' } = {}) => {
	return ({ abortController }) => {
		return {
			getItem: (key: string) => {
				return JSON.parse(window[storageType].getItem(key) || 'null')
			},

			setItem: (key: string, value: object) => {
				window[storageType].setItem(key, JSON.stringify(value))
			},

			// removeItem: (key: string) => {
			// 	window[storageType].removeItem(key)
			// },

			watch: (cb) => {
				const controller = new AbortController()

				window.addEventListener(
					'storage',
					(e) => {
						if (e.storageArea !== window[storageType]) return

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
		}
	}
}

export const memoryStorageAdapter: StorageAdapterCreator<never> = () => {
	return ({ abortController }) => {
		const storage = new Map<string, object>()
		const channel = new BroadcastChannel(PACKAGE_NAME)

		return {
			getItem: (key: string) => {
				return storage.get(key) || null
			},

			setItem: (key: string, value: object) => {
				storage.set(key, value)
			},

			// removeItem: (key: string) => {
			// 	storage.delete(key)
			// },

			broadcast: (key: string, value: object) => {
				channel.postMessage({ key, value })
			},

			watch: (cb) => {
				const controller = new AbortController()

				channel.addEventListener(
					'message',
					(e) => {
						cb(e.data.key, e.data.value)
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
		}
	}
}
