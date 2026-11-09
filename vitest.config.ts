import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/index.ts',
        'src/types/**',
        'src/collectors/EventCollector.ts',
        'src/plugins/PluginInterface.ts',
        'src/exporters/Exporter.ts',
        'src/core/Tracker.ts',
      ],
    },
    testTimeout: 10000,
  },
});

