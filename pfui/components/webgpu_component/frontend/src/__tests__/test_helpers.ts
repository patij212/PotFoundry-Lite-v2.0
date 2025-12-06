export const createCanvas = (w = 800, h = 600): HTMLCanvasElement => {
  const canvas = { width: w, height: h, getBoundingClientRect: () => ({ width: w, height: h, left: 0, top: 0, right: w, bottom: h }), style: { width: `${w}px`, height: `${h}px` } } as unknown as HTMLCanvasElement;
  return canvas;
};

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

