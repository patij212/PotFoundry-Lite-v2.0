import math

base_radius = 70.0
H = 120.0
grid_size = max(1.0, base_radius * 1.0)
minor_width = 0.05
major_width = 0.12
major_step = 3
axis_threshold = grid_size * 0.08
xs = [i * 10 - 200 for i in range(41)]
line_positions = []
for x in xs:
    fx = (x / grid_size) % 1
    dx = 0.5 - abs(fx - 0.5)
    is_minor = dx < minor_width
    gx = math.floor(x / grid_size)
    ix = int(gx)
    is_major = False
    if (ix % major_step) == 0:
        if dx < major_width:
            is_major = True
    is_axis = abs(x) < axis_threshold
    if is_minor or is_major or is_axis:
        line_positions.append(x)

print('axis threshold', axis_threshold)
print('line positions sample', line_positions)
