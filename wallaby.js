const wallabyWebpack = require('wallaby-webpack');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const webpackPostprocessor = wallabyWebpack({
  plugins: [
    new ForkTsCheckerWebpackPlugin()
  ]
});

module.exports = function () {
  return {
    files: [
      { pattern: 'src/scan/test.ts', load: false },
      { pattern: 'src/scan/audio/*', load: false },
    ],

    tests: [
      { pattern: 'test/**/*.spec.ts', load: false }
    ],

    postprocessor: webpackPostprocessor,

    bootstrap: function () {
      window.__moduleBundler.loadTests();
    },
    env: {
      kind: 'chrome',
      params: {
        runner: [
          '--headless',
          '--disable-gpu',
          '--disable-translate',
          '--disable-extensions',
          '--disable-background-networking',
          '--safebrowsing-disable-auto-update',
          '--disable-sync',
          '--metrics-recording-only',
          '--disable-default-apps',
          '--no-first-run',
          '--use-fake-ui-for-media-stream',
          '--use-fake-device-for-media-stream',
          '--enable-experimental-web-platform-features'
        ].join(' ')
      }
    },
    testFramework: 'mocha',
  };
};