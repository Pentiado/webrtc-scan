import Connection from '../connection';
import Test from '../test';

// Test whether it can connect via UDP to a TURN server
// Get a TURN config, and try to get a relay candidate using UDP.
// addTest(testSuiteName.NETWORK, testCaseName.UDPENABLED, function(test) {
//   var networkTest = new NetworkTest(test, 'udp', null, Call.isType.bind(Call, 'relay'));
//   networkTest.run();
// });

// Test whether it can connect via TCP to a TURN server
// Get a TURN config, and try to get a relay candidate using TCP.
// addTest(testSuiteName.NETWORK, testCaseName.TCPENABLED, function(test) {
//   var networkTest = new NetworkTest(test, 'tcp', null, Call.isType.bind(Call, 'relay'));
//   networkTest.run();
// });

// Test whether it is IPv6 enabled (TODO: test IPv6 to a destination).
// Turn on IPv6, and try to get an IPv6 host candidate.
// addTest(testSuiteName.NETWORK, testCaseName.IPV6ENABLED, function(test) {
//   var params = {optional: [{googIPv6: true}]};
//   var networkTest = new NetworkTest(test, null, params, Call.isIpv6);
//   networkTest.run();
// });

interface RTCIceCandidate {
  readonly foundation: string;
  readonly priority: number;
  readonly ip: string;
  readonly protocol: RTCIceProtocol;
  readonly port: number;
  readonly type: RTCIceCandidateType;
  readonly tcpType?: RTCIceTcpCandidateType;
  readonly relatedAddress?: string;
  readonly relatedPort?: number;
}

interface RTCPeerConnectionIceEvent {
  candidate: RTCIceCandidate
}

interface NetworkTestConfig {
  protocol?: string,
  params?: any,
  type: string,
}

export default class NetworkTest extends Test {
  private config: NetworkTestConfig;
  resolve: Function;

  constructor(config, iceCandidateFilter) {
    super();
    this.config = {...this.config, ...config};
  }

  async run() {
    const promise = new Promise((resolve) => {
      this.resolve = resolve;
    });
    try {
      let config;
      if (this.config.type !== 'ipv6') {
        const iceServers = await Connection.getTurnConfig();
        config = {iceServers: this.filterIceServers(iceServers, this.config.protocol)};
        console.log('config', config);
      }

      this.gatherCandidates(config, this.config.params);
      await promise;
    } catch (error) {
      console.log(error);
      this.reportFatal('run', error);
      this.done();
    }
  }

  // Filter the RTCConfiguration |config| to only contain URLs with the
  // specified transport protocol |protocol|.
  private filterIceServers(iceServers, protocol) {
    return iceServers.filter(({urls}) => urls.includes(`transport=${protocol}`));
  }

  // Create a PeerConnection, and gather candidates using RTCConfig |config|
  // and ctor params |params|. Succeed if any candidates pass the |isGood|
  // check, fail if we complete gathering without any passing.
  private async gatherCandidates(config, params) {
    let pc : RTCPeerConnection;
    try {
      console.log('config', config);
      pc = new RTCPeerConnection(config, params);
    } catch (error) {
      const [type, message] = params && params.optional[0].googIPv6 ?
        ['warning', 'Failed to create peer connection, IPv6 might not be setup/supported on the network.']
        : ['error', `Failed to create peer connection: ${error}`];
      this.log(type, message);
      this.resolve();
      this.done();
      return;
    }

    await Promise.all([
      NetworkTest.createAudioOnlyReceiveOffer(pc),
      new Promise((resolve) => {
        pc.addEventListener('icecandidate', (e : RTCPeerConnectionIceEvent) => {
          // Once we've decided, ignore future callbacks.
          if (e.currentTarget.signalingState === 'closed') return;
          if (e.candidate && Connection.isType(this.config.type, e.candidate)) {
            this.log('success', `Gathered candidate of Type: ${e.candidate.type} Protocol: ${e.candidate.protocol} Address: ${e.candidate.relatedAddress}`);
            resolve();
          } else {
            const [level, message] = params && params.optional[0].googIPv6 ?
              ['warning', 'Failed to gather IPv6 candidates, it might not be setup/supported on the network.'] :
              ['error', 'Failed to gather specified candidates'];
            this.log(level, message);
          }
        });
      })
    ]);

    pc.close();
    this.resolve();
    this.done();
  }

  // Create an audio-only, recvonly offer, and setLD with it.
  // This will trigger candidate gathering.
  static async createAudioOnlyReceiveOffer(pc) {
    const offer = await pc.createOffer({offerToReceiveAudio: 1});
    await pc.setLocalDescription(offer);
  }
}
