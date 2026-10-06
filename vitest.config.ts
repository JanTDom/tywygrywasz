import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: true,
    // Fixed test values override inherited credentials before application modules load.
    // Tests that exercise a provider must supply synthetic values and a mocked transport.
    env: {
      NODE_ENV: 'test',
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      AUTH_RATE_LIMIT_SECRET: '',
      SUPABASE_ANON_KEY: '',
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      AUTH_EMAIL_TRANSPORT: '',
      RESEND_API_KEY: '',
      AUTH_EMAIL_FROM: '',
      APP_URL: 'http://localhost:3000',
      APP_ORIGINS: 'http://localhost:3000',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      P24_ENV: 'sandbox',
      P24_MERCHANT_ID: '',
      P24_POS_ID: '',
      P24_CRC: '',
      P24_API_KEY: '',
      P24_RETURN_URL: '',
      P24_STATUS_URL: '',
      P24_AMOUNT_GROSZ: '',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
