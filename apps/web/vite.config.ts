import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { benchBundledLessons, benchFiles } from './server/files.ts';

/** Monaco's ESM folder (through this app's node_modules link, which Vite follows to the real one). */
const MONACO_VS = fileURLToPath(new URL('./node_modules/monaco-editor/esm/vs', import.meta.url)).split('\\').join('/');

export default defineConfig({
  // benchFiles: your home folder, read and written through the dev server; benchBundledLessons: your lesson code, in a
  // build (see server/files.ts).
  plugins: [react(), benchFiles(), benchBundledLessons()],
  resolve: {
    alias: [
      // monaco-vim still imports Monaco's files by their old paths (monaco-editor/esm/vs/…), which Monaco 0.57's package
      // map no longer allows. Point them at the same files, so both share one Monaco.
      { find: /^monaco-editor\/esm\/vs\/(.*)$/, replacement: `${MONACO_VS}/$1.js` },
    ],
  },
  server: {
    port: 5180,
    // Wait for a file to finish being written before reloading it. Without this, two quick saves
    // to the same file on Windows can leave the page running the first, half-finished version.
    watch: { awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 25 } },
  },
  build: {
    // Two things are bigger than this, and neither loads with the page:
    //   - three.js, about 740 kB (react-three-fiber registers every class it has, so none can be left out): only when
    //     the 3D window opens;
    //   - the code editor, Monaco, with TypeScript itself in its worker (about 6.8 MB: the whole compiler, which is what
    //     checks your code as you type): only when the Code window opens.
    // Neither can be split further. The page's own code stays well under 800 kB.
    chunkSizeWarningLimit: 7000,
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
