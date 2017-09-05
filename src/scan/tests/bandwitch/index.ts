import StatisticsAggregate from './stats';
import Connection from '../../connection';
import Test from '../../test';

// Creates a loopback via relay candidates and tries to send as many packets
// with 1024 chars as possible while keeping dataChannel bufferedAmmount above
// zero.
// addTest(testSuiteName.THROUGHPUT, testCaseName.DATATHROUGHPUT, function(test) {
//   var dataChannelThroughputTest = new DataChannelThroughputTest(test);
//   dataChannelThroughputTest.run();
// });

interface DataChannelThroughputConfig {
  testDurationSeconds: number,
  maxNumberOfPacketsToSend: number
}

export class DataChannelThroughputTest extends Test {
  private config : DataChannelThroughputConfig = {
    testDurationSeconds: 5,
    maxNumberOfPacketsToSend: 1
  };

  private connection: Connection;
  private startTime : number;
  private sentPayloadBytes = 0;
  private receivedPayloadBytes = 0;
  private stopSending = false;
  private samplePacket: any[] = new Array(1024).fill('h').join('');

  private senderChannel: any;
  private receiveChannel: any;
  private bytesToKeepBuffered: number;
  private lastBitrateMeasureTime: number;
  private lastReceivedPayloadBytes: number;

  constructor(config : DataChannelThroughputConfig) {
    super();
    this.config = {...this.config, ...config};
  }

  async run() {
    this.bytesToKeepBuffered = 1024 * this.config.maxNumberOfPacketsToSend;
    this.lastBitrateMeasureTime = 0;
    this.lastReceivedPayloadBytes = 0;

    try {
      const config = await Connection.getTurnConfig();
      this.connection = new Connection(config, {constrainOfferToRemoveVideoFec: true, type: 'relay'});
      this.senderChannel = this.connection.pc1.createDataChannel(null);
      this.senderChannel.addEventListener('open', this.sendingStep.bind(this));
      this.connection.pc2.addEventListener('datachannel', this.onReceiverChannel.bind(this));
      this.connection.establishConnection();
    } catch (err) {
      this.log('error', err);
      this.done();
    }
  }

  private onReceiverChannel(event : any) {
    this.receiveChannel = event.channel;
    this.receiveChannel.addEventListener('message', this.onMessageReceived.bind(this));
  }

  sendingStep() {
    const now = Date.now();
    if (!this.startTime) {
      this.startTime = now;
      this.lastBitrateMeasureTime = now;
    }

    for (let i = 0; i !== this.config.maxNumberOfPacketsToSend; ++i) {
      if (this.senderChannel.bufferedAmount >= this.bytesToKeepBuffered) break;
      this.sentPayloadBytes += this.samplePacket.length;
      this.senderChannel.send(this.samplePacket);
    }

    if (now - this.startTime >= 1000 * this.config.testDurationSeconds) {
      this.stopSending = true;
    } else {
      setTimeout(this.sendingStep.bind(this), 1);
    }
  }

  onMessageReceived(event) {
    this.receivedPayloadBytes += event.data.length;
    const now = Date.now();

    if (now - this.lastBitrateMeasureTime >= 1000) {
      const x = (this.receivedPayloadBytes - this.lastReceivedPayloadBytes) / (now - this.lastBitrateMeasureTime);
      const bitrate = Math.round(x * 1000 * 8) / 1000;
      this.log('success', `Transmitting at ${bitrate} kbps.`);
      this.lastReceivedPayloadBytes = this.receivedPayloadBytes;
      this.lastBitrateMeasureTime = now;
    }

    if (this.stopSending && this.sentPayloadBytes === this.receivedPayloadBytes) {
      this.connection.close();
      const elapsedTime = Math.round((now - this.startTime) * 10) / 10000;
      const receivedKBits = this.receivedPayloadBytes * 8 / 1000;

      this.log('success', `Total transmitted: ${receivedKBits} kilo-bits in ${elapsedTime} seconds.`);
      this.done();
    }
  }
}

// Measures video bandwidth estimation performance by doing a loopback call via
// relay candidates for 40 seconds. Computes rtt and bandwidth estimation
// average and maximum as well as time to ramp up (defined as reaching 75% of
// the max bitrate. It reports infinite time to ramp up if never reaches it.
// addTest(testSuiteName.THROUGHPUT, testCaseName.VIDEOBANDWIDTH, function(test) {
//   var videoBandwidthTest = new VideoBandwidthTest(test);
//   videoBandwidthTest.run();
// });

export class VideoBandwidthTest extends Test {
  private config = {
    maxVideoBitrateKbps: 2000,
    durationMs: 40000,
    statStepMs: 100,
  };

  // Open the camera-test in 720p to get a correct measurement of ramp-up time.
  private constraints = {
    audio: false,
    video: {
      optional: [
        {minWidth: 1280},
        {minHeight: 720}
      ]
    }
  };

  private bweStats: StatisticsAggregate;
  private rttStats: StatisticsAggregate;
  private connection: Connection;

  private packetsLost: Number;
  private videoStats: [Number, Number];
  private startTime: Number;

