import Connection from '../../connection';
import Test from '../../test';
import VideoFrameChecker from './videoFrameChecker';
import {arrayAverage, arrayMax, arrayMin} from '../../util';

/*
 * In generic cameras using Chrome rescaler, all resolutions should be supported
 * up to a given one and none beyond there. Special cameras, such as digitizers,
 * might support only one resolution.
 */

/*
 * "Analyze performance for "resolution"" test uses getStats, canvas and the
 * video element to analyze the video frames from a capture device. It will
 * report number of black frames, frozen frames, tested frames and various stats
 * like average encode time and FPS. A test case will be created per mandatory
 * resolution found in the "resolutions" array.
 */


// addTest(testSuiteName.CAMERA, testCaseName.CHECKRESOLUTION240, function(test) {
//   var camResolutionsTest = new CamResolutionsTest(test , [[320, 240]]);
//   camResolutionsTest.run();
// });
//
// addTest(testSuiteName.CAMERA, testCaseName.CHECKRESOLUTION480, function(test) {
//   var camResolutionsTest = new CamResolutionsTest(test, [[640, 480]]);
//   camResolutionsTest.run();
// });
//
// addTest(testSuiteName.CAMERA, testCaseName.CHECKRESOLUTION720, function(test) {
//   var camResolutionsTest = new CamResolutionsTest(test, [[1280, 720]]);
//   camResolutionsTest.run();
// });
//
// addTest(testSuiteName.CAMERA,
//     testCaseName.CHECKSUPPORTEDRESOLUTIONS, function(test) {
//       var resolutionArray = [
//         [160, 120], [320, 180], [320, 240], [640, 360], [640, 480], [768, 576],
//         [1024, 576], [1280, 720], [1280, 768], [1280, 800], [1920, 1080],
//         [1920, 1200], [3840, 2160], [4096, 2160]
//       ];
//       var camResolutionsTest = new CamResolutionsTest(test, resolutionArray);
//       camResolutionsTest.run();
//     });

export default class CameraTest extends Test {
  private isShuttingDown = false;

  constructor(public resolution: [number, number]) {
    super();
  }

