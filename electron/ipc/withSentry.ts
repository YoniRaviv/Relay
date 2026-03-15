import * as Sentry from '@sentry/electron/main'
import type { IpcMainInvokeEvent } from 'electron'

export function withSentry<Args extends unknown[], R>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: Args) => Promise<R>,
) {
    return async (event: IpcMainInvokeEvent, ...args: Args): Promise<R> => {
        try {
            return await handler(event, ...args)
        } catch (error) {
            Sentry.captureException(error, { tags: { ipcChannel: channel } })
            throw error
        }
    }
}
