import {expect} from 'chai';
import 'webrtc-adapter';

import NetworkTest from '../../src/scan/tests/network';

describe('Network tests', function () {
  describe('run', function () {
    it('upd relay', async function () {
      const networkTest = new NetworkTest({protocol: 'udp', type: 'relay'});
      await networkTest.run();
      console.log(networkTest);
    });

    it.skip('tcp relay', async function () {
      const networkTest = new NetworkTest({protocol: 'tcp', type: 'relay'});
      await networkTest.run();
    });

    it.skip('tcp relay', async function () {
      const networkTest = new NetworkTest({type: 'ipv6', params: {optional: [{googIPv6: true}]}});
      await networkTest.run();
    });
  });
});
