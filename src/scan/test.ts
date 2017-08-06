interface Log {
  level: string,
  message: string,
}

interface LogsCounter {success?: number, info?: number, warning?: number, error?: number}

export default class Test {
  logs: Log[] = [];
  report: any = {};
  state : 'running' | 'success' | 'warning' | 'error';

  protected start() {
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
    this.logs.push({level, message});
  }
}