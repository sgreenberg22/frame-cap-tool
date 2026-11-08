// WebGL2 renderer: the single source of truth for live preview, captures and GIF frames.
import { curveToLut, hexToRgb, isIdentityCurve, VIEW_MODES } from './filters'

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main(){ v_uv = (a_pos + 1.0) * 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`

const FRAG = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_tex;
uniform sampler2D u_prev;
uniform sampler2D u_curve;
uniform sampler3D u_lut;
uniform vec2 u_texel;
uniform float u_exp, u_con, u_sat, u_vib, u_temp, u_tint, u_gam, u_hi, u_sh, u_gray, u_sep, u_inv, u_blur, u_sharp, u_vig, u_grain, u_opacity;
uniform vec3 u_levels;
uniform mat3 u_hueM;
uniform float u_useHue, u_useCurve, u_useLut, u_lutStr;
uniform vec4 u_chroma;
uniform vec2 u_chromaTol;
uniform float u_split, u_seed, u_enabled;
uniform int u_view;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21) + u_seed); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float lumaAt(vec2 uv){ return dot(texture(u_tex, uv).rgb, LUMA); }

vec4 sampleSpatial(vec2 uv){
  vec4 c = texture(u_tex, uv);
  if (u_blur > 0.0) {
    vec4 acc = c; float wsum = 1.0;
    for (int i = 0; i < 16; i++) {
      float a = float(i) * 2.39996;
      float r = sqrt(float(i) + 0.5) / 4.0;
      vec2 o = vec2(cos(a), sin(a)) * r * u_blur * u_texel;
      float w = 1.0 - r * 0.5;
      acc += texture(u_tex, uv + o) * w; wsum += w;
    }
    c = acc / wsum;
  }
  if (u_sharp > 0.0) {
    vec3 n = texture(u_tex, uv + vec2(u_texel.x,0)).rgb + texture(u_tex, uv - vec2(u_texel.x,0)).rgb
           + texture(u_tex, uv + vec2(0,u_texel.y)).rgb + texture(u_tex, uv - vec2(0,u_texel.y)).rgb;
    vec3 lap = 4.0 * c.rgb - n;
    c.rgb += lap * u_sharp * 0.25;
  }
  return c;
}

vec4 grade(vec4 src, vec2 uv){
  vec3 c = src.rgb * u_exp;
  c.r += u_temp; c.b -= u_temp; c.g -= u_tint;
  c = (c - 0.5) * u_con + 0.5;
  float l = clamp(dot(c, LUMA), 0.0, 1.0);
  c += u_sh * (1.0 - smoothstep(0.0, 0.5, l)) + u_hi * smoothstep(0.5, 1.0, l);
  c = clamp(c, 0.0, 1.0);
  c = pow(clamp((c - u_levels.x) / (u_levels.y - u_levels.x), 0.0, 1.0), vec3(u_levels.z));
  c = pow(c, vec3(u_gam));
  l = dot(c, LUMA);
  float s = u_sat;
  float mx = max(c.r, max(c.g, c.b)); float mn = min(c.r, min(c.g, c.b));
  s *= 1.0 + u_vib * (1.0 - (mx - mn));
  c = l + (c - l) * s;
  if (u_useHue > 0.5) c = c * u_hueM;
  float y = dot(c, LUMA);
  c = mix(c, vec3(y), u_gray);
  vec3 sp = vec3(dot(c, vec3(0.393,0.769,0.189)), dot(c, vec3(0.349,0.686,0.168)), dot(c, vec3(0.272,0.534,0.131)));
  c = mix(c, sp, u_sep);
  c = mix(c, 1.0 - c, u_inv);
  c = clamp(c, 0.0, 1.0);
  if (u_useCurve > 0.5) c = vec3(texture(u_curve, vec2(c.r*255.0/256.0+0.5/256.0,0.5)).r, texture(u_curve, vec2(c.g*255.0/256.0+0.5/256.0,0.5)).r, texture(u_curve, vec2(c.b*255.0/256.0+0.5/256.0,0.5)).r);
  if (u_useLut > 0.5) { float n = float(textureSize(u_lut, 0).x); vec3 lc = texture(u_lut, c * ((n - 1.0) / n) + 0.5 / n).rgb; c = mix(c, lc, u_lutStr); }
  if (u_vig > 0.0) { float d = length(uv - 0.5) * 1.4142; c *= 1.0 - u_vig * smoothstep(0.4, 1.0, d); }
  if (u_grain > 0.0) c += (hash(uv * 1000.0) - 0.5) * u_grain;
  float a = src.a * u_opacity;
  if (u_chroma.a > 0.5) a *= smoothstep(u_chromaTol.x, u_chromaTol.x + u_chromaTol.y, distance(c, u_chroma.rgb));
  return vec4(clamp(c, 0.0, 1.0), a);
}

vec3 falseColor(float l){
  if (l < 0.02) return vec3(0.5,0.0,0.6);
  if (l < 0.1) return vec3(0.0,0.2,1.0);
  if (l < 0.38) return vec3(l);
  if (l < 0.42) return vec3(0.0,0.8,0.2);
  if (l < 0.52) return vec3(1.0,0.6,0.7);
  if (l < 0.8) return vec3(l);
  if (l < 0.95) return vec3(1.0,0.9,0.0);
  return vec3(1.0,0.0,0.0);
}

void main(){
  vec2 uv = v_uv;
  if (u_enabled < 0.5 || uv.x < u_split) { outColor = texture(u_tex, uv); return; }
  vec4 c = grade(sampleSpatial(uv), uv);
  if (u_view == 1) c.rgb = c.rgb * mat3(0.567,0.433,0.0, 0.558,0.442,0.0, 0.0,0.242,0.758);
  else if (u_view == 2) c.rgb = c.rgb * mat3(0.625,0.375,0.0, 0.7,0.3,0.0, 0.0,0.3,0.7);
  else if (u_view == 3) c.rgb = c.rgb * mat3(0.95,0.05,0.0, 0.0,0.433,0.567, 0.0,0.475,0.525);
  else if (u_view == 4) c.rgb = falseColor(dot(c.rgb, LUMA));
  else if (u_view == 5) {
    float l = dot(c.rgb, LUMA);
    float stripe = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) / 12.0));
    if (l > 0.95) c.rgb = mix(c.rgb, vec3(1.0,0.0,0.0), stripe * 0.8);
    else if (l < 0.03) c.rgb = mix(c.rgb, vec3(0.0,0.4,1.0), stripe * 0.8);
  }
  else if (u_view == 6) {
    float tl = lumaAt(uv + u_texel*vec2(-1,1)), t = lumaAt(uv + u_texel*vec2(0,1)), tr = lumaAt(uv + u_texel*vec2(1,1));
    float l = lumaAt(uv + u_texel*vec2(-1,0)), r = lumaAt(uv + u_texel*vec2(1,0));
    float bl = lumaAt(uv + u_texel*vec2(-1,-1)), b = lumaAt(uv + u_texel*vec2(0,-1)), br = lumaAt(uv + u_texel*vec2(1,-1));
    float gx = -tl - 2.0*l - bl + tr + 2.0*r + br; float gy = -tl - 2.0*t - tr + bl + 2.0*b + br;
    c.rgb = vec3(clamp(length(vec2(gx, gy)) * 2.0, 0.0, 1.0));
  }
  else if (u_view == 7) c.rgb = vec3(step(0.5, dot(c.rgb, LUMA)));
  else if (u_view == 8) c.rgb = clamp(abs(texture(u_tex, uv).rgb - texture(u_prev, uv).rgb) * 4.0, 0.0, 1.0);
  outColor = c;
}`

export function hueMatrix(deg) {
  const a = Math.cos((deg * Math.PI) / 180)
  const b = Math.sin((deg * Math.PI) / 180)
  // Row-major CSS matrix; uploaded as-is so that GLSL "v * M" yields rows dotted with v.
  return new Float32Array([
    0.213 + a * 0.787 - b * 0.213,
    0.715 - a * 0.715 - b * 0.715,
    0.072 - a * 0.072 + b * 0.928,
    0.213 - a * 0.213 + b * 0.143,
    0.715 + a * 0.285 + b * 0.14,
    0.072 - a * 0.072 - b * 0.283,
    0.213 - a * 0.213 - b * 0.787,
    0.715 - a * 0.715 + b * 0.715,
    0.072 + a * 0.928 + b * 0.072,
  ])
}

let webgl2Support
export function supportsWebGL2() {
  if (webgl2Support !== undefined) return webgl2Support
  try {
    webgl2Support = !!document.createElement('canvas').getContext('webgl2')
  } catch {
    webgl2Support = false
  }
  return webgl2Support
}

export function createRenderer(canvas, { preserve = true } = {}) {
  let gl
  try {
    gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: preserve, alpha: true, antialias: false })
  } catch {
    return null
  }
  if (!gl) return null
  const compile = (type, src) => {
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
    return s
  }
  const prog = gl.createProgram()
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog))
  gl.useProgram(prog)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'a_pos')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

  const U = {}
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS)
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(prog, i)
    U[info.name] = gl.getUniformLocation(prog, info.name)
  }

  const mkTex = (unit, target = gl.TEXTURE_2D) => {
    const t = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(target, t)
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    if (target === gl.TEXTURE_3D) gl.texParameteri(target, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE)
    return t
  }
  let texA = mkTex(0)
  let texB = mkTex(1)
  const curveTex = mkTex(2)
  const lutTex = mkTex(3, gl.TEXTURE_3D)
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB32F, 2, 2, 2, 0, gl.RGB, gl.FLOAT, new Float32Array(24))
  const floatLinear = !!gl.getExtension('OES_texture_float_linear')
  if (!floatLinear) {
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  }
  gl.uniform1i(U.u_tex, 0)
  gl.uniform1i(U.u_prev, 1)
  gl.uniform1i(U.u_curve, 2)
  gl.uniform1i(U.u_lut, 3)
  let curveKey = null
  let lutRef = null
  let hasFrame = false

  function upload(source) {
    // Swap so the previous frame stays bound to u_prev (motion view)
    ;[texA, texB] = [texB, texA]
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texA)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, hasFrame ? texB : texA)
    hasFrame = true
  }

  function setCurve(points) {
    const key = points && !isIdentityCurve(points) ? JSON.stringify(points) : null
    if (key === curveKey) return !!key
    curveKey = key
    if (!key) return false
    const lut = curveToLut(points)
    const rgba = new Uint8Array(256 * 4)
    for (let i = 0; i < 256; i++) rgba[i * 4] = lut[i]
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, curveTex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba)
    return true
  }

  function setLut(lut) {
    if (lut === lutRef) return !!lut
    lutRef = lut
    if (!lut) return false
    gl.activeTexture(gl.TEXTURE3)
    gl.bindTexture(gl.TEXTURE_3D, lutTex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB32F, lut.size, lut.size, lut.size, 0, gl.RGB, gl.FLOAT, lut.data)
    return true
  }

  /**
   * Draw a source into the canvas (caller sizes the canvas).
   * opts: { width, height, newFrame=true, view='normal', split=0, enabled=true, lut, seed }
   */
  function render(source, f, opts = {}) {
    const w = opts.width || canvas.width
    const h = opts.height || canvas.height
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    gl.viewport(0, 0, w, h)
    if (source && (opts.newFrame !== false || !hasFrame)) upload(source)
    const sw = opts.sourceWidth || w
    const sh = opts.sourceHeight || h
    gl.uniform2f(U.u_texel, 1 / sw, 1 / sh)
    gl.uniform1f(U.u_exp, (Math.pow(2, f.exposure || 0) * (f.brightness ?? 100)) / 100)
    gl.uniform1f(U.u_con, (f.contrast ?? 100) / 100)
    gl.uniform1f(U.u_sat, (f.saturate ?? 100) / 100)
    gl.uniform1f(U.u_vib, (f.vibrance || 0) / 100)
    gl.uniform1f(U.u_temp, ((f.temperature || 0) / 100) * 0.15)
    gl.uniform1f(U.u_tint, ((f.tint || 0) / 100) * 0.15)
    gl.uniform1f(U.u_gam, 1 / Math.max(0.05, f.gamma || 1))
    gl.uniform1f(U.u_hi, ((f.highlights || 0) / 100) * 0.25)
    gl.uniform1f(U.u_sh, ((f.shadows || 0) / 100) * 0.25)
    gl.uniform1f(U.u_gray, (f.grayscale || 0) / 100)
    gl.uniform1f(U.u_sep, (f.sepia || 0) / 100)
    gl.uniform1f(U.u_inv, (f.invert || 0) / 100)
    // Blur radius is specified in output pixels; scale to source pixels.
    gl.uniform1f(U.u_blur, (f.blur || 0) * (sw / w))
    gl.uniform1f(U.u_sharp, ((f.sharpen || 0) / 100) * 1.5)
    gl.uniform1f(U.u_vig, (f.vignette || 0) / 100)
    gl.uniform1f(U.u_grain, ((f.grain || 0) / 100) * 0.2)
    gl.uniform1f(U.u_opacity, (f.opacity ?? 100) / 100)
    const lb = (f.levelsBlack ?? 0) / 255
    const lw = Math.max(lb + 1 / 255, (f.levelsWhite ?? 255) / 255)
    gl.uniform3f(U.u_levels, lb, lw, 1 / Math.max(0.05, f.levelsMid ?? 1))
    gl.uniform1f(U.u_useHue, f.hue ? 1 : 0)
    gl.uniformMatrix3fv(U.u_hueM, false, hueMatrix(f.hue || 0))
    gl.uniform1f(U.u_useCurve, setCurve(f.curve) ? 1 : 0)
    gl.uniform1f(U.u_useLut, setLut(opts.lut || null) ? 1 : 0)
    gl.uniform1f(U.u_lutStr, (f.lutStrength ?? 100) / 100)
    const [cr, cg, cb] = hexToRgb(f.chromaColor)
    gl.uniform4f(U.u_chroma, cr / 255, cg / 255, cb / 255, f.chromaEnabled ? 1 : 0)
    gl.uniform2f(U.u_chromaTol, ((f.chromaTolerance ?? 30) / 100) * 0.9, Math.max(0.001, ((f.chromaSoftness ?? 10) / 100) * 0.5))
    gl.uniform1f(U.u_split, opts.split || 0)
    gl.uniform1f(U.u_seed, opts.seed ?? Math.random())
    gl.uniform1f(U.u_enabled, opts.enabled === false ? 0 : 1)
    const viewIdx = Math.max(
      0,
      VIEW_MODES.findIndex(([id]) => id === (opts.view || 'normal')),
    )
    gl.uniform1i(U.u_view, viewIdx)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  function destroy() {
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }

  return { gl, render, destroy, canvas }
}
