import { defineConfig } from 'vitest/config';

// Les tests de navigateur : la page construite (npm run construire), servie en local, ouverte dans un vrai
// navigateur. A part de `npm test` pour que la suite unitaire reste rapide et sans navigateur.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.e2e.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false
  }
});
