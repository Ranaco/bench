import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    // Wait for a file to finish being written before reloading it. Without this, two quick saves
    // to the same file on Windows can leave the page running the first, half-finished version.
    watch: { awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 25 } },
  },
  build: {
    // three.js is about 600 kB on its own and can't be split further, but it's in a file of its own that loads only
    // when the 3D window opens: nothing that big loads with the page.
    chunkSizeWarningLimit: 650,
    rolldownOptions: {
      output: {
        // The big libraries each get a file of their own, cached across releases of Bench.
        codeSplitting: {
          groups: [
            { name: 'dockview', test: /node_modules[\\/](dockview|dockview-core|dockview-react)[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            // three.js draws the 3D window, and loads only when that opens.
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
          ],
        },
      },
    },
  },
});
