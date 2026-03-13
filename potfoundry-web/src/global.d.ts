/** Global type augmentations for PotFoundry */

interface Window {
  /** Debug access to Zustand store */
  __POTFOUNDRY_STORE__?: unknown;
  /** Debug camera controller reference */
  __pf_webgpu_camera_controller?: {
    state?: Record<string, unknown>;
  };
  /** Initial URL parameters for logging configuration */
  __pf_initialParams?: Record<string, unknown>;
}

/** Vendor-prefixed Fullscreen API methods */
interface HTMLElement {
  webkitRequestFullscreen?(): Promise<void>;
  mozRequestFullScreen?(): Promise<void>;
  msRequestFullscreen?(): Promise<void>;
}

interface Document {
  webkitExitFullscreen?(): Promise<void>;
  mozCancelFullScreen?(): Promise<void>;
  msExitFullscreen?(): Promise<void>;
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
}
