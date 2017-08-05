export function arrayAverage(array : [number]) {
  return Math.floor(array.reduce((sum, num) => sum + num, 0) / array.length);
}

export function arrayMax(array : [number]) {
  if (!array.length) return NaN;
  return Math.max.apply(Math, array);
}

export function arrayMin(array : [number]) {
  if (array.length === 0) return NaN;
  return Math.min.apply(Math, array);
}

export async function delay(timeout : number) {
  return new Promise((resolve) => setTimeout(resolve, timeout));
}