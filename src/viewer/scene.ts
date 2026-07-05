import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

export interface Viewer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  content: THREE.Group; // swap target for regenerated house geometry
  env: THREE.Group; // swap target for the streetscape (public realm) — kept SEPARATE from content
}

export function createViewer(canvas: HTMLCanvasElement): Viewer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; // filmic response for photoreal PBR
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fb2c6);

  // IBL: a CC0 HDRI sky drives reflections on glass / metal / roofs and the
  // ambient lighting, plus doubles as the sky background.
  new RGBELoader().load('hdri/env.hdr', (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = hdr;
    scene.background = hdr;
  });

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.set(22, 18, 26);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.target.set(0, 3, 0);

  // lights
  const hemi = new THREE.HemisphereLight(0xbcd3ff, 0x404038, 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3e0, 2.2);
  sun.position.set(18, 30, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const s = 70; // wide enough to cover a row of houses along the street
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  scene.add(sun);

  // ground + grid
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(60, 60, 0x3a3f47, 0x2f333a);
  scene.add(grid);

  // houses and the public realm live in two SEPARATE groups so the streetscape
  // never gets tangled up with the (portable-core) house geometry.
  const env = new THREE.Group();
  scene.add(env);
  const content = new THREE.Group();
  scene.add(content);

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  function loop() {
    requestAnimationFrame(loop);
    resize();
    controls.update();
    renderer.render(scene, camera);
  }
  loop();

  return { scene, camera, renderer, controls, content, env };
}
