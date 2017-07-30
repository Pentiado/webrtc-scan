// Global WebAudio context that can be shared by all tests.
// There is a very finite number of WebAudio contexts.

import {names as eventNames} from '../events'

let audioContext;
try {
  window.AudioContext = window.AudioContext || window.webkitAudioContext;
  audioContext = new AudioContext();
} catch (e) {
  console.log('Failed to instantiate an audio context, error: ' + e);
}

const dBFS = (gain: number) => {
  const dB = 20 * Math.log(gain) / Math.log(10);
  return Math.round(dB * 10) / 10;
};

/*
addTest(testSuiteName.MICROPHONE, testCaseName.AUDIOCAPTURE, function(test) {
  var micTest = new MicTest(test);
  micTest.run();
});
*/

export default class MicTest {
  constructor() {
    this.inputChannelCount = 6;
    this.outputChannelCount = 2;
    // Buffer size set to 0 to let Chrome choose based on the platform.
    this.bufferSize = 0;
    // Turning off echoCancellation constraint enables stereo input.
    this.constraints = {
      audio: {
        optional: [
          {echoCancellation: false}
        ]
      }
    };

    this.collectSeconds = 2.0;
    // At least one LSB 16-bit data (compare is on absolute value).
    this.silentThreshold = 1.0 / 32767;
    this.lowVolumeThreshold = -60;
    // Data must be identical within one LSB 16-bit to be identified as mono.
    this.monoDetectThreshold = 1.0 / 65536;
    // Number of consequtive clipThreshold level samples that indicate clipping.
    this.clipCountThreshold = 6;
    this.clipThreshold = 1.0;

    // Populated with audio as a 3-dimensional array:
    //   collectedAudio[channels][buffers][samples]
    this.collectedAudio = [];
    this.collectedSampleCount = 0;
    for (let i = 0; i < this.inputChannelCount; ++i) {
      this.collectedAudio[i] = [];
    }
  }

  run() {
    if (typeof audioContext === 'undefined') {
      this.emit('error', 'WebAudio is not supported, test cannot run.');
      this.emit('done');
    } else {
      doGetUserMedia(this.constraints, this.gotStream.bind(this));
    }
  }

  gotStream(stream) {
    if (!this.checkAudioTracks(stream)) {
      this.emit('done');
      return;
    }
    this.createAudioBuffer(stream);
  }

  checkAudioTracks(stream) {
    this.stream = stream;
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length < 1) {
      this.emit(eventNames.ERROR, 'No audio track in returned stream.');
      return false;
    }
    this.emit(eventNames.SUCCESS, `Audio track created using device=${audioTracks[0].label}`);
    return true;
  }

  createAudioBuffer() {
    this.audioSource = audioContext.createMediaStreamSource(this.stream);
    this.scriptNode = audioContext.createScriptProcessor(this.bufferSize,
      this.inputChannelCount, this.outputChannelCount);
    this.audioSource.connect(this.scriptNode);
    this.scriptNode.connect(audioContext.destination);
    this.scriptNode.onaudioprocess = this.collectAudio.bind(this);
    this.stopCollectingAudio = setTimeoutWithProgressBar(
      this.onStopCollectingAudio.bind(this), 5000);
  }

  collectAudio({inputBuffer}) {
    // Simple silence detection: check first and last sample of each channel in
    // the buffer. If both are below a threshold, the buffer is considered
    // silent.
    const sampleCount = inputBuffer.length;
    let allSilent = true;

    for (let c = 0; c < inputBuffer.numberOfChannels; c++) {
      const data = inputBuffer.getChannelData(c);
      const first = Math.abs(data[0]);
      const last = Math.abs(data[sampleCount - 1]);
      let newBuffer;
      if (first > this.silentThreshold || last > this.silentThreshold) {
        // Non-silent buffers are copied for analysis. Note that the silent
        // detection will likely cause the stored stream to contain discontinu-
        // ities, but that is ok for our needs here (just looking at levels).
        newBuffer = new Float32Array(sampleCount);
        newBuffer.set(data);
        allSilent = false;
      } else {
        // Silent buffers are not copied, but we store empty buffers so that the
        // analysis doesn't have to care.
        newBuffer = new Float32Array();
      }
      this.collectedAudio[c].push(newBuffer);
    }
    if (!allSilent) {
      this.collectedSampleCount += sampleCount;
      if ((this.collectedSampleCount / inputBuffer.sampleRate) >= this.collectSeconds) {
        this.stopCollectingAudio();
      }
    }
  }

  onStopCollectingAudio() {
    this.stream.getAudioTracks()[0].stop();
    this.audioSource.disconnect(this.scriptNode);
    this.scriptNode.disconnect(audioContext.destination);
    this.analyzeAudio(this.collectedAudio);
    this.emit(eventNames.DONE);
  }

  analyzeAudio(channels) {
    const activeChannels = channels.filter(this.channelStats.bind(this));
    if (!activeChannels.length) {
      this.emit(eventNames.ERROR, 'No active input channels detected. Microphone ' +
        'is most likely muted or broken, please check if muted in the ' +
        'sound settings or physically on the device. Then rerun the test.');
    } else {
      this.emit(eventNames.SUCCESS, `Active audio input channels: ${activeChannels.length}`)
    }
    if (activeChannels.length === 2) {
      this.detectMono(channels[activeChannels[0]], channels[activeChannels[1]]);
    }
  }

  channelStats(buffers, channelNumber) {
    const result = buffers.reduce((result, samples) => {
      const rms = samples.reduce((rms, sample) => {
        result.maxPeak = Math.max(result.maxPeak, sample);
        if (result.maxPeak >= this.clipThreshold) {
          result.clipCount++;
          result.maxClipCount = Math.max(result.maxClipCount, result.clipCount);
        } else {
          result.clipCount = 0;
        }
        return rms + sample * sample;
      }, 0.0);

      if (samples.length > 0) {
        // RMS is calculated over each buffer, meaning the integration time will
        // be different depending on sample rate and buffer size. In practise
        // this should be a small problem.
        result.maxRms = Math.max(result.maxRms, Math.sqrt(rms / samples.length));
      }

      return result;
    }, {
      maxPeak: 0.0,
      maxRms: 0.0,
      clipCount: 0,
      maxClipCount: 0,
    });


    if (result.maxPeak > this.silentThreshold) {
      const dBPeak = dBFS(result.maxPeak);
      const dBRms = dBFS(result.maxRms);
      this.test.reportInfo('Channel ' + channelNumber + ' levels: ' +
        dBPeak.toFixed(1) + ' dB (peak), ' + dBRms.toFixed(1) + ' dB (RMS)');
      if (dBRms < this.lowVolumeThreshold) {
        this.emit(eventNames.ERROR, 'Microphone input level is low, increase input ' +
          'volume or move closer to the microphone.');
      }
      if (result.maxClipCount > this.clipCountThreshold) {
        this.emit(eventNames.WARNING, 'Clipping detected! Microphone input level ' +
          'is high. Decrease input volume or move away from the microphone.')
      }
      return true;
    }
    return false;
  }

  detectMono(buffersL, buffersR) {
    const diffSamples = buffersL.reduce((diffSamples, left, i) =>
        left.find((e, j) => (Math.abs(left[j] - buffersR[i][j]) > this.monoDetectThreshold))
      , 0);

    this.emit(eventNames.INFO, diffSamples ? 'Stereo microphone detected.' : 'Mono microphone detected.');
  }
}
