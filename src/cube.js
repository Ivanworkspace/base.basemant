import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { rustTexture } from './rust';

gsap.registerPlugin(ScrollTrigger);

// Cubo in acciaio corten con la B incisa, riflessi da "studio" e scintille.
// Segue lo scroll della pagina e il mouse. Restituisce una funzione per fermarlo.
export async function startCube(canvas, { reducedMotion = false } = {}) {
  if (document.fonts?.load) await Promise.race([document.fonts.load('900 200px Archivo'), new Promise((r) => { setTimeout(r, 1500); })]);

  const desk = window.innerWidth > 800;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.z = 7.5;

  // Ambiente con pannelli luminosi caldi: dà al metallo riflessi veri.
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x0e0705);
  const panel = (color, k, w, h, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    mesh.position.set(x, y, z); mesh.lookAt(0, 0, 0); env.add(mesh);
  };
  panel(0xffe2c4, 7, 8, 3, -5, 6, 5);
  panel(0xff4a36, 6, 3, 9, 7, 0, 2);
  panel(0xff9a4a, 3, 9, 2, 0, -6, 4);
  panel(0x6a86a8, 1.6, 4, 6, -7, -1, -3);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(env, 0.03).texture;
  scene.environment = envTexture;

  // Cubo con spigoli arrotondati: ogni vertice viene "gonfiato" verso una sfera interna.
  const geometry = new THREE.BoxGeometry(2, 2, 2, 40, 40, 40);
  const pos = geometry.attributes.position; const nor = geometry.attributes.normal;
  const radius = 0.15; const inner = 1 - radius;
  const v = new THREE.Vector3(); const q = new THREE.Vector3();
  const clamp = (a) => Math.max(-inner, Math.min(inner, a));
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    q.set(clamp(v.x), clamp(v.y), clamp(v.z));
    v.sub(q).normalize();
    nor.setXYZ(i, v.x, v.y, v.z);
    q.addScaledVector(v, radius);
    pos.setXYZ(i, q.x, q.y, q.z);
  }

  const textures = [];
  const tex = (source, srgb) => {
    const t = new THREE.CanvasTexture(source);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8; textures.push(t); return t;
  };
  const material = (rust) => new THREE.MeshStandardMaterial({
    map: tex(rust.color, true), bumpMap: tex(rust.bump), bumpScale: 5, roughnessMap: tex(rust.bump),
    roughness: 0.95, metalness: 0.55, envMapIntensity: 1.1,
  });
  const plain = material(rustTexture(512, 512));
  const lettered = material(rustTexture(512, 512, 'B'));
  const cube = new THREE.Mesh(geometry, [lettered, plain, plain, plain, lettered, plain]);
  scene.add(cube);

  const light = new THREE.PointLight(0xff4a36, 2.5, 30, 0);
  light.position.set(-4, 3, 5);
  scene.add(light);

  // Scintille che salgono.
  const N = desk ? 240 : 140;
  const sparks = new Float32Array(N * 3); const speed = [];
  for (let i = 0; i < N; i += 1) {
    sparks[i * 3] = (Math.random() - 0.5) * 18;
    sparks[i * 3 + 1] = (Math.random() - 0.5) * 12;
    sparks[i * 3 + 2] = (Math.random() - 0.5) * 9 - 1;
    speed.push(0.003 + Math.random() * 0.01);
  }
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparks, 3));
  const sparkMaterial = new THREE.PointsMaterial({ color: 0xff9a4a, size: 0.035, transparent: true, opacity: 0.75 });
  scene.add(new THREE.Points(sparkGeometry, sparkMaterial));

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  // Percorso del cubo lungo la pagina: si sposta, ruota e cambia scala sezione dopo sezione.
  const s = { x: desk ? 1.9 : 0, y: desk ? 0 : 1.5, ry: 0.5, rx: 0.3, sc: desk ? 1 : 0.72 };
  let timeline;
  if (!reducedMotion) {
    timeline = gsap.timeline({ scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: 1.4 } })
      .to(s, { x: 0, y: 0, ry: 3.4, rx: 0.7, sc: desk ? 1.55 : 1, duration: 1 })
      .to(s, { x: desk ? 3.7 : 0, y: desk ? 1.5 : 2.2, ry: 6.4, rx: 0.2, sc: desk ? 0.5 : 0.4, duration: 1 })
      .to(s, { x: 0, y: 3, ry: 9, sc: 0.3, duration: 1 })
      .to(s, { x: desk ? 3.4 : 0, y: desk ? 0 : 2, ry: 11.5, rx: 0.5, sc: desk ? 0.8 : 0.5, duration: 1 })
      .to(s, { x: 0, y: 0.6, ry: 14, rx: 0.3, sc: desk ? 1.25 : 0.8, duration: 1 });
  }

  let mx = 0; let my = 0; let cx = 0; let cy = 0;
  const onMove = (e) => { mx = e.clientX / window.innerWidth - 0.5; my = e.clientY / window.innerHeight - 0.5; };
  window.addEventListener('mousemove', onMove);

  const clock = new THREE.Clock();
  let frame = 0;
  const loop = () => {
    const t = clock.getElapsedTime();
    cx += (mx - cx) * 0.05; cy += (my - cy) * 0.05;
    cube.position.set(s.x, s.y + Math.sin(t * 0.9) * 0.12, 0);
    cube.rotation.set(s.rx + cy * 0.7, s.ry + (reducedMotion ? 0 : t * 0.12) + cx * 1.1, 0);
    cube.scale.setScalar(1.3 * s.sc);
    light.position.x = -4 + cx * 8;
    const a = sparkGeometry.attributes.position.array;
    for (let i = 0; i < N; i += 1) { a[i * 3 + 1] += speed[i]; if (a[i * 3 + 1] > 6) a[i * 3 + 1] = -6; }
    sparkGeometry.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);
    frame = requestAnimationFrame(loop);
  };
  loop();
  canvas.classList.add('is-ready');
  ScrollTrigger.refresh();

  return () => {
    cancelAnimationFrame(frame);
    timeline?.scrollTrigger?.kill();
    timeline?.kill();
    window.removeEventListener('resize', resize);
    window.removeEventListener('mousemove', onMove);
    geometry.dispose(); sparkGeometry.dispose(); sparkMaterial.dispose();
    plain.dispose(); lettered.dispose(); textures.forEach((t) => t.dispose());
    envTexture.dispose(); pmrem.dispose(); renderer.dispose();
  };
}
