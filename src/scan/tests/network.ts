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

  constructor(config, iceCandidateFilter) {
    super();
    this.config = {...this.config, ...config};
  }

  async run() {
    try {
      let config;
      if (this.config.type !== 'ipv6') {
        config = await Connection.getTurnConfig();
        config = {...config, iceServers: this.filterIceServers(config.iceServers, this.config.protocol)};
      }

      this.gatherCandidates(config, this.config.params);
    } catch (error) {
      this.reportFatal('run', error);
    }
  }

  // Filter the RTCConfiguration |config| to only contain URLs with the
  // specified transport protocol |protocol|. If no turn transport is
  // specified it is added with the requested protocol.
  private filterIceServers(iceServers, protocol) {
    const transport = `transport=${protocol}`;
    return iceServers.reduce((newIceServers, iceServer) => {
      const newUrls = iceServer.urls.reduce((newUrls, uri) => {
        if (uri.includes(transport)) {
          newUrls.push(uri);
        } else if (uri.includes('?transport=') && uri.startsWith('turn')) {
          newUrls.push(uri + '?' + transport);
        }
      }, []);

      if (newUrls.length) {
        iceServer.urls = newUrls;
        newIceServers.push(iceServer);
      }

      return newIceServers;
    }, []);
  }

  // Create a PeerConnection, and gather candidates using RTCConfig |config|
  // and ctor params |params|. Succeed if any candidates pass the |isGood|
  // check, fail if we complete gathering without any passing.
  private async gatherCandidates(config, params) {
    let pc : RTCPeerConnection;
    try {
      pc = new RTCPeerConnection(config, params);
    } catch (error) {
      const [type, message] = params && params.optional[0].googIPv6 ?
        ['warning', 'Failed to create peer connection, IPv6 might not be setup/supported on the network.']
        : ['error', `Failed to create peer connection: ${error}`];

      this.log(type, message);
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
          } else {
            const [level, message] = params && params.optional[0].googIPv6 ?
              ['warning', 'Failed to gather IPv6 candidates, it might not be setup/supported on the network.'] :
              ['error', 'Failed to gather specified candidates'];
            this.log(level, message);
          }

          resolve();
        });
      })
    ]);

    pc.close();
    this.done();
  }

  // Create an audio-only, recvonly offer, and setLD with it.
  // This will trigger candidate gathering.
  static async createAudioOnlyReceiveOffer(pc) {
    const offer = await pc.createOffer({offerToReceiveAudio: 1});
    await pc.setLocalDescription(offer);
  }
}
