import {names as eventNames} from '../events';
import Call from '../connection';

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

export default class NetworkTest {
  constructor(protocol, params, iceCandidateFilter) {
    this.protocol = protocol;
    this.params = params;
    this.iceCandidateFilter = iceCandidateFilter;
  }

  run() {
    // Do not create turn config for IPV6 test.
    if (this.iceCandidateFilter.toString() === Call.isIpv6.toString()) {
      this.gatherCandidates(null, this.params, this.iceCandidateFilter);
    } else {
      Call.createTurnConfig(this.start.bind(this), this.test.reportFatal.bind(this.test));
    }
  }

  start(config) {
    this.filterConfig(config, this.protocol);
    this.gatherCandidates(config, this.params, this.iceCandidateFilter);
  }

  // Filter the RTCConfiguration |config| to only contain URLs with the
  // specified transport protocol |protocol|. If no turn transport is
  // specified it is added with the requested protocol.
  filterConfig(config, protocol) {
    const transport = `transport=${protocol}`;
    config.iceServers = config.iceServers.reduce((newIceServers, iceServer) => {
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
  gatherCandidates(config, params, isGood) {
    let pc : RTCPeerConnection;
    try {
      pc = new RTCPeerConnection(config, params);
    } catch (error) {
      const {type, message} = params && params.optional[0].googIPv6 ?
        {
          type: eventNames.WARNING,
          message: 'Failed to create peer connection, IPv6 might not be setup/supported on the network.'} :
        {
          type: eventNames.ERROR,
          message: `Failed to create peer connection: ${error}`
        };
      console.log(type, message);
      console.log(eventNames.DONE);
      return;
    }

    // In our candidate callback, stop if we get a candidate that passes
    // |isGood|.
    pc.addEventListener('icecandidate', (e : RTCPeerConnectionIceEvent) => {
      // Once we've decided, ignore future callbacks.
      if (e.currentTarget.signalingState === 'closed') return;
      if (e.candidate) {
        if (isGood(parsed)) {
          this.dispatch(eventNames.SUCCESS, `Gathered candidate of Type: ${e.candidate.type} 
          Protocol: ${e.candidate.protocol} Address: ${e.candidate.relatedAddress}`);
          pc.close();
          this.dispatch({type: eventNames.DONE});
        }
      } else {
        pc.close();
        const action = params && params.optional[0].googIPv6 ?
          {
            type: eventNames.WARNING,
            message: 'Failed to gather IPv6 candidates, it might not be setup/supported on the network.'
          } :
          {
            type: eventNames.ERROR,
            message: 'Failed to gather specified candidates'
          };

        this.dispatch(action);
        this.dispatch({type: eventNames.DONE});
      }
    });

    NetworkTest.createAudioOnlyReceiveOffer(pc);
  }

  // Create an audio-only, recvonly offer, and setLD with it.
  // This will trigger candidate gathering.
  static async createAudioOnlyReceiveOffer(pc) {
    const offer = await pc.createOffer({offerToReceiveAudio: 1});
    await pc.setLocalDescription(offer);
  }
}
