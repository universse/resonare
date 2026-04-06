import { name as PACKAGE_NAME } from '../../package.json' with { type: 'json' }

export type StorageAdapter = {
	get: () => object | null
	set: (value: object) => void
	// del: () => void
	broadcast?: (value: object) => void
	watch?: (cb: (value: object) => void) => () => void
}

export type StorageAdapterCreate = ({
	abortController,
}: {
	abortController: AbortController
}) => StorageAdapter

export type StorageAdapterCreator<Options> = (
	options: Options,
) => StorageAdapterCreate

export const localStorageAdapter: StorageAdapterCreator<{
	key: string
	type?: 'localStorage' | 'sessionStorage'
}> = ({ key, type = 'localStorage' }) => {
	return ({ abortController }) => {
		return {
			get: () => {
				return JSON.parse(window[type].getItem(key) || 'null')
			},

			set: (value: object) => {
				window[type].setItem(key, JSON.stringify(value))
			},

			// del: () => {
			// 	window[type].removeItem(key)
			// },

			watch: (cb) => {
				const controller = new AbortController()

				window.addEventListener(
					'storage',
					(e) => {
						if (e.storageArea !== window[type]) return

						if (e.key !== key) return

						cb(JSON.parse(e.newValue!))
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

export const memoryStorageAdapter: StorageAdapterCreator<{
	key: string
}> = ({ key }) => {
	return ({ abortController }) => {
		const storage = new Map<string, object>()
		const channel = new BroadcastChannel(PACKAGE_NAME)

		return {
			get: () => {
				return storage.get(key) || null
			},

			set: (value: object) => {
				storage.set(key, value)
			},

			// del: () => {
			// 	storage.delete(key)
			// },

			broadcast: (value: object) => {
				channel.postMessage({ key, value })
			},

			watch: (cb) => {
				const controller = new AbortController()

				channel.addEventListener(
					'message',
					(e) => {
						if (e.data.key !== key) return

						cb(e.data.value)
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
