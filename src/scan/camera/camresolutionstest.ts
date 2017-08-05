import Call from '../connection';
import VideoFrameChecker from './videoFrameChecker';
import {arrayAverage, arrayMax, arrayMin} from '../util';

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

export default class ResolutionTest {
  private currentResolution = 0;
  private isShuttingDown = false;

  constructor(private resolutions : [[number]]) {
  }

  run() {
    this.startGetUserMedia(this.resolutions[this.currentResolution]);
  }

  async startGetUserMedia(resolution : [number]) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {width: {exact: resolution[0]}, height: {exact: resolution[1]}}
      });
      // Do not check actual video frames when more than one resolution is provided.
      if (this.resolutions.length > 1) {
        console.log('success', `Supported: ${resolution[0]} x ${resolution[1]}`);
        stream.getTracks().forEach((track) => track.stop());
        this.maybeContinueGetUserMedia();
      } else {
        this.collectAndAnalyzeStats(stream, resolution);
      }
    } catch (error) {
      if (this.resolutions.length > 1) {
        console.info('info', `${resolution[0]} x ${resolution[1]} not supported`);
      } else {
        console.error('error', `getUserMedia failed with error: ${error.name}`);
      }

      this.maybeContinueGetUserMedia();
    }
  }

  private maybeContinueGetUserMedia() {
    if (this.currentResolution === this.resolutions.length) {
      console.log('done');
      return;
    }
    this.startGetUserMedia(this.resolutions[this.currentResolution++]);
  }

  private collectAndAnalyzeStats(stream : MediaStream, resolution : number[]) {
    const tracks = stream.getVideoTracks();
    if (tracks.length < 1) {
      console.error('error', 'No video track in returned stream.');
      this.maybeContinueGetUserMedia();
      return;
    }

    const videoTrack = tracks[0];
    videoTrack.onended = () => {
      if (this.isShuttingDown) return;
      console.error('error', 'Video track ended, camera stopped working');
    };

    videoTrack.onmute = () => {
      if (this.isShuttingDown) return;
      console.warn('warn', 'Your camera reported itself as muted.');
    };

    videoTrack.onunmute = () => {
      if (this.isShuttingDown) return;
      console.info('info', 'Your camera reported itself as unmuted.');
    };

    const video = document.createElement('video');
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');
    video.width = resolution[0];
    video.height = resolution[1];
    video.srcObject = stream;
    const frameChecker = new VideoFrameChecker(video);
    const call = new Call();
    call.pc1.addStream(stream);
    call.establishConnection();
    call.gatherStats(call.pc1, stream, this.onCallEnded.bind(this, resolution, video, stream, frameChecker), 100);
    setTimeout(this.endCall.bind(this, call, stream), 8000);
  }

  private onCallEnded(resolution, videoElement, stream, frameChecker, stats, statsTime) {
    this.analyzeStats(resolution, videoElement, stream, frameChecker, stats, statsTime);
    frameChecker.stop();
    console.log('done');
  }

  private analyzeStats(resolution, videoElement, stream, frameChecker, stats, statsTime) {
    var googAvgEncodeTime = [];
    var googAvgFrameRateInput = [];
    var googAvgFrameRateSent = [];
    var statsReport = {};
    var frameStats = frameChecker.frameStats;

    for (var index in stats) {
      if (stats[index].type === 'ssrc') {
        // Make sure to only capture stats after the encoder is setup.
        if (parseInt(stats[index].googFrameRateInput) > 0) {
          googAvgEncodeTime.push(
            parseInt(stats[index].googAvgEncodeMs));
          googAvgFrameRateInput.push(
            parseInt(stats[index].googFrameRateInput));
          googAvgFrameRateSent.push(
            parseInt(stats[index].googFrameRateSent));
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
      if (isAvailable) console.info('info', key + ': ' + info[key]);
      return !isAvailable;
    }, []);

    if (notAvailableStats.length) {
      console.info('info', 'Not available: ' + notAvailableStats.join(', '));
    }

    if (isNaN(info.avgSentFps)) {
      console.info('info', 'Cannot verify sent FPS.');
    } else if (info.avgSentFps < 5) {
      console.error('error', 'Low average sent FPS: ' + info.avgSentFps);
    } else {
      console.log('success', 'Average FPS above threshold');
    }

    if (!ResolutionTest.resolutionMatchesIndependentOfRotationOrCrop(
        info.actualVideoWidth, info.actualVideoHeight, info.mandatoryWidth,
        info.mandatoryHeight)) {
      console.error('error', 'Incorrect captured resolution.');
    } else {
      console.log('success', 'Captured video using expected resolution.');
    }
    if (!info.testedFrames) {
      console.error('error', 'Could not analyze any video frame.');
    } else {
      if (info.blackFrames > info.testedFrames / 3) {
        console.error('error', 'Camera delivering lots of black frames.');
      }
      if (info.frozenFrames > info.testedFrames / 3) {
        console.error('error', 'Camera delivering lots of frozen frames.');
      }
    }
  }
}
