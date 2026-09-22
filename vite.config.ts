import { defineConfig } from 'vite';
import path from 'path';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist',
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      'cldr/likelySubtags': path.resolve(import.meta.filename, './node_modules/cldr-core/supplemental/likelySubtags.json')
    }
  }
});