  async run() {
    this.bweStats = new StatisticsAggregate(0.75 * this.config.maxVideoBitrateKbps * 1000);
    this.rttStats = new StatisticsAggregate();
    this.packetsLost = 0;
    this.videoStats = [0, 0];
    this.startTime = null;
    this.connection = null;

    const config = await Connection.getTurnConfig();
    this.connection = new Connection(config, {
      type: 'relay',
      constrainVideoBitrateKbps: this.config.maxVideoBitrateKbps,
      // FEC makes it hard to study bandwidth estimation since there seems to be
      // a spike when it is enabled and disabled. Disable it for now. FEC issue
      // tracked on: https://code.google.com/p/webrtc/issues/detail?id=3050
      // TODO: check if still valid
      constrainOfferToRemoveVideoFec: true
    });

    doGetUserMedia(this.constraints, this.gotStream.bind(this));

    Connection.getTurnConfig(this.start.bind(this), this.test.reportFatal.bind(this.test));
  }

  gotStream(stream) {
    this.connection.pc1.addStream(stream);
    this.connection.establishConnection();
    this.startTime = new Date();
    this.localStream = stream.getVideoTracks()[0];
    setTimeout(this.gatherStats.bind(this), this.statStepMs);
  }

  gatherStats() {
    const now = Date.now();
    if (now - this.startTime > this.durationMs) {
      this.test.setProgress(100);
      this.hangup();
      return;
    } else if (!this.connection.statsGatheringRunning) {
      this.connection.gatherStats(this.connection.pc1, this.localStream, this.gotStats.bind(this));
    }
    this.test.setProgress((now - this.startTime) * 100 / this.durationMs);
    setTimeout(this.gatherStats.bind(this), this.statStepMs);
  }

  gotStats(response) {
    // TODO: Remove browser specific stats gathering hack once adapter.js or
    // browsers converge on a standard.
    if (adapter.browserDetails.browser === 'chrome') {
      for (var i in response) {
        if (response[i].id === 'bweforvideo') {
          this.bweStats.add(Date.parse(response[i].timestamp),
            parseInt(response[i].googAvailableSendBandwidth));
        } else if (response[i].type === 'ssrc') {
          this.rttStats.add(Date.parse(response[i].timestamp),
            parseInt(response[i].googRtt));
          // Grab the last stats.
          this.videoStats[0] = response[i].googFrameWidthSent;
          this.videoStats[1] = response[i].googFrameHeightSent;
          this.packetsLost = response[i].packetsLost;
        }
      }
    } else if (adapter.browserDetails.browser === 'firefox') {
      for (var j in response) {
        if (response[j].id === 'outbound_rtcp_video_0') {
          this.rttStats.add(Date.parse(response[j].timestamp),
            parseInt(response[j].mozRtt));
          // Grab the last stats.
          this.jitter = response[j].jitter;
          this.packetsLost = response[j].packetsLost;
        } else if (response[j].id === 'outbound_rtp_video_0') {
          // TODO: Get dimensions from getStats when supported in FF.
          this.videoStats[0] = 'Not supported on Firefox';
          this.videoStats[1] = 'Not supported on Firefox';
          this.bitrateMean = response[j].bitrateMean;
          this.bitrateStdDev = response[j].bitrateStdDev;
          this.framerateMean = response[j].framerateMean;
        }
      }
    } else {
      this.test.reportError('Only Firefox and Chrome getStats implementations' +
        ' are supported.');
    }
    this.completed();
  }

  hangup() {
    this.connection.pc1.getLocalStreams()[0].getTracks().forEach((track : MediaStream) => track.stop());
    this.connection.close();
    this.connection = null;
  }

  completed() {
    // TODO: Remove browser specific stats gathering hack once adapter.js or
    // browsers converge on a standard.
    if (adapter.browserDetails.browser === 'chrome') {
      // Checking if greater than 2 because Chrome sometimes reports 2x2 when
      // a camera-test starts but fails to deliver frames.
      if (this.videoStats[0] < 2 && this.videoStats[1] < 2) {
        this.test.reportError('Camera failure: ' + this.videoStats[0] + 'x' +
          this.videoStats[1] + '. Cannot test bandwidth without a working ' +
          ' camera-test.');
      } else {
        this.test.reportSuccess('Video resolution: ' + this.videoStats[0] +
          'x' + this.videoStats[1]);
        this.test.reportInfo('Send bandwidth estimate average: ' +
          this.bweStats.getAverage() + ' bps');
        this.test.reportInfo('Send bandwidth estimate max: ' +
          this.bweStats.getMax() + ' bps');
        this.test.reportInfo('Send bandwidth ramp-up time: ' +
          this.bweStats.getRampUpTime() + ' ms');
      }
    } else if (adapter.browserDetails.browser === 'firefox') {
      if (parseInt(this.framerateMean) > 0) {
        this.test.reportSuccess('Frame rate mean: ' +
          parseInt(this.framerateMean));
      } else {
        this.test.reportError('Frame rate mean is 0, cannot test bandwidth ' +
          'without a working camera-test.');
      }
      this.test.reportInfo('Send bitrate mean: ' + parseInt(this.bitrateMean) +
        ' bps');
      this.test.reportInfo('Send bitrate standard deviation: ' +
        parseInt(this.bitrateStdDev) + ' bps');
    }
    this.test.reportInfo('RTT average: ' + this.rttStats.getAverage() +
      ' ms');
    this.test.reportInfo('RTT max: ' + this.rttStats.getMax() + ' ms');
    this.test.reportInfo('Lost packets: ' + this.packetsLost);

    this.test.done();
  }
}
