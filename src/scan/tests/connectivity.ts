import Connection from "../connection";
import Test from '../test';

// Set up a datachannel between two peers through a relay
// and verify data can be transmitted and received
// (packets travel through the public internet)

/*
addTest(
    testSuiteName.CONNECTIVITY, testCaseName.RELAYCONNECTIVITY, function(test) {
      var runConnectivityTest = new RunConnectivityTest(test, Call.isType('relay'));
      runConnectivityTest.run();
    });

// Set up a datachannel between two peers through a public IP address
// and verify data can be transmitted and received
// (packets should stay on the link if behind a router doing NAT)
addTest(testSuiteName.CONNECTIVITY, testCaseName.REFLEXIVECONNECTIVITY,
    function(test) {
      var runConnectivityTest = new RunConnectivityTest(test, Call.isType.bind(Call, 'srflx'));
      runConnectivityTest.run();
    });

// Set up a datachannel between two peers through a local IP address
// and verify data can be transmitted and received
// (packets should not leave the machine running the test)
addTest(
    testSuiteName.CONNECTIVITY, testCaseName.HOSTCONNECTIVITY, function(test) {
      var runConnectivityTest = new RunConnectivityTest(test, Call.isHost);
      runConnectivityTest.start();
    });
*/

interface ConnectivityTestConfig {
  type?: string,
}

export class ConnectivityTest extends Test {
  config: ConnectivityTestConfig;
  collectedCandidates: RTCIceCandidate[];
  connection: Connection;
  timeoutId: number;

  constructor(config: ConnectivityTestConfig) {
    super();
    this.config = {...this.config, ...config};
  }

  async run() {
    this.collectedCandidates = [];
    try {
      const config = await Connection.getTurnConfig();
      this.connection = new Connection(config, {type: this.config.type});

      // Collect all candidates for validation.
      this.connection.pc1.addEventListener('icecandidate', (event: RTCPeerConnectionIceEvent) => {
        if (!event.candidate) return;

        this.collectedCandidates.push(event.candidate);
        if (Connection.isType(this.config.type, event.candidate)) {
          this.log('info', [
            `Gathered candidate of Type: ${event.candidate.type}`,
            `Protocol: ${event.candidate.protocol}`,
            `Address: ${event.candidate.relatedAddress}`
          ].join(' '));
        }
      });

      const ch1 = this.connection.pc1.createDataChannel(null);
      ch1.addEventListener('open', () => ch1.send('hello'));
      ch1.addEventListener('message', (event: MessageEvent) => {
        const [level, message] = event.data !== 'world' ?
          ['error', 'Invalid data transmitted.']
          : ['success', 'Data successfully transmitted between peers.'];
        this.log(level, message);
        this.hangup();
      });
      this.connection.pc2.addEventListener('datachannel', (event: any) => {
        const ch2 = event.channel;
        ch2.addEventListener('message', (event: MessageEvent) => {
          if (event.data !== 'hello') {
            this.hangup('Invalid data transmitted.');
          } else {
            ch2.send('world');
          }
        });
      });
      this.timeoutId = setTimeout(this.hangup.bind(this, 'Timed out'), 5000);
      await this.connection.establishConnection();
    } catch (err) {
      this.reportFatal('error', err);
    }
  }

  findCandidate(type: string) {
    return this.collectedCandidates.find(Connection.isType.bind(null, type));
  }

  hangup(errorMessage?: string) {
    if (errorMessage) {
      // Report warning for server reflexive test if it times out.
      if (errorMessage === 'Timed out' && this.config.type === 'srflx' && this.findCandidate('srflx')) {
        this.log('warning', 'Could not connect using reflexive candidates, likely due to the network ' +
          'environment/configuration.');
      } else {
        this.log('error', errorMessage);
      }
    }
    clearTimeout(this.timeoutId);
    this.connection.close();
    this.done();
  }
}

