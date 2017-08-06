import {expect} from 'chai';
import {AudioTest} from '../../src/scan/audio';
import 'webrtc-adapter';

describe('AudioTest', function () {
  describe('', function () {
    it('should return error', async function () {
      const audioTest = new AudioTest({testTimeout: 1000});
      const audio = new Audio('http://localhost:8080/stereo.mp3');
      await new Promise((resolve) => {
        audio.oncanplay = resolve;
      });
      console.log(audio.readyState);
      const stream = audio.captureStream();
      await audioTest.run(stream);
      expect(audioTest.state).to.equal('error');
    });

    it('should return success', async function () {
      const audioTest = new AudioTest({testTimeout: 1000});

      const audio = new Audio('http://localhost:8080/stereo.mp3');
      await new Promise((resolve) => {
        audio.oncanplay = resolve;
      });
      console.log(audio.readyState);
      audio.play();
      const stream = audio.captureStream();
      await audioTest.run(stream);
      expect(audioTest.state).to.equal('success');
    })
  });

  describe('dBFS', function () {
    it('should return number', function () {
      expect(AudioTest.dBFS(123)).to.be.a('number');
    });
  });
});
