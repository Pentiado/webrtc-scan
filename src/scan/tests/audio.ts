import Test from '../test';

// Global WebAudio context that can be shared by all tests.
// There is a very finite number of WebAudio contexts.
let audioContext : AudioContext;
try {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  audioContext = new AudioContext();
} catch (e) {
  this.log('Failed to instantiate an audio context, error: ' + e);
}

interface AudioTestConfig {
  inputChannelCount?: number,
  outputChannelCount?: number,
  bufferSize?: number,
  // Turning off echoCancellation constraint enables stereo input.
  constraints?: MediaStreamConstraints,

  collectSeconds?: number,
  // At least one LSB 16-bit data (compare is on absolute value).
  silentThreshold?: number,
  lowVolumeThreshold?: number,
  // Data must be identical within one LSB 16-bit to be identified as mono.
  monoDetectThreshold?: number,
  // Number of consequtive clipThreshold level samples that indicate clipping.
  clipCountThreshold?: number,
  clipThreshold?: number,
  testTimeout?: number,
}

interface ChannelStats { maxPeak: number, maxRms: number, clipCount: number, maxClipCount: number }

export class AudioTest extends Test {
  private config : AudioTestConfig = {
    inputChannelCount: 6,
    outputChannelCount: 2,
    bufferSize: 0,
    constraints: {audio: {optional: [{echoCancellation: false}]}},
    collectSeconds: 2.0,
    silentThreshold: 1.0 / 32767,
    lowVolumeThreshold: -60,
    monoDetectThreshold: 1.0 / 65536,
    clipCountThreshold: 6,
    clipThreshold: 1.0,
    testTimeout: 5000,
  };

  constructor(config?: AudioTestConfig) {
    super();
    this.config = {...this.config, ...config};
  }

  async run(_stream : MediaStream) {
    this.start();
    if (audioContext) {
      const stream = _stream || await navigator.mediaDevices.getUserMedia(this.config.constraints);

      if (this.checkAudioTracks(stream)) {
        const collectedAudio = await this.createAudioBuffer(stream);
        this.analyzeAudio(collectedAudio);
      }
    } else {
      this.log('error', 'WebAudio is not supported, test cannot run.');
    }
    this.done();
  }

  checkAudioTracks(stream : MediaStream) : boolean {
    const audioTracks = stream.getAudioTracks();
    const [level, message] = audioTracks.length ?
      ['success', `Audio track created using device=${audioTracks[0].label}`]
      : ['error', 'No audio track in returned stream.'];
    this.log(level, message);
    return !!audioTracks.length;
  }

  async createAudioBuffer(stream : MediaStream) : Float32Array[][] {
    const audioSource = audioContext.createMediaStreamSource(stream);
    const scriptNode = audioContext.createScriptProcessor(this.config.bufferSize, this.config.inputChannelCount,
      this.config.outputChannelCount);
    audioSource.connect(scriptNode);
    scriptNode.connect(audioContext.destination);

    const collectedAudio = await new Promise((resolve) => {
      const result = {
        collectedAudio: new Array(this.config.inputChannelCount).fill([]),
        collectedSampleCount: 0,
      };

      const timer = setTimeout(resolve.bind(null, result.collectedAudio), this.config.testTimeout);
      scriptNode.onaudioprocess = this.collectAudio.bind(this, result, () => {
        clearTimeout(timer);
        resolve(result.collectedAudio)
      });
    });

    stream.getAudioTracks()[0].stop();
    audioSource.disconnect(scriptNode);
    scriptNode.disconnect(audioContext.destination);

    return collectedAudio;
  }

  collectAudio(result, stopCollectingAudio : Function, {inputBuffer} : any) {
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
      if (first > this.config.silentThreshold || last > this.config.silentThreshold) {
        // Non-silent buffers are copied for analysis. Note that the silent
        // detection will likely cause the stored stream to contain discontinu-
        // ities, but that is ok for our needs here (just looking at levels).
        newBuffer = new Float32Array(sampleCount);
        newBuffer.set(data);
        allSilent = false;
      } else {
        // Silent buffers are not copied, but we store empty buffers so that the
        // analysis doesn't have to care.
        newBuffer = new Float32Array(0);
      }
      result.collectedAudio[c].push(newBuffer);
    }

    if (allSilent) return;

    result.collectedSampleCount += sampleCount;
    if ((result.collectedSampleCount / inputBuffer.sampleRate) >= this.config.collectSeconds) stopCollectingAudio();
  }

  analyzeAudio(channels : Float32Array[][]) {
    const activeChannels : {buffers: [], i: number, stats: ChannelStats}[] = channels
      .map((buffers, i) => ({buffers, i, stats: AudioTest.channelStats(buffers, this.config.clipThreshold)}))
      .filter(({stats: {maxPeak}}) => maxPeak > this.config.silentThreshold);

    activeChannels.forEach(({i, stats}) => {
        const dBPeak = AudioTest.dBFS(stats.maxPeak);
        const dBRms = AudioTest.dBFS(stats.maxRms);
        this.log(`Channel ${i} levels: ${dBPeak.toFixed(1)} dB (peak), ${dBRms.toFixed(1)} dB (RMS)`);
        if (dBRms < this.config.lowVolumeThreshold) {
          this.log('error', 'Microphone input level is low, increase input volume or move closer to the audio.');
        }
        if (stats.maxClipCount > this.config.clipCountThreshold) {
          this.log('warning', 'Clipping detected! Microphone input level ' +
            'is high. Decrease input volume or move away from the audio.')
        }
      });

    if (!activeChannels.length) {
      this.log('error', 'No active input channels detected. Microphone ' +
        'is most likely muted or broken, please check if muted in the ' +
        'sound settings or physically on the device. Then rerun the test.');
    } else {
      this.log('success', `Active audio input channels: ${activeChannels.length}`)
    }
    if (activeChannels.length === 2) {
      const isMono = AudioTest.isMono(channels[activeChannels[0]].buffers, channels[activeChannels[1]].buffers,
        this.config.monoDetectThreshold);
      this.log('info', isMono ? 'Mono audio detected.' : 'Stereo audio detected.');
    }
  }

  static channelStats(buffers, clipThreshold: number): ChannelStats {
    return buffers.reduce((result, samples) => {
      const rms = samples.reduce((rms, sample) => {
        result.maxPeak = Math.max(result.maxPeak, sample);
        if (result.maxPeak >= clipThreshold) {
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
  }

  static isMono(buffersL, buffersR, monoDetectThreshold : number) : boolean {
    return !buffersL.reduce((diffSamples, left, i) =>
        left.find((e, j) => (Math.abs(left[j] - buffersR[i][j]) > monoDetectThreshold))
      , 0);
  }

  static dBFS(gain: number) : number {
    const dB = 20 * Math.log(gain) / Math.log(10);
    return Math.round(dB * 10) / 10;
  }
}
