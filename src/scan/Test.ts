class Test {
  protected successCount = 0;
  protected errorCount = 0;
  protected warningCount = 0;
  protected state : string;

  protected done() {
    if (this.state !== 'running') return;
    const success = (this.errorCount + this.warningCount === 0 && this.successCount > 0);

    if (success) {
      this.state = 'success';
    } else if (this.warningCount > 0 && !this.errorCount) {
      this.state = 'warning';
    } else {
      this.state = 'failure';
    }

    this.traceTestEvent({status: this.state});
    report.logTestRunResult(this.name, this.state);
    this.doneCallback_();
  }

  reportSuccess(str) {
    this.reportMessage_(PREFIX_OK, str);
    this.successCount++;
  }

  reportError(str) {
    this.reportMessage_(PREFIX_FAILED, str);
    this.errorCount++;
  }

  reportWarning(str) {
    this.reportMessage_(PREFIX_WARNING, str);
    this.warningCount++;
  }

  reportInfo(str) {
    this.reportMessage_(PREFIX_INFO, str);
  }

  // Use only for error callbacks upon test invocation, not to end the test,
  // use report<Status>(message) and setTestFinished() for that.
  // TODO: Figure out a better way to do this.
  reportFatal(str) {
    this.reportError(str);
    this.done();
  }

  reportMessage_(prefix, str) {
    // TODO: silly unnecessary reassign.
    this.output = [].concat(this.output, [{prefix: prefix, message: str}]);
  }
}