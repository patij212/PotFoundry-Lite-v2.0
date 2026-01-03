// Shared camera constants used across the preview and component
export const DEFAULT_INTERACTIVE_LOD = 0.45;
export const MIN_INTERACTIVE_LOD = 0.15;
export const INTERACTIVE_THETA_RATIO_FLOOR = 0.65;
export const INTERACTIVE_Z_RATIO_FLOOR = 0.4;
export const MIN_THETA_STATIC = 3;
export const MIN_Z_STATIC = 2;
export const MIN_THETA_INTERACTIVE = 12;
export const MIN_Z_INTERACTIVE = 8;
export const PARAM_UPDATE_TIMEOUT_MS = 320;
export const CAMERA_BROADCAST_MS = 200;
export const CAMERA_EPSILON = 1e-4;
export const CAMERA_STATIC_EPS = 1e-4;
export const CAMERA_PADDING = 1.55;
export const CAMERA_PADDING_MIN = 1.52;
export const CAMERA_PADDING_MAX = 2.0;
export const BASE_FOV = (50 * Math.PI) / 180;
export const MIN_FOV = (20 * Math.PI) / 180;
export const MAX_FOV = (75 * Math.PI) / 180;
export const CAMERA_NEAR_EPS = 0.05;
export const CAMERA_DISTANCE_FALLOFF = 2.2;
export const UNIFORM_FLOAT_COUNT = 76; // Increased from 72 to add bell params
export const CAMERA_EYE_OFFSET = 36;
export const CAMERA_MODE_OFFSET = 39;
export const VP_MATRIX_OFFSET = 40;
export const CAMERA_RIGHT_OFFSET = 56;
export const CAMERA_UP_OFFSET = 60;
export const CAMERA_FORWARD_OFFSET = 64;
export const GRID_FLAG_OFFSET = 68;
export const DRAIN_RADIUS_OFFSET = 13;
export const BASIS_FLIP_DOT_THRESHOLD = -0.999;
export const SPECULAR_GAIN_OFFSET = 69;
export const ROUGHNESS_OFFSET = 70;
export const SHOW_INNER_OFFSET = 71;
export const BELL_WIDTH_OFFSET = 72; // Bell bulge width parameter
export const SEAM_BLEND_WIDTH_OFFSET = 73;
export const SEAM_OVERLAP_OFFSET = 74;

export const INVALID_STATUS_COOLDOWN_MS = 750;

// Exported default clear color
export const DEFAULT_CLEAR_COLOR = [0.18, 0.53, 0.87, 1.0] as [number, number, number, number];

// Professional CAD-style camera constants
// Zoom limits (multiplicative factor around scene)
export const MIN_ZOOM = 0.1;   // Allow zooming out to see 10x the scene
export const MAX_ZOOM = 50.0;  // Allow zooming in to 1/50th of the scene
export const ZOOM_SENSITIVITY = 0.002;  // How fast wheel zoom responds
export const ZOOM_SMOOTH_FACTOR = 0.15; // For smooth zoom interpolation

// Pan constants
export const PAN_SENSITIVITY = 1.5;     // Base pan speed multiplier
export const PAN_INERTIA_DECAY = 8.0;   // How fast pan inertia decays (higher = faster stop)
export const PAN_INERTIA_MIN = 0.5;     // Minimum pan velocity to maintain inertia

// Rotation constants  
export const ORBIT_SENSITIVITY = 3.0;   // Radians per full canvas drag
export const TURNTABLE_SENSITIVITY = 1.5;
export const ROTATION_INERTIA_DECAY = 6.0;
export const ROTATION_INERTIA_MIN = 0.02; // Minimum angular velocity (rad/s) to maintain inertia

// Autorotate constants
export const AUTOROTATE_SPEED_DEFAULT = 0.3;  // Radians per second
export const AUTOROTATE_SPEED_MIN = 0.05;
export const AUTOROTATE_SPEED_MAX = 2.0;
export const AUTOROTATE_RESUME_DELAY_MS = 500; // Time after interaction before autorotate resumes

// Focus/tween constants
export const FOCUS_TWEEN_DURATION_MS = 400;
export const FOCUS_ZOOM_FACTOR = 1.5;  // How much to zoom in on double-click focus

// WASD navigation (free camera mode)
export const FREE_MOVE_SPEED_BASE = 100.0;  // Units per second at speed=1
export const FREE_MOVE_SPEED_BOOST = 3.0;   // Multiplier when shift held
export const FREE_LOOK_SENSITIVITY = 0.003; // Radians per pixel

// Pivot behavior
export const PIVOT_LERP_SPEED = 0.15;  // How fast pivot moves toward target (0-1 per frame)
export const PIVOT_SNAP_THRESHOLD = 0.1; // Distance threshold to snap pivot

export default {
  DEFAULT_INTERACTIVE_LOD,
  MIN_INTERACTIVE_LOD,
  INTERACTIVE_THETA_RATIO_FLOOR,
  INTERACTIVE_Z_RATIO_FLOOR,
  MIN_THETA_STATIC,
  MIN_Z_STATIC,
  MIN_THETA_INTERACTIVE,
  MIN_Z_INTERACTIVE,
  PARAM_UPDATE_TIMEOUT_MS,
  CAMERA_BROADCAST_MS,
  CAMERA_EPSILON,
  CAMERA_STATIC_EPS,
  CAMERA_PADDING,
  CAMERA_PADDING_MIN,
  CAMERA_PADDING_MAX,
  BASE_FOV,
  MIN_FOV,
  MAX_FOV,
  CAMERA_NEAR_EPS,
  CAMERA_DISTANCE_FALLOFF,
  UNIFORM_FLOAT_COUNT,
  CAMERA_EYE_OFFSET,
  CAMERA_MODE_OFFSET,
  VP_MATRIX_OFFSET,
  CAMERA_RIGHT_OFFSET,
  BASIS_FLIP_DOT_THRESHOLD,
  CAMERA_UP_OFFSET,
  CAMERA_FORWARD_OFFSET,
  GRID_FLAG_OFFSET,
  DRAIN_RADIUS_OFFSET,
  INVALID_STATUS_COOLDOWN_MS,
  DEFAULT_CLEAR_COLOR,
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_SENSITIVITY,
  ZOOM_SMOOTH_FACTOR,
  PAN_SENSITIVITY,
  PAN_INERTIA_DECAY,
  PAN_INERTIA_MIN,
  ORBIT_SENSITIVITY,
  TURNTABLE_SENSITIVITY,
  ROTATION_INERTIA_DECAY,
  ROTATION_INERTIA_MIN,
  AUTOROTATE_SPEED_DEFAULT,
  AUTOROTATE_SPEED_MIN,
  AUTOROTATE_SPEED_MAX,
  AUTOROTATE_RESUME_DELAY_MS,
  FOCUS_TWEEN_DURATION_MS,
  FOCUS_ZOOM_FACTOR,
  FREE_MOVE_SPEED_BASE,
  FREE_MOVE_SPEED_BOOST,
  FREE_LOOK_SENSITIVITY,
  PIVOT_LERP_SPEED,
  PIVOT_SNAP_THRESHOLD,
};
