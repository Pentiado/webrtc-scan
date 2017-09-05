import {expect} from 'chai';
import 'webrtc-adapter';
import Connection from '../src/scan/connection';

describe('Connection', function () {
  describe.skip('getTurnConfig', function () {
    it('should work', async function () {
      const response = await Connection.getTurnConfig();
      console.log(response);
      expect(response.iceServers).to.be.an('array');
    });
  })
});