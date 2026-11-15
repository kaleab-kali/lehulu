import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Pages build. VITE_BASE: "/" for Docker and Vercel, "/<repo>/" for GitHub Pages (set by the workflow).
// VITE_DATA_MODE: "api" (Docker, talks to the Rust server) or "local" (live demo, browser storage).
// `--mode demo` (local) / `--mode api` sets it too, so the scripts work in PowerShell and cmd (no `VAR=x cmd`).
export default defineConfig(({ mode }) => {
  if (mode === 'demo' || mode === 'api') process.env.VITE_DATA_MODE ??= mode === 'demo' ? 'local' : 'api';
  return {
    base: process.env.VITE_BASE ?? '/',
    resolve: {
      alias: { '@flows': resolve(__dirname, '../flows'), '@seed': resolve(__dirname, '../server/seed') },
    },
    server: {
      fs: { allow: ['..'] },
      // `pnpm dev:api`: forward API calls to `cargo run` on :8080
      proxy: { '/v1': 'http://127.0.0.1:8080', '/dev/sms': 'http://127.0.0.1:8080' },
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          savanna: resolve(__dirname, 'index.html'),
          jobs: resolve(__dirname, 'jobs/index.html'),
          partner: resolve(__dirname, 'partner/index.html'),
          employer: resolve(__dirname, 'employer/index.html'),
          embed: resolve(__dirname, 'embed/index.html'),
          blank: resolve(__dirname, 'blank.html'),
        },
      },
    },
    test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
  } as never; // `test` (Vitest) is not in Vite's own config type
});
