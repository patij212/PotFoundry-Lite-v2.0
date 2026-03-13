import math

def ground_alpha(x, y, grid_size):
    fx = (x / grid_size) % 1
    fz = (y / grid_size) % 1
    dx = 0.5 - abs(fx - 0.5)
    dz = 0.5 - abs(fz - 0.5)
    minor_width = 0.05
    major_width = 0.12
    major_step = 3
    axis_threshold = grid_size * 0.08
    is_minor = dx < minor_width or dz < minor_width
    gx = math.floor(x / grid_size)
    gy = math.floor(y / grid_size)
    ix = int(gx)
    iy = int(gy)
    is_major = False
    if (ix % major_step) == 0 or (iy % major_step) == 0:
        if dx < major_width or dz < major_width:
            is_major = True
    is_axis = abs(x) < axis_threshold or abs(y) < axis_threshold
    if is_axis:
        return 1.0
    if is_major:
        return 0.95
    if is_minor:
        return 0.6
    return 0.0

if __name__ == "__main__":
    base_radius = 70.0
    grid_size = max(1.0, base_radius * 1.0)
    for x in range(-30, 31, 5):
        print(x, ground_alpha(x, 0, grid_size))
