import AudioTest from './tests/audio-test';

const testCases = {
  AUDIOCAPTURE: 'Audio capture',
  CHECKRESOLUTION240: 'Check resolution 320x240',
  CHECKRESOLUTION480: 'Check resolution 640x480',
  CHECKRESOLUTION720: 'Check resolution 1280x720',
  CHECKSUPPORTEDRESOLUTIONS: 'Check supported resolutions',
  DATATHROUGHPUT: 'Data throughput',
  IPV6ENABLED: 'Ipv6 enabled',
  NETWORKLATENCY: 'Network latency',
  NETWORKLATENCYRELAY: 'Network latency - Relay',
  UDPENABLED: 'Udp enabled',
  TCPENABLED: 'Tcp enabled',
  VIDEOBANDWIDTH: 'Video bandwidth',
  RELAYCONNECTIVITY: 'Relay connectivity',
  REFLEXIVECONNECTIVITY: 'Reflexive connectivity',
  HOSTCONNECTIVITY: 'Host connectivity'
};

type EventsOptions = 'done' | 'update';

class WebRTCScan {
  static testCases = {
    audio: ['AUDIOCAPTURE'],
    video: ['CHECKRESOLUTION240', 'CHECKRESOLUTION480'],

  };

  private events = {};

  constructor () {}

  /**
   * Run scan
   * @param testCases - List of tests to run
   */
  run(testCases = WebRTCScan.testCases) {
    // AudioTest
  }

  /**
   *
   * @param event
   * @returns Stop listening function
   */
  on(event : EventsOptions, func : Function) : Function {
    this.events[event] = this.events[event] || [];
    this.events[event].push(func);
    return () => {
      this.events[event] = this.events[event].filter((f : Function) => f !== func);
    }
  }

  private emit(event : EventsOptions) {
  }
}