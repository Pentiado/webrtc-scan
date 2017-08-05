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

