import Ssim from './ssim';

export default class VideoFrameChecker {
  private frameStats = {
    numFrozenFrames: 0,
    numBlackFrames: 0,
    numFrames: 0
  };

  private running = true;

  private nonBlackPixelLumaThreshold = 20;
  private previousFrame: Uint8ClampedArray;
  private identicalFrameSsimThreshold = 0.985;
  private frameComparator = new Ssim();

  private canvas = document.createElement('canvas');

  constructor(private videoElement : HTMLVideoElement) {
    this.checkVideoFrame = this.checkVideoFrame.bind(this);
    this.videoElement.addEventListener('play', this.checkVideoFrame, false);
  }

  stop() {
    this.videoElement.removeEventListener('play' , this.checkVideoFrame);
    this.running = false;
  }

  private getCurrentImageData() {
    this.canvas.width = this.videoElement.width;
    this.canvas.height = this.videoElement.height;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('If the context identifier is not supported');
    context.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height);
    return context.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }

  private checkVideoFrame() {
    if (!this.running) return;
    if (this.videoElement.ended) return;

    const imageData = this.getCurrentImageData();

    if (this.isBlackFrame(imageData.data)) {
      this.frameStats.numBlackFrames++;
    }

    if (this.frameComparator.calculate(this.previousFrame, imageData.data) > this.identicalFrameSsimThreshold) {
      this.frameStats.numFrozenFrames++;
    }

    this.previousFrame = imageData.data;
    this.frameStats.numFrames++;
    setTimeout(this.checkVideoFrame.bind(this), 20);
  }

  private isBlackFrame(data : Uint8ClampedArray) {
    const thresh = this.nonBlackPixelLumaThreshold;
    let accuLuma = 0;
    for (let i = 4; i < data.length; i += 4) {
      // Use Luma as in Rec. 709: Y′709 = 0.21R + 0.72G + 0.07B;
      accuLuma += 0.21 * data[i] + 0.72 * data[i + 1] + 0.07 * data[i + 2];
      // Early termination if the average Luma so far is bright enough.
      if (accuLuma > (thresh * i / 4)) return false;
    }
    return true;
  }
}
