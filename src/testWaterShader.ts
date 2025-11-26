/**
 * Test page entry point for water shader
 */

import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3, Color4 } from '@babylonjs/core/Maths/math';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import '@babylonjs/core/Meshes/meshBuilder';
import { createWaterMaterial } from "./waterShader";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);

const createScene = () => {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.1, 0.1, 0.15, 1);

  // Camera
  const camera = new ArcRotateCamera(
    "camera",
    0,
    Math.PI / 3,
    10,
    Vector3.Zero(),
    scene
  );
  camera.attachControl(canvas, true);

  // Light
  const light = new HemisphericLight(
    "light",
    new Vector3(0, 1, 0),
    scene
  );
  light.intensity = 0.7;

  // Create sphere with water shader
  const sphere = MeshBuilder.CreateSphere(
    "sphere",
    { diameter: 4, segments: 64 },
    scene
  );

  // Apply enhanced water material with ocean depth map
  const waterMaterial = createWaterMaterial(scene, "OceanDepthMap.png", "water");
  sphere.material = waterMaterial;

  return scene;
};

const scene = createScene();

engine.runRenderLoop(() => {
  scene.render();
});

window.addEventListener("resize", () => {
  engine.resize();
});
