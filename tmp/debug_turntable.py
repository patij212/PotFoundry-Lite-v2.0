import math

WORLD_UP=(0.0,0.0,1.0)
PITCH_SOFT_LIMIT=math.pi*0.5 - 1e-3

# Reimplement helper functions (copy from test file)
def vec_dot(a,b):
    return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]

def vec_cross(a,b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])

def vec_length(v):
    return math.sqrt(max(vec_dot(v,v),0.0))

def vec_normalize(v):
    length=vec_length(v)
    if length < 1e-9:
        return (0.0,0.0,0.0)
    return (v[0]/length, v[1]/length, v[2]/length)

def rotate_vec(v, axis, angle):
    axis_norm = vec_normalize(axis)
    if vec_length(axis_norm) < 1e-9 or abs(angle) < 1e-9:
        return v
    cos_a = math.cos(angle)
    sin_a = math.sin(angle)
    dot_va = vec_dot(axis_norm, v)
    cross_va = vec_cross(axis_norm, v)
    return (
        v[0] * cos_a + cross_va[0] * sin_a + axis_norm[0] * dot_va * (1 - cos_a),
        v[1] * cos_a + cross_va[1] * sin_a + axis_norm[1] * dot_va * (1 - cos_a),
        v[2] * cos_a + cross_va[2] * sin_a + axis_norm[2] * dot_va * (1 - cos_a),
    )

def build_basis_from_forward(forward):
    fwd = vec_normalize(forward)
    if vec_length(fwd) < 1e-9 or not all(math.isfinite(c) for c in fwd):
        fwd=(0.0,-1.0,0.0)
    right = vec_normalize(vec_cross(WORLD_UP, fwd))
    if vec_length(right) < 1e-9:
        for candidate in ((1.0,0.0,0.0),(0.0,1.0,0.0),(0.0,0.0,1.0)):
            right = vec_normalize(vec_cross(candidate, fwd))
            if vec_length(right)>=1e-9: break
    if vec_length(right) < 1e-9:
        right=(1.0,0.0,0.0)
    up = vec_normalize(vec_cross(fwd, right))
    if vec_length(up) < 1e-9:
        up = WORLD_UP
    return {'right': right, 'up': up, 'forward': fwd}

def basis_from_angles(rot_x, rot_y):
    cos_pitch=math.cos(rot_x)
    sin_pitch=math.sin(rot_x)
    cos_yaw=math.cos(rot_y)
    sin_yaw=math.sin(rot_y)
    forward = (sin_yaw * cos_pitch, -cos_yaw * cos_pitch, -sin_pitch)
    return build_basis_from_forward(forward)

def rotate_basis_about_axis(basis, axis, angle):
    right = rotate_vec(basis['right'], axis, angle)
    up = rotate_vec(basis['up'], axis, angle)
    forward = rotate_vec(basis['forward'], axis, angle)
    fwd = vec_normalize(forward)
    right_vec = vec_cross(up, fwd)
    if vec_length(right_vec) < 1e-9:
        right_vec = vec_cross(basis['up'], fwd)
    if vec_length(right_vec) < 1e-9:
        right_vec = vec_cross(WORLD_UP, fwd)
    right_vec = vec_normalize(right_vec)
    up_vec = vec_cross(fwd, right_vec)
    if vec_length(up_vec) < 1e-9:
        up_vec = vec_cross(fwd, (1.0, 0.0, 0.0))
    if vec_length(up_vec) < 1e-9:
        up_vec = WORLD_UP
    else:
        up_len = vec_length(up_vec)
        up_vec = (up_vec[0]/up_len, up_vec[1]/up_len, up_vec[2]/up_len)
    return {'right': right_vec, 'up': up_vec, 'forward': fwd}

def sync_angles_from_basis(basis):
    fwd = vec_normalize(basis['forward'])
    pitch = math.asin(max(-1.0, min(1.0, -fwd[2])))
    yaw = math.atan2(fwd[0], -fwd[1])
    return pitch, yaw

def turntable_step(basis, d_yaw, d_pitch):
    yawed = rotate_basis_about_axis(basis, WORLD_UP, d_yaw)
    pitched = rotate_basis_about_axis(yawed, yawed['right'], d_pitch)
    rot_x, rot_y = sync_angles_from_basis(pitched)
    yawed_x, yawed_y = sync_angles_from_basis(yawed)
    if rot_x > PITCH_SOFT_LIMIT:
        rot_x = PITCH_SOFT_LIMIT
        rot_y = yawed_y
        pitched = basis_from_angles(rot_x, yawed_y)
    elif rot_x < -PITCH_SOFT_LIMIT:
        rot_x = -PITCH_SOFT_LIMIT
        rot_y = yawed_y
        pitched = basis_from_angles(rot_x, yawed_y)
    return pitched, rot_x, rot_y

basis = basis_from_angles(math.radians(85.0), 0.0)
print('initial basis fwd:', basis['forward'])
yawed = rotate_basis_about_axis(basis, WORLD_UP, 0.0)
print('yawed basis fwd:', yawed['forward'])
yawed_x, yawed_y = sync_angles_from_basis(yawed)
print('yawed_x', yawed_x, 'yawed_y', yawed_y)
new_basis, rot_x, rot_y = turntable_step(basis, d_yaw=0.0, d_pitch=math.radians(15.0))
print('\nnew basis fwd:', new_basis['forward'])
print('rot_x rad', rot_x, 'rot_y rad', rot_y)
print('rot_x deg', math.degrees(rot_x), 'rot_y deg', math.degrees(rot_y))
