/**
 * Enhanced water shader for Babylon.js sphere
 * Closely matching Unity shader: "Shader Graphs/kalle_skip_spark_waves"
 *
 * Core features:
 * - Ocean depth map texture support (OceanDepthMap.png)
 * - Texture-based caustics with animated UV deformation (SwsCaustics.png)
 * - Water color blending (shallow to deep) based on depth map channels
 * - Caustics masked by inverted depth map (1.0 - depthR)
 * - Animated wave displacement (optional)
 * - Enhanced foam with noise patterns
 * - Sparkle/shimmer effects
 * - Specular highlights and Fresnel
 */

import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Effect } from '@babylonjs/core/Materials/effect';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';

export function createWaterShader(scene: Scene) {
  const shaderName = "waterShader";

  // Vertex Shader with wave displacement
  const vertexShader = `
    precision highp float;

    // Attributes
    attribute vec3 position;
    attribute vec3 normal;
    attribute vec2 uv;

    // Uniforms
    uniform mat4 worldViewProjection;
    uniform mat4 world;
    uniform float time;
    uniform float waveHeight;
    uniform float waveScale;
    uniform float waveSpeed;

    // Varyings
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec2 vUV;
    varying vec3 vWorldPosition;

    // Simple noise for waves
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    void main() {
      // Flip both U and V coordinates to match Unity's UV orientation and un-mirror
      // Rotate 180 degrees around Y-axis (vertical axis) by shifting U by 0.5
      vUV = vec2(fract(1.0 - uv.x + 0.5), 1.0 - uv.y);

      // Calculate wave displacement
      vec2 waveUV = uv * waveScale;
      float wave1 = noise(waveUV + time * waveSpeed);
      float wave2 = noise(waveUV * 1.7 - time * waveSpeed * 0.8);
      float waveDisplacement = (wave1 + wave2 * 0.5) * waveHeight;

      // Apply displacement along normal
      vec3 displacedPosition = position + normal * waveDisplacement;

      vNormal = normalize((world * vec4(normal, 0.0)).xyz);
      vWorldPosition = (world * vec4(displacedPosition, 1.0)).xyz;
      vPosition = displacedPosition;

      gl_Position = worldViewProjection * vec4(displacedPosition, 1.0);
    }
  `;

  // Fragment Shader with enhanced effects
  const fragmentShader = `
    precision highp float;

    // Varyings
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec2 vUV;
    varying vec3 vWorldPosition;

    // Uniforms
    uniform float time;
    uniform vec3 cameraPosition;
    uniform sampler2D depthMap;
    uniform sampler2D causticsMap;  // Caustics texture

    // Water colors
    uniform vec3 shallowColor;  // Light blue for shallow water
    uniform vec3 waterColor;    // Medium blue
    uniform vec3 deepColor;     // Dark blue for deep water
    uniform vec3 causticColor;  // Caustic color (Unity: Color_AA9D37A8)

    // Caustics
    uniform float causticScale;
    uniform float causticStrength;
    uniform float causticSpeed;  // Unity: CausticDeformSpeed
    uniform float causticDeform;
    uniform float causticDeformScale;

    // Foam
    uniform vec3 foamColor;
    uniform float foamWidth;           // Unity: Vector1_B578A5FB (upperLimit in GetFoam)
    uniform float foamStrength;        // Unity: Vector1_1FF74F03 (rippleStrength in GetFoam)
    uniform float foamNoiseScale;      // Unity: Vector1_1AD755F5
    uniform float foamNoiseSpeed;      // Unity: Vector1_20269F33 (speed in GetFoam)
    uniform float foamNoiseStrength;   // Unity: Vector1_970A3ED4
    uniform float foamRippleWidth;     // Unity: Vector1_7AD05A77
    uniform float foamCoast;           // Unity: Vector1_E5BFF445
    uniform float foamNRipples;        // Unity: Vector1_EA35692E
    uniform float foamUvStrength;      // Unity: Vector1_A30CE4CF

    // Sparkle
    uniform float sparkleScale;
    uniform float sparkleSpeed;
    uniform float sparkleCutoff;
    uniform float sparkleStrength;

    // Waves (for UV distortion)
    uniform float waveUVDistortion;

    // Simple 2D noise function
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);

      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));

      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    // Fractal noise
    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      float frequency = 1.0;

      for(int i = 0; i < 4; i++) {
        value += amplitude * noise(p * frequency);
        frequency *= 2.0;
        amplitude *= 0.5;
      }

      return value;
    }

    // Texture-based caustics with deformation (matching Unity shader)
    float caustics(vec2 uv, float t, float depthMask) {
      // Unity's approach: animate offset using sine wave
      // offset = causticDeform * sin(time * causticSpeed + causticDeformScale * uv.x * uv.y)
      float uvProduct = uv.x * uv.y;
      float animatedOffset = sin(t * causticSpeed + causticDeformScale * uvProduct) * causticDeform;

      // Apply tiling and animated offset (Unity: TilingAndOffset node)
      vec2 causticUV = uv * causticScale + vec2(animatedOffset);

      // Sample caustics texture
      vec4 causticSample = texture2D(causticsMap, causticUV);

      // Unity multiplies: caustics.r * (1.0 - depthMask) * causticStrength
      float causticValue = causticSample.r * depthMask * causticStrength;

      return causticValue;
    }

    // Unity's RipplePass function - creates animated ripple waves
    float RipplePass(float t, float depth, float nRipples, float rippleStrength, float rippleW) {
      float rippleDist = 1.0 / nRipples;
      rippleStrength *= (1.0 - depth);

      for (int i = 0; i < 8; i++) {  // Max iterations for WebGL
        if (float(i) >= nRipples) break;

        float e1 = fract(t + rippleDist * float(i));
        float e2 = fract(e1 + rippleW);

        if ((depth > e1) && (depth < e2)) {
          float peak = (e1 + e2) / 2.0;
          float strength = (rippleW / 4.0) - abs(depth - peak);
          strength *= rippleStrength;
          return strength;
        }
      }

      return 0.0;
    }

    // Unity's GetFoam function - exact implementation
    float foam(vec2 uv, float t, float depth) {
      // Unity uses TWO separate speeds:
      // 1. FoamNoiseSpeed (0.0001) for noise animation
      // 2. FoamSpeed (0.03) for ripple animation

      // Sample animated noise (Unity: two layers of GradientNoise with TilingAndOffset)
      // Layer 1: moves forward with FoamNoiseSpeed
      vec2 noiseUV1 = uv * vec2(2.05, 1.0) + vec2(t * 0.0001);  // FoamNoiseSpeed = 0.0001
      float noise1 = fbm(noiseUV1 * foamNoiseScale);

      // Layer 2: moves backward with FoamNoiseSpeed
      vec2 noiseUV2 = uv - vec2(t * 0.0001);  // FoamNoiseSpeed = 0.0001
      float noise2 = fbm(noiseUV2 * foamNoiseScale);

      // Multiply the two noise layers
      float noiseVal = noise1 * noise2;

      // UV-based time distortion for ripples (uses FoamSpeed = 0.03)
      float nRipples = round(foamNRipples);
      float rippleTime = t;
      rippleTime += foamUvStrength * uv.x * uv.y;
      rippleTime = rippleTime * foamNoiseSpeed;  // This is FoamSpeed (0.03)

      // Add ripple contribution
      noiseVal += RipplePass(rippleTime, depth, nRipples, foamStrength, foamRippleWidth);

      // Binary passes
      bool noisePass = noiseVal > (depth - 0.1);
      bool upperPass = depth < foamWidth;

      float foamVal = 0.0;
      if (noisePass && upperPass)
        foamVal = 1.0;

      // Coast foam - always show in very shallow water
      if (depth < foamCoast)
        foamVal = 1.0;

      return foamVal;
    }

    // Sparkle effect
    float sparkle(vec2 uv, float t) {
      vec2 sparkleUV = uv * sparkleScale;

      // Animated sparkle pattern
      float s1 = noise(sparkleUV + t * sparkleSpeed);
      float s2 = noise(sparkleUV * 1.7 - t * sparkleSpeed * 0.7);

      // Sharp cutoff for sparkle points
      float sparkleValue = s1 * s2;
      sparkleValue = smoothstep(sparkleCutoff, sparkleCutoff + 0.01, sparkleValue);

      return sparkleValue * sparkleStrength;
    }

    void main() {
      // Sample depth map (Unity uses both R and A channels)
      vec2 depthUV = vUV;

      // Add subtle UV distortion based on waves
      vec2 uvDistortion = vec2(
        noise(vUV * 10.0 + time * 0.1),
        noise(vUV * 10.0 - time * 0.1)
      ) * waveUVDistortion;
      depthUV += uvDistortion;

      vec4 depthSample = texture2D(depthMap, depthUV);
      float depthR = depthSample.r; // Red channel: shallow to medium water
      float depthA = depthSample.a; // Alpha channel: blend with deep water

      // Unity's color blending logic:
      // 1. Lerp between shallow and water using R channel
      // 2. Lerp result with deep water using A channel
      vec3 color1 = mix(shallowColor, waterColor, depthR);
      vec3 baseColor = mix(deepColor, color1, depthA);

      vec3 finalColor = baseColor;

      // DEBUG: Uncomment to visualize depth channels
      // finalColor = vec3(depthR, depthA, 0.0); // R=red, A=green

      // Add caustics (Unity: lerp between baseColor and causticColor using caustics value)
      // Unity calculates: caustics.r * (1.0 - depthMap.r) * causticStrength
      float depthMask = 1.0 - depthR;  // Inverted depth for caustics masking
      float causticsValue = caustics(vUV, time, depthMask);
      finalColor = mix(finalColor, causticColor, causticsValue);

      // Add foam (Unity: lerp between caustics result and foamColor using foam value)
      float foamValue = foam(vUV, time, depthR);
      finalColor = mix(finalColor, foamColor, foamValue);

      // Sparkles (disabled in Unity)
      // float sparkleValue = sparkle(vUV, time);
      // finalColor += vec3(sparkleValue);

      // Fresnel and specular disabled to match Unity
      // vec3 viewDir = normalize(cameraPosition - vWorldPosition);
      // vec3 normalVec = normalize(vNormal);
      // float fresnel = pow(1.0 - max(dot(viewDir, normalVec), 0.0), 3.0);
      // vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
      // vec3 reflectDir = reflect(-lightDir, normalVec);
      // float spec = pow(max(dot(viewDir, reflectDir), 0.0), 64.0);
      // finalColor += vec3(spec * 0.5 + fresnel * 0.2);

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  // Register the shader
  Effect.ShadersStore[shaderName + "VertexShader"] = vertexShader;
  Effect.ShadersStore[shaderName + "FragmentShader"] = fragmentShader;

  return shaderName;
}

export function createWaterMaterial(
  scene: Scene,
  depthMapPath: string = "OceanDepthMap.png",
  name: string = "waterMaterial"
): ShaderMaterial {
  const shaderName = createWaterShader(scene);

  const material = new ShaderMaterial(name, scene, shaderName, {
    attributes: ["position", "normal", "uv"],
    uniforms: [
      "worldViewProjection",
      "world",
      "time",
      "cameraPosition",
      "shallowColor",
      "waterColor",
      "deepColor",
      "causticColor",
      "causticScale",
      "causticStrength",
      "causticSpeed",
      "causticDeform",
      "causticDeformScale",
      "foamColor",
      "foamWidth",
      "foamStrength",
      "foamNoiseScale",
      "foamNoiseSpeed",
      "foamNoiseStrength",
      "foamRippleWidth",
      "foamCoast",
      "foamNRipples",
      "foamUvStrength",
      "sparkleScale",
      "sparkleSpeed",
      "sparkleCutoff",
      "sparkleStrength",
      "waveHeight",
      "waveScale",
      "waveSpeed",
      "waveUVDistortion",
    ],
    samplers: ["depthMap", "causticsMap"],
  });

  // Load the depth map texture
  const depthTexture = new Texture(depthMapPath, scene);
  material.setTexture("depthMap", depthTexture);

  // Load the caustics texture (SwsCaustics.png)
  const causticsTexture = new Texture("SwsCaustics.png", scene);
  causticsTexture.wrapU = Texture.WRAP_ADDRESSMODE;
  causticsTexture.wrapV = Texture.WRAP_ADDRESSMODE;
  material.setTexture("causticsMap", causticsTexture);

  // Set default water colors (matching Unity shader)
  material.setVector3("shallowColor", new Vector3(0.4, 0.8, 0.95)); // Light cyan
  material.setVector3("waterColor", new Vector3(0.46, 0.79, 1.0)); // Medium blue
  material.setVector3("deepColor", new Vector3(0.02, 0.08, 0.25)); // Dark blue
  material.setVector3("causticColor", new Vector3(1.0, 1.0, 1.0)); // White caustics (Unity: Color_AA9D37A8)

  // Texture-based caustics settings (matching Unity screenshot)
  material.setFloat("causticScale", 200.0);         // Unity: CausticScale
  material.setFloat("causticStrength", 0.6);        // Unity: CausticStrength
  material.setFloat("causticSpeed", 0.38);          // Unity: CausticDeformSpeed
  material.setFloat("causticDeform", 131.0);        // Unity: CausticDeform
  material.setFloat("causticDeformScale", 0.08);    // Unity: CausticDeformScale

  // Foam settings (matching Unity GetFoam parameters from screenshot)
  material.setVector3("foamColor", new Vector3(0.7, 0.95, 1.0)); // Light cyan (Unity: FoamColor)
  material.setFloat("foamWidth", 0.99);             // Unity: FoamWidth (upperLimit in GetFoam)
  material.setFloat("foamStrength", 40.0);          // Unity: FoamStrength (rippleStrength)
  material.setFloat("foamNoiseScale", 500.0);       // Unity: FoamNoiseScale
  material.setFloat("foamNoiseSpeed", 0.03);        // Unity: FoamSpeed (speed in GetFoam)
  material.setFloat("foamNoiseStrength", 0.1);      // Unity: FoamNoiseStrength
  material.setFloat("foamRippleWidth", 0.2);        // Unity: RippleWidth
  material.setFloat("foamCoast", 0.39);             // Unity: CoastFoam
  material.setFloat("foamNRipples", 3.0);           // Unity: nRipples
  material.setFloat("foamUvStrength", 0.0);         // Unity: FoamUvStrength (DISABLED!)

  // Sparkle settings (disabled by default like Unity)
  material.setFloat("sparkleScale", 500.0);         // Unity: 500
  material.setFloat("sparkleSpeed", 0.0);           // Unity: 0 (disabled)
  material.setFloat("sparkleCutoff", 1.0);          // Unity: 1 (disabled)
  material.setFloat("sparkleStrength", 0.3);

  // Wave settings (matching Unity values)
  material.setFloat("waveHeight", 0.0);             // Disabled for now - Unity: 160
  material.setFloat("waveScale", 9.0);              // Unity: 9
  material.setFloat("waveSpeed", 0.001);            // Unity: 0.001
  material.setFloat("waveUVDistortion", 0.001);     // Reduced UV distortion

  // Animation
  let time = 0;
  scene.registerBeforeRender(() => {
    time += scene.getEngine().getDeltaTime() / 1000;
    material.setFloat("time", time);
    material.setVector3("cameraPosition", scene.activeCamera!.position);
  });

  return material;
}
