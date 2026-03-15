import * as Sentry from '@sentry/electron/renderer'

Sentry.init({
    dsn: 'https://41848ed43cba7cae394e1fb388dec6ec@o4511047909179392.ingest.de.sentry.io/4511047913439312',
    enabled: import.meta.env.PROD,
    release: `relay@${__APP_VERSION__}`,
    environment: import.meta.env.PROD ? 'production' : 'development',
    integrations: [Sentry.browserTracingIntegration()],
    sendDefaultPii: false,
})