  async run() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {width: {exact: this.resolution[0]}, height: {exact: this.resolution[1]}}
      });
      // Do not check actual video frames when more than one resolution is provided.
      this.collectAndAnalyzeStats(stream, this.resolution);
    } catch (error) {
      this.log('info', `${this.resolution[0]} x ${this.resolution[1]} not supported`);
      this.log('error', `getUserMedia failed with error: ${error.name}`);
    }
  }

  private collectAndAnalyzeStats(stream : MediaStream, resolution : number[]) {
    const tracks = stream.getVideoTracks();
    if (tracks.length < 1) {
      this.log('error', 'No video track in returned stream.');
      return;
    }

    const videoTrack = tracks[0];
    videoTrack.onended = () => {
      if (this.isShuttingDown) return;
      this.log('error', 'Video track ended, camera-test stopped working');
    };

    videoTrack.onmute = () => {
      if (this.isShuttingDown) return;
      this.log('warn', 'Your camera-test reported itself as muted.');
    };

    videoTrack.onunmute = () => {
      if (this.isShuttingDown) return;
      this.log('info', 'Your camera-test reported itself as unmuted.');
    };

    const video = document.createElement('video');
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');
    video.width = resolution[0];
    video.height = resolution[1];
    video.srcObject = stream;
    const frameChecker = new VideoFrameChecker(video);
    const connection = new Connection();
    connection.pc1.addStream(stream);
    connection.establishConnection();
    connection.gatherStats(connection.pc1, stream, this.onCallEnded.bind(this, resolution, video, stream, frameChecker), 100);
    setTimeout(this.endCall.bind(this, connection, stream), 8000);
  }

  private onCallEnded(resolution, videoElement, stream, frameChecker, stats, statsTime) {
    this.analyzeStats(resolution, videoElement, stream, frameChecker, stats, statsTime);
    frameChecker.stop();
    console.log('done');
  }

  private analyzeStats(resolution, videoElement, stream, frameChecker, stats, statsTime) {
    const googAvgEncodeTime: number[] = [];
    const googAvgFrameRateInput: number[] = [];
    const googAvgFrameRateSent: number[] = [];
    const statsReport : any = {};
    const frameStats = frameChecker.frameStats;

    for (var index in stats) {
      if (stats[index].type === 'ssrc') {
        // Make sure to only capture stats after the encoder is setup.
        if (parseInt(stats[index].googFrameRateInput) > 0) {
          googAvgEncodeTime.push(parseInt(stats[index].googAvgEncodeMs));
          googAvgFrameRateInput.push(parseInt(stats[index].googFrameRateInput));
          googAvgFrameRateSent.push(parseInt(stats[index].googFrameRateSent));
        }
      }
    }

    statsReport.cameraName = stream.getVideoTracks()[0].label || NaN;
    statsReport.actualVideoWidth = videoElement.videoWidth;
    statsReport.actualVideoHeight = videoElement.videoHeight;
    statsReport.mandatoryWidth = resolution[0];
    statsReport.mandatoryHeight = resolution[1];
    statsReport.encodeSetupTimeMs = ResolutionTest.extractEncoderSetupTime(stats, statsTime);
    statsReport.avgEncodeTimeMs = arrayAverage(googAvgEncodeTime);
    statsReport.minEncodeTimeMs = arrayMin(googAvgEncodeTime);
    statsReport.maxEncodeTimeMs = arrayMax(googAvgEncodeTime);
    statsReport.avgInputFps = arrayAverage(googAvgFrameRateInput);
    statsReport.minInputFps = arrayMin(googAvgFrameRateInput);
    statsReport.maxInputFps = arrayMax(googAvgFrameRateInput);
    statsReport.avgSentFps = arrayAverage(googAvgFrameRateSent);
    statsReport.minSentFps = arrayMin(googAvgFrameRateSent);
    statsReport.maxSentFps = arrayMax(googAvgFrameRateSent);

    // MediaStreamTrack.muted property is not wired up in Chrome yet,
    // checking isMuted local state.
    // this.isMuted = true;
    statsReport.isMuted = this.isMuted;
    statsReport.testedFrames = frameStats.numFrames;
    statsReport.blackFrames = frameStats.numBlackFrames;
    statsReport.frozenFrames = frameStats.numFrozenFrames;

    // TODO: Add a reportInfo() function with a table format to display
    // values clearer.
    report.traceEventInstant('video-stats', statsReport);

    ResolutionTest.testExpectations(statsReport);
  }

  private endCall(callObject, stream : MediaStream) {
    this.isShuttingDown = true;
    stream.getTracks().forEach((track) => track.stop());
    callObject.close();
  }

  static extractEncoderSetupTime(stats, statsTime : [number]) {
    for (let index = 0; index !== stats.length; index++) {
      if (stats[index].type === 'ssrc' && parseInt(stats[index].googFrameRateInput) > 0) {
        return JSON.stringify(statsTime[index] - statsTime[0]);
      }
    }
    return NaN;
  }

  static resolutionMatchesIndependentOfRotationOrCrop(aWidth : number, aHeight : number, bWidth : number, bHeight : number) {
    const minRes = Math.min(bWidth, bHeight);
    return (aWidth === bWidth && aHeight === bHeight) ||
      (aWidth === bHeight && aHeight === bWidth) ||
      (aWidth === minRes && bHeight === minRes);
  }

  static testExpectations(info) {
    // TODO something feels odd with info object
    const notAvailableStats = Object.keys(info).filter((key) => {
      const isAvailable = !(typeof info[key] === 'number' && isNaN(info[key]));
      if (isAvailable) this.log('info', key + ': ' + info[key]);
      return !isAvailable;
    }, []);

    if (notAvailableStats.length) {
      this.log('info', 'Not available: ' + notAvailableStats.join(', '));
    }

    if (isNaN(info.avgSentFps)) {
      this.log('info', 'Cannot verify sent FPS.');
    } else if (info.avgSentFps < 5) {
      this.log('error', 'Low average sent FPS: ' + info.avgSentFps);
    } else {
      console.log('success', 'Average FPS above threshold');
    }

    if (!ResolutionTest.resolutionMatchesIndependentOfRotationOrCrop(
        info.actualVideoWidth, info.actualVideoHeight, info.mandatoryWidth,
        info.mandatoryHeight)) {
      this.log('error', 'Incorrect captured resolution.');
    } else {
      console.log('success', 'Captured video using expected resolution.');
    }
    if (!info.testedFrames) {
      this.log('error', 'Could not analyze any video frame.');
    } else {
      if (info.blackFrames > info.testedFrames / 3) {
        this.log('error', 'Camera delivering lots of black frames.');
      }
      if (info.frozenFrames > info.testedFrames / 3) {
        this.log('error', 'Camera delivering lots of frozen frames.');
      }
    }
  }
}
