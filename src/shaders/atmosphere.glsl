uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;
uniform float time;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec2 vUv;

void main() {
    vec3 baseColor = vec3(0.9, 0.9, 0.8); // Slightly yellow tint for the backrooms
    float noise = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
    
    // Add subtle flickering
    float flicker = 0.95 + 0.05 * sin(time * 2.0 + noise * 10.0);
    
    // Add some noise to the color
    vec3 finalColor = baseColor * flicker;
    finalColor += noise * 0.05;
    
    // Calculate fog
    float depth = gl_FragCoord.z / gl_FragCoord.w;
    float fogFactor = smoothstep(fogNear, fogFar, depth);
    
    // Mix with fog color
    finalColor = mix(finalColor, fogColor, fogFactor);
    
    gl_FragColor = vec4(finalColor, 1.0);
} 