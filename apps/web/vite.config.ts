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
    // three.js is the whole library, about 740 kB (react-three-fiber registers every class it has, so none can be
    // left out), and it can't be split further. It's in a file of its own that loads only when the 3D window opens:
    // nothing that big loads with the page.
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        // The big libraries each get a file of their own, cached across releases of Bench.
        codeSplitting: {
          groups: [
            { name: 'dockview', test: /node_modules[\\/](dockview|dockview-core|dockview-react)[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            // three.js draws the 3D window, and loads only when that opens.
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            // react-three-fiber, drei and what they draw on: also only with the 3D view.
            { name: 'r3f', test: /node_modules[\\/](@react-three|camera-controls|three-stdlib|three-mesh-bvh|troika-[a-z-]+|maath|zustand|its-fine|suspend-react)[\\/]/ },
          ],
        },
      },
    },
  },
});
