import { defineConfig } from 'tsup';

/** Bundle the API for production. The @ems/* workspace packages are consumed as
 *  source, so they are bundled in (noExternal); all third-party deps stay
 *  external and are resolved from node_modules at runtime. */
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/^@ems\//],
});
