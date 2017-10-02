// http://www.muazkhan.com/search?updated-max=2014-10-15T08:17:00%2B05:00&max-results=2&start=2&by-date=false

/*
function getStats(peer) {
  _getStats(peer, function (results) {
    for (var i = 0; i &lt; results.length; ++i) {
      var res = results[i];

      if (res.googCodecName == 'opus') {
        if (!window.prevBytesSent)
          window.prevBytesSent = res.bytesSent;

        var bytes = res.bytesSent - window.prevBytesSent;
        window.prevBytesSent = res.bytesSent;

        var kilobytes = bytes / 1024;
        console.log(kilobytes.toFixed(1) + ' kbits/s');
      }
    }

    setTimeout(function () {
      getStats(peer);
    }, 1000);
  });
}

// a wrapper around getStats which hides the differences (where possible)
// following code-snippet is taken from somewhere on the github
function _getStats(peer, cb) {
  if (!!navigator.mozGetUserMedia) {
    peer.getStats(
      function (res) {
        var items = [];
        res.forEach(function (result) {
          items.push(result);
        });
        cb(items);
      },
      cb
    );
  } else {
    peer.getStats(function (res) {
      var items = [];
      res.result().forEach(function (result) {
        var item = {};
        result.names().forEach(function (name) {
          item[name] = result.stat(name);
        });
        item.id = result.id;
        item.type = result.type;
        item.timestamp = result.timestamp;
        items.push(item);
      });
      cb(items);
    });
  }
}
*/

export default class StatisticsAggregate {
  private startTime = 0;
  private sum = 0;
  private count = 0;
  private max = 0;
  private rampUpTime = Infinity;

  constructor(private rampUpThreshold : number) {
  }

  add(time : number, datapoint : number) {
    if (!this.startTime) {
      this.startTime = time;
    }
    this.sum += datapoint;
    this.max = Math.max(this.max, datapoint);
    if (this.rampUpTime === Infinity && datapoint > this.rampUpThreshold) {
      this.rampUpTime = time;
    }
    this.count++;
  }

  getAverage() {
    return Math.round(this.sum / this.count) || 0;
  }

  getMax() {
    return this.max;
  }

  getRampUpTime() {
    return this.rampUpTime - this.startTime;
  }
}

