/**
 * Pot Material for WebGL Renderer
 * 
 * Creates a Three.js material that matches the WebGPU renderer's appearance.
 */

import * as THREE from 'three';
import type { PotParams } from './potGeometry';

/**
 * Create a material for the pot mesh
 */
export function createPotMaterial(params: PotParams): THREE.Material {
    // Use MeshStandardMaterial for PBR-like rendering
    const material = new THREE.MeshStandardMaterial({
        vertexColors: true,    // Use per-vertex colors from geometry
        flatShading: false,    // Smooth shading
        side: THREE.DoubleSide, // Render both sides (for inner wall)
        metalness: 0.1,
        roughness: 0.6,
    });

    return material;
}

/**
 * Create a material with custom shader (for more WebGPU-like appearance)
 */
export function createCustomPotMaterial(params: PotParams): THREE.ShaderMaterial {
    const vertexShader = `
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vColor;
    varying vec2 vUv;
    
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
      vColor = color;
      vUv = uv;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

    const fragmentShader = `
    uniform vec3 uLightDir;
    uniform vec3 uViewPos;
    uniform float uAmbient;
    uniform float uDiffuse;
    uniform float uSpecular;
    uniform float uRoughness;
    uniform float uFresnel;
    
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vColor;
    varying vec2 vUv;
    
    void main() {
      vec3 normal = normalize(vNormal);
      vec3 lightDir = normalize(uLightDir);
      vec3 viewDir = normalize(-vPosition);
      
      // Ambient
      vec3 ambient = uAmbient * vColor;
      
      // Diffuse (Lambertian)
      float NdotL = max(dot(normal, lightDir), 0.0);
      vec3 diffuse = uDiffuse * NdotL * vColor;
      
      // Specular (Blinn-Phong)
      vec3 halfDir = normalize(lightDir + viewDir);
      float NdotH = max(dot(normal, halfDir), 0.0);
      float shininess = 2.0 / pow(uRoughness, 4.0) - 2.0;
      float spec = pow(NdotH, shininess);
      vec3 specular = uSpecular * spec * vec3(1.0);
      
      // Fresnel (rim lighting)
      float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0) * uFresnel;
      vec3 rim = fresnel * vec3(0.8, 0.9, 1.0);
      
      // Combine
      vec3 color = ambient + diffuse + specular + rim;
      
      // Gamma correction
      color = pow(color, vec3(1.0 / 2.2));
      
      gl_FragColor = vec4(color, 1.0);
    }
  `;

    return new THREE.ShaderMaterial({
        uniforms: {
            uLightDir: { value: new THREE.Vector3(1, 2, 1.5).normalize() },
            uViewPos: { value: new THREE.Vector3(0, 0, 400) },
            uAmbient: { value: 0.3 },
            uDiffuse: { value: 0.7 },
            uSpecular: { value: 0.4 },
            uRoughness: { value: 0.5 },
            uFresnel: { value: 0.2 },
        },
        vertexShader,
        fragmentShader,
        vertexColors: true,
        side: THREE.DoubleSide,
    });
}
