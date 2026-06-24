import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      thresholds: { lines: 60, functions: 60, branches: 50 },
      include: ['lib/**', 'app/api/**'],
      exclude: ['lib/pdf.ts', 'lib/excel.ts', 'lib/supabase/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
