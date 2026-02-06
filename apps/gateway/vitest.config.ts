import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            ENCRYPTION_KEY: 'test-encryption-key-must-be-at-least-32-chars-long!',
            ADMIN_TOKEN: 'test-admin-token-for-development',
            ENVIRONMENT: 'development',
          },
        },
      },
    },
  },
})
