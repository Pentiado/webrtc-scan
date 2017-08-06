// require('../../src/scan/audio');
import {AudioTest} from '../../src/scan/audio';

describe('Audio', function () {
  it('should work', function () {
    console.log(AudioTest.dBFS(123));
    console.log('works');
  });
});