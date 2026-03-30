import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'adapters/nextjs': 'src/adapters/nextjs.ts',
    'adapters/express': 'src/adapters/express.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['@a2a-js/sdk', 'x402', 'next', 'express'],
});
