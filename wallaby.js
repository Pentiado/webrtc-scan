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
      { pattern: 'src/scan/audio/*', load: false }
    ],

    tests: [
      { pattern: 'test/**/*.spec.ts', load: false }
    ],

    postprocessor: webpackPostprocessor,

    bootstrap: function () {
      window.__moduleBundler.loadTests();
    },
    env: {
      kind: 'chrome'
    },
    testFramework: 'mocha'
  };
};