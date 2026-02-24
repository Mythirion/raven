export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  devtools: { enabled: true },
  srcDir: 'src/',
  serverDir: 'src/server',
  modules: ['@nuxtjs/tailwindcss'],
  css: ['~/assets/css/tailwind.css'],
  typescript: {
    strict: true,
    typeCheck: false,
  },
  runtimeConfig: {
    appEncryptionKey: process.env.APP_ENCRYPTION_KEY || '',
    sessionSecret: process.env.SESSION_SECRET || '',
    databaseUrl: process.env.DATABASE_URL || '',
    sqlitePath: process.env.SQLITE_PATH || '/data/app.db',
    logLevel: process.env.LOG_LEVEL || 'info',
    public: {
      appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
      appName: 'Raven',
    },
  },
})
