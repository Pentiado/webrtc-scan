class EventEmitter {
  events = {};

  on(event, func) {
    this.events[event] = this.events[event] || [];
    this.events[event].push(func);
    return () => {
      this.events[event] = this.events[event].filter((f) => f !== func);
    }
  }

  protected emit(event, data) {
    this.events
  }
}

interface Log {
  level: string,
  message: string,
}

interface LogsCounter {success?: number, info?: number, warning?: number, error?: number}

export default class Test {
  logs: Log[] = [];
  report: any = {};
  state : 'running' | 'success' | 'warning' | 'error';
  promise : Promise;

  protected start() {
    this.promise = new Promise((resolve, reject) => {

    });
    this.logs = [];
    this.report = {};
    this.state = 'running';
  }

  protected done() {
    if (this.state !== 'running') return;
    const result : LogsCounter = this.logs.reduce((result, {level}) => {
      result[level] = (result[level] || 0) + 1;
      return result;
    }, {});

    if (!result.error && !result.warning && result.success) {
      this.state = 'success';
    } else if (result.warning && !result.error) {
      this.state = 'warning';
    } else {
      this.state = 'error';
    }
  }

  protected log(level, message) {
    console.log(level, message);
    this.logs.push({level, message});
  }

  protected reportFatal(level, message) {
    this.log(level, message);
    this.done();
  }
}