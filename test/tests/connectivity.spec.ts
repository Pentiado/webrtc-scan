import {expect} from 'chai';
import 'webrtc-adapter';

import ConnectivityTest from '../../src/scan/tests/connectivity';

describe('Connectivity tests', function () {
  describe('run', function () {
    it.skip('should run', async function () {
      const connectivityTest = new ConnectivityTest({type: 'relay'});
      await connectivityTest.run();
      console.log('connectivityTest', connectivityTest);
    });
  });
});
