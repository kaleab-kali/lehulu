import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Library build: one `lehulu.js` file other sites load with a single <script type="module"> tag.
export default defineConfig(({ mode }) => {
  if (mode === 'demo' || mode === 'api') process.env.VITE_DATA_MODE ??= mode === 'demo' ? 'local' : 'api';
  return {
    resolve: {
      alias: { '@flows': resolve(__dirname, '../flows'), '@seed': resolve(__dirname, '../server/seed') },
    },
    define: { 'import.meta.env.VITE_LIB': JSON.stringify('true') },
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      lib: { entry: resolve(__dirname, 'src/lehulu.ts'), formats: ['es'], fileName: () => 'lehulu.js' },
      rollupOptions: { output: { inlineDynamicImports: true, assetFileNames: 'lehulu-assets/[name]-[hash][extname]' } },
    },
  };
});
