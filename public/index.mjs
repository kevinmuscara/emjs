export let routes = {
  "/error-box.bundled.js": {
    type: 'esbuild',
    esbuildConfig: {
      entryPoints: ['/error-box.mjs'],
    },
  },
};