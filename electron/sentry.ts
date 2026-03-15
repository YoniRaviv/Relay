import * as Sentry from '@sentry/electron/main'
import { app } from 'electron'
import os from 'node:os'

const SENTRY_DSN = "https://41848ed43cba7cae394e1fb388dec6ec@o4511047909179392.ingest.de.sentry.io/4511047913439312"

Sentry.init({
    dsn: SENTRY_DSN,
    enabled: app.isPackaged,
    release: `relay@${app.getVersion()}`,
    environment: app.isPackaged ? 'production' : 'development',
    sendDefaultPii: false,
    beforeSend(event) {
        const homeDir = os.homedir()
        let json = JSON.stringify(event)
        json = json.replace(/sk-ant-[a-zA-Z0-9_-]+/g, '[REDACTED]')
        json = json.replace(new RegExp(homeDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '~')
        return JSON.parse(json)
    },
})
