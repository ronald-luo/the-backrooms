uniform sampler2D tDiffuse;
uniform float time;
varying vec2 vUv;

// CRT effect parameters
const float SCANLINE_INTENSITY = 0.075;
const float SCANLINE_COUNT = 800.0;
const float CURVATURE = 0.1;
const float VIGNETTE_INTENSITY = 0.5;
const float VIGNETTE_ROUNDNESS = 0.5;
const float CHROMA_OFFSET = 0.002;

// Helper function for screen curvature
vec2 curve(vec2 uv) {
    uv = (uv - 0.5) * 2.0;
    uv *= 1.1;
    uv = uv / 2.0 + 0.5;
    return uv;
}

void main() {
    // Apply screen curvature
    vec2 curvedUv = curve(vUv);
    
    // Check if we're outside the curved screen
    if (curvedUv.x < 0.0 || curvedUv.x > 1.0 || curvedUv.y < 0.0 || curvedUv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    // Chromatic aberration
    float r = texture2D(tDiffuse, curvedUv + vec2(CHROMA_OFFSET, 0.0)).r;
    float g = texture2D(tDiffuse, curvedUv).g;
    float b = texture2D(tDiffuse, curvedUv - vec2(CHROMA_OFFSET, 0.0)).b;

    // Scanlines
    float scanline = sin(curvedUv.y * SCANLINE_COUNT) * SCANLINE_INTENSITY;
    
    // Vignette
    vec2 vignetteUv = curvedUv * 2.0 - 1.0;
    float vignette = 1.0 - dot(vignetteUv, vignetteUv) * VIGNETTE_INTENSITY;
    vignette = pow(vignette, VIGNETTE_ROUNDNESS);

    // Combine all effects
    vec3 color = vec3(r, g, b);
    color *= (1.0 - scanline);
    color *= vignette;

    // Add subtle flicker
    float flicker = 1.0 - 0.02 * sin(time * 10.0);
    color *= flicker;

    gl_FragColor = vec4(color, 1.0);
} 