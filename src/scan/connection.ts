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

interface ConnectionConfig {
  constrainOfferToRemoveVideoFec?: boolean,
  type?: RTCIceCandidateType,

  // Constraint max video bitrate by modifying the SDP when creating an answer.
  constrainVideoBitrateKbps?: number,
}

export default class Connection {
  public pc1: RTCPeerConnection;
  public pc2: RTCPeerConnection;

  private statsGatheringRunning: boolean;
  private config: ConnectionConfig;

  constructor(config, connectionConfig: ConnectionConfig) {
    this.config = {...this.config, ...connectionConfig};
    this.statsGatheringRunning = false;

    this.pc1 = new RTCPeerConnection(config);
    this.pc2 = new RTCPeerConnection(config);

    this.pc1.addEventListener('icecandidate', this.onIceCandidate.bind(this, this.pc2));
    this.pc2.addEventListener('icecandidate', this.onIceCandidate.bind(this, this.pc1));
  }

  // TODO: on error report Fatal
  async establishConnection() {
    const offer = await this.pc1.createOffer();
    this.gotOffer(offer);
    const answer = await this.pc2.createAnswer();
    this.gotAnswer(answer);
  }

  close() {
    this.pc1.close();
    this.pc2.close();
  }

  async gatherStats(peerConnection : RTCPeerConnection, localStream : MediaStream) {
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
      console.log('Could not gather stats: ', error);
      // this.test.reportError('Could not gather stats: ' + error);
    }
    finally {
      this.statsGatheringRunning = false;
      return {stats, statsCollectTime};
    }
  }

  // TODO report fatal on error
  private async gotOffer(offer : any) {
    if (this.config.constrainOfferToRemoveVideoFec) {
      offer.sdp = offer.sdp.replace(/(m=video 1 [^\r]+)(116 117)(\r\n)/g,
        '$1\r\n');
      offer.sdp = offer.sdp.replace(/a=rtpmap:116 red\/90000\r\n/g, '');
      offer.sdp = offer.sdp.replace(/a=rtpmap:117 ulpfec\/90000\r\n/g, '');
      offer.sdp = offer.sdp.replace(/a=rtpmap:98 rtx\/90000\r\n/g, '');
      offer.sdp = offer.sdp.replace(/a=fmtp:98 apt=116\r\n/g, '');
    }
    this.pc1.setLocalDescription(offer);
    this.pc2.setRemoteDescription(offer);
  }

  private gotAnswer(answer : any) {
    if (this.config.constrainVideoBitrateKbps) {
      answer.sdp = answer.sdp.replace(
        /a=mid:video\r\n/g,
        'a=mid:video\r\nb=AS:' + this.config.constrainVideoBitrateKbps + '\r\n');
    }
    this.pc2.setLocalDescription(answer);
    this.pc1.setRemoteDescription(answer);
  }

  private onIceCandidate(otherPeer: RTCPeerConnection, event: RTCPeerConnectionIceEvent) {
    if (!event.candidate || !Connection.isType(this.config.type, event.candidate)) return;
    otherPeer.addIceCandidate(event.candidate);
  }

  static isType = (type : 'relay' | 'host' | 'not-host' | 'srflx' | 'ipv6', candidate: RTCIceCandidate) => {
    switch (type) {
      case 'ipv6':
        return (candidate.relatedAddress || '').includes(':');
      case 'not-host':
        return candidate.type !== 'host';
      default:
        return candidate.type === type;
    }
  };

  // Store the ICE server response from the network traversal server.
  static cachedIceServers: RTCIceServer[];

  // Get a TURN config, either from settings or from network traversal server.
  static async getTurnConfig() {
    if (!Connection.cachedIceServers) await Connection._fetchTurnConfig();
    return Connection._getCachedIceCredentials();
  }

  static async _fetchTurnConfig() {
    const response = await fetch('https://global.xirsys.net/_turn/browser-scan/', {
      method: 'PUT',
      headers: new Headers({
        Authorization: `Basic ${btoa("Pentiado:2034e852-922c-11e7-87dd-a0c7cc750054")}`
      })
    });
    if (response.status !== 200) throw new Error('TURN request failed');
    const body = await response.json();
    const iceServers = body.v.iceServers.reduce((iceServers, {url, ...params}) =>
      iceServers.concat({urls: url, ...params}), []);
    Connection.cachedIceServers = iceServers;
    return iceServers;
  }

  static _getCachedIceCredentials = () => JSON.parse(JSON.stringify(Connection.cachedIceServers))
}
