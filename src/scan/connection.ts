import {delay} from './util';

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

export default class Connection {
  public pc1: RTCPeerConnection;
  public pc2: RTCPeerConnection;

  private statsGatheringRunning: boolean;
  private constrainVideoBitrateKbps: number;
  private constrainOfferToRemoveVideoFec: boolean;

  private iceCandidateFilter = () => true;

  constructor(config, private type : string) {
    this.statsGatheringRunning = false;

    this.pc1 = new RTCPeerConnection(config);
    this.pc2 = new RTCPeerConnection(config);

    this.pc1.addEventListener('icecandidate', this.onIceCandidate.bind(this, this.pc2));
    this.pc2.addEventListener('icecandidate', this.onIceCandidate.bind(this, this.pc1));
  }

  establishConnection() {
    this.pc1.createOffer().then(this.gotOffer.bind(this), this.test.reportFatal.bind(this.test));
  }

  close() {
    this.pc1.close();
    this.pc2.close();
  }

  // Constraint max video bitrate by modifying the SDP when creating an answer.
  constrainVideoBitrate(maxVideoBitrateKbps: number) {
    this.constrainVideoBitrateKbps = maxVideoBitrateKbps;
  }

  // Remove video FEC if available on the offer.
  disableVideoFec() {
    this.constrainOfferToRemoveVideoFec = true;
  }

  // When the peerConnection is closed the statsCb is called once with an array
  // of gathered stats.
  async gatherStats(peerConnection : RTCPeerConnection, localStream : MediaStream, statsCb : Function) {
    const stats : any[] = [];
    const statsCollectTime : number[] = [];
    const statStepMs = 100;
    // Firefox does not handle the mediaStream object directly, either |null|
    // for all stats or mediaStreamTrack, which is according to the standard: https://www.w3.org/TR/webrtc/#widl-RTCPeerConnection-getStats-void-MediaStreamTrack-selector-RTCStatsCallback-successCallback-RTCPeerConnectionErrorCallback-failureCallback
    // Chrome accepts |null| as well but the getStats response reports do not
    // contain mediaStreamTrack stats.
    // TODO: Is it worth using MediaStreamTrack for both browsers? Then we
    // would need to request stats per track etc.
    const selector : any = (navigator.mozGetUserMedia) ? null : localStream;
    this.statsGatheringRunning = true;

    try {
      await (async function getStats() {
        if (peerConnection.signalingState === 'closed') return;
        const response = await peerConnection.getStats(selector);
        for (let index in response) {
          stats.push(response[index]);
          statsCollectTime.push(Date.now());
        }
        await delay(statStepMs);
        await getStats();
      })();
    } catch (error) {
      this.test.reportError('Could not gather stats: ' + error);
    }
    finally {
      statsCb(stats, statsCollectTime);
      this.statsGatheringRunning = false;
    }
  }

  private gotOffer(offer : any) {
    if (this.constrainOfferToRemoveVideoFec) {
      offer.sdp = offer.sdp.replace(/(m=video 1 [^\r]+)(116 117)(\r\n)/g,
        '$1\r\n');
      offer.sdp = offer.sdp.replace(/a=rtpmap:116 red\/90000\r\n/g, '');
      offer.sdp = offer.sdp.replace(/a=rtpmap:117 ulpfec\/90000\r\n/g, '');
      offer.sdp = offer.sdp.replace(/a=rtpmap:98 rtx\/90000\r\n/g, '');
      offer.sdp = offer.sdp.replace(/a=fmtp:98 apt=116\r\n/g, '');
    }
    this.pc1.setLocalDescription(offer);
    this.pc2.setRemoteDescription(offer);
    return this.pc2.createAnswer().then(this.gotAnswer.bind(this), this.test.reportFatal.bind(this.test));
  }

  private gotAnswer(answer : any) {
    if (this.constrainVideoBitrateKbps) {
      answer.sdp = answer.sdp.replace(
        /a=mid:video\r\n/g,
        'a=mid:video\r\nb=AS:' + this.constrainVideoBitrateKbps + '\r\n');
    }
    this.pc2.setLocalDescription(answer);
    this.pc1.setRemoteDescription(answer);
  }

  private onIceCandidate(otherPeer: RTCPeerConnection, event: RTCPeerConnectionIceEvent) {
    if (!event.candidate || !Connection.isType(this.type, event.candidate)) return;
    otherPeer.addIceCandidate(event.candidate);
  }

  static isType = (type : string, candidate: RTCIceCandidate) => (type === 'ipv6') ?
      (candidate.relatedAddress || '').includes(':')
      : candidate.type === type;

  // Store the ICE server response from the network traversal server.
  static cachedIceServers: any;
  // Keep track of when the request was made.
  static cachedIceConfigFetchTime : number;

  // Get a TURN config, either from settings or from network traversal server.
  static async createTurnConfig() {
    const settings = currentTest.settings;
    let iceServers;
    if (typeof(settings.turnURI) === 'string' && settings.turnURI !== '') {
      iceServers = [{
        'username': settings.turnUsername || '',
        'credential': settings.turnCredential || '',
        'urls': settings.turnURI.split(',')
      }];
    } else {
      const response = await Call.fetchTurnConfig();
      iceServers = response.iceServers;
    }

    const config = {iceServers};
    report.traceEventInstant('turn-config', config);
    return config;
  }

  // Get a STUN config, either from settings or from network traversal server.
  static async createStunConfig() {
    const settings = currentTest.settings;
    let iceServers;
    if (typeof(settings.stunURI) === 'string' && settings.stunURI !== '') {
      iceServers = [{'urls': settings.stunURI.split(',')}];
    } else {
      const response = await Call.fetchTurnConfig();
      iceServers = response.iceServers.urls;
    }

    const config = {iceServers};
    report.traceEventInstant('stun-config', config);
    return config;
  }

  // Ask network traversal API to give us TURN server credentials and URLs.
  static async fetchTurnConfig() {
    // Check if credentials exist or have expired (and subtract testRuntTIme so
    // that the test can finish if near the end of the lifetime duration).
    // lifetimeDuration is in seconds.
    const testRunTime = 240; // Time in seconds to allow a test run to complete.
    if (Call.cachedIceServers) {
      const isCachedIceConfigExpired = ((Date.now() - Call.cachedIceConfigFetchTime) / 1000 >
          parseInt(Call.cachedIceServers.lifetimeDuration) - testRunTime);
      if (!isCachedIceConfigExpired) {
        report.traceEventInstant('fetch-ice-config', 'Using cached credentials.');
        return Call.getCachedIceCredentials();
      }
    }

    // API_KEY and TURN_URL is replaced with API_KEY environment variable via
    const response = await fetch(TURN_URL + API_KEY, {method: 'POST'});
    if (response.status !== 200) throw new Error('TURN request failed');
    Call.cachedIceServers = response.body;
    Call.cachedIceConfigFetchTime = Date.now();
    report.traceEventInstant('fetch-ice-config', 'Fetching new credentials.');
    return Call.getCachedIceCredentials();
  }

  static getCachedIceCredentials = () => Call.cachedIceServers && JSON.parse(JSON.stringify(Call.cachedIceServers))
}
