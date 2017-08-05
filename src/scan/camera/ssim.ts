/* This is an implementation of the algorithm for calculating the Structural
 * SIMilarity (SSIM) index between two images. Please refer to the article [1],
 * the website [2] and/or the Wikipedia article [3]. This code takes the value
 * of the constants C1 and C2 from the Matlab implementation in [4].
 *
 * [1] Z. Wang, A. C. Bovik, H. R. Sheikh, and E. P. Simoncelli, "Image quality
 * assessment: From error measurement to structural similarity",
 * IEEE Transactions on Image Processing, vol. 13, no. 1, Jan. 2004.
 * [2] http://www.cns.nyu.edu/~lcv/ssim/
 * [3] http://en.wikipedia.org/wiki/Structural_similarity
 * [4] http://www.cns.nyu.edu/~lcv/ssim/ssim_index.m
 */

export default class Ssim {
// Implementation of Eq.2, a simple average of a vector and Eq.4., except the
  // square root. The latter is actually an unbiased estimate of the variance,
  // not the exact variance.
  statistics(a : Uint8ClampedArray) {
    let accu = 0;
    for (let i = 0; i < a.length; ++i) {
      accu += a[i];
    }
    const meanA = accu / (a.length - 1);
    let diff = 0;
    for (let i = 1; i < a.length; ++i) {
      diff = a[i - 1] - meanA;
      accu += a[i] + (diff * diff);
    }
    return {mean: meanA, variance: accu / a.length};
  }

  // Implementation of Eq.11., cov(Y, Z) = E((Y - uY), (Z - uZ)).
  covariance(a: Uint8ClampedArray, b : Uint8ClampedArray, meanA : number, meanB : number) {
    let accu = 0;
    for (let i = 0; i < a.length; i += 1) {
      accu += (a[i] - meanA) * (b[i] - meanB);
    }
    return accu / a.length;
  }

  calculate(x : Uint8ClampedArray, y: Uint8ClampedArray) {
    if (x.length !== y.length) return 0;

    // Values of the constants come from the Matlab code referred before.
    const K1 = 0.01;
    const K2 = 0.03;
    const L = 255;
    const C1 = (K1 * L) * (K1 * L);
    const C2 = (K2 * L) * (K2 * L);
    const C3 = C2 / 2;

    const statsX = this.statistics(x);
    const muX = statsX.mean;
    const sigmaX2 = statsX.variance;
    const sigmaX = Math.sqrt(sigmaX2);
    const statsY = this.statistics(y);
    const muY = statsY.mean;
    const sigmaY2 = statsY.variance;
    const sigmaY = Math.sqrt(sigmaY2);
    const sigmaXy = this.covariance(x, y, muX, muY);

    // Implementation of Eq.6.
    const luminance = (2 * muX * muY + C1) /
      ((muX * muX) + (muY * muY) + C1);
    // Implementation of Eq.10.
    const structure = (sigmaXy + C3) / (sigmaX * sigmaY + C3);
    // Implementation of Eq.9.
    const contrast = (2 * sigmaX * sigmaY + C2) / (sigmaX2 + sigmaY2 + C2);

    // Implementation of Eq.12.
    return luminance * contrast * structure;
  }
}
