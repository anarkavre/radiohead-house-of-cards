import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

const verticesUrl = import.meta.env.VITE_VERTICES_URL;
const musicUrl = import.meta.env.VITE_MUSIC_URL;

const vertexData = [];
let maxVertices = 0;

const progress = document.getElementById('progress');

async function loadVertexData() {
  const cache = await caches.open('radiohead-house-of-cards');
  let response = await cache.match(verticesUrl);
  let cacheResponse = false;

  if (!response) {
    response = await fetch(verticesUrl);
    cacheResponse = true;
  }

  let bytesRead = 0;
  let totalBytes;
  let data;

  for await (const chunk of response.body) {
    if (!totalBytes) {
      const dataView = new DataView(chunk.slice(0, 4).buffer);
      totalBytes = dataView.getUint32(0, true);
      data = chunk;
    } else {
      const newData = new Uint8Array(data.length + chunk.length)
      newData.set(data, 0);
      newData.set(chunk, data.length);
      data = newData;
    }

    bytesRead += chunk.length;
    progress.value = bytesRead / totalBytes * 100;
  }

  if (cacheResponse) {
    response = new Response(data, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': data.length
      }
    });
    await cache.put(verticesUrl, response);
  }

  const buffer = data.buffer;
  let offset = 4;

  while (offset < buffer.byteLength) {
    const dataView = new DataView(buffer.slice(offset, offset + 4));
    const count = dataView.getUint32(0, true) / 13;
    maxVertices = Math.max(maxVertices, count);
    offset += 4;
    const positions = new Float32Array(buffer.slice(offset, offset + count * 12));
    const intensities = new Uint8Array(buffer.slice(offset + count * 12, offset + count * 13));
    vertexData.push({ count, positions, intensities });
    offset += count * 13;
  }
}

await loadVertexData();

document.getElementById('div').remove();

const fov = Math.PI / 3;
const cameraZ = (window.innerHeight / 2) / Math.tan(fov / 2);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(fov), window.innerWidth / window.innerHeight, cameraZ / 10, cameraZ * 10);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

camera.position.x = window.innerWidth / 2;
camera.position.y = window.innerHeight / 2;
camera.position.z = (window.innerHeight / 2) / Math.tan(fov / 2);
camera.lookAt(window.innerWidth / 2, window.innerHeight / 2, 0);

const vertices = new Float32Array(maxVertices * 3);
const colors = new Uint8Array(maxVertices * 3);
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3, true));
const material = new THREE.PointsMaterial({ vertexColors: true });
const points = new THREE.Points(geometry, material);
points.scale.set(2.0, -2.0, 2.0);
points.translateX(window.innerWidth / 2 - 150);
points.translateY(window.innerHeight / 2 + 150);
points.translateZ(150);
scene.add(points);

async function loadGeometry(vertexData) {
  const vertices = geometry.attributes.position.array;
  const colors = geometry.attributes.color.array;

  for (let i = 0; i < vertexData.count; i++) {
    vertices[i * 3] = vertexData.positions[i * 3];
    vertices[i * 3 + 1] = vertexData.positions[i * 3 + 1];
    vertices[i * 3 + 2] = vertexData.positions[i * 3 + 2];
    colors[i * 3] = vertexData.intensities[i];
    colors[i * 3 + 1] = vertexData.intensities[i];
    colors[i * 3 + 2] = 200;
  }

  geometry.setDrawRange(0, vertexData.count);
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;
}

const audio = new Audio(musicUrl);

const clock = new THREE.Clock();
let delta = 0;
const interval = 1 / 30;
let frameCount = 1;

function animate() {
  delta += clock.getDelta();

  if (delta > interval) {
    if (frameCount > vertexData.length) {
      renderer.setAnimationLoop(null);
      frameCount = 1;
      renderFrame(1);
      renderer.render(scene, camera);
      playing = false;

      if (renderer.xr.getSession() != null) {
        renderer.xr.getSession().end();
      }

      return;
    }

    renderFrame(frameCount);

    frameCount++;

    delta = delta % interval;
  }

  renderer.render(scene, camera);
}

async function renderFrame(n) {
  await loadGeometry(vertexData[n - 1]);
}

renderFrame(1);
renderer.render(scene, camera);

let playing = false;

document.addEventListener('click', function () {
  if (!playing) {
    audio.play();
    renderer.setAnimationLoop(animate);
    playing = true;
  }
});

document.addEventListener('visibilitychange', function () {
  if (document.hidden && playing) {
    audio.pause();
    audio.currentTime = 0;
    renderer.setAnimationLoop(null);
    frameCount = 1;
    renderFrame(1);
    renderer.render(scene, camera);
    playing = false;
  }
});

renderer.xr.addEventListener('sessionstart', function () {
  camera.near = 0.1;
  camera.far = 10;
  camera.updateProjectionMatrix();
  material.size = 0.0001;
  points.scale.set(0.001, -0.001, 0.001);
  points.position.set(0, 0, 0);
  points.translateX(-0.05);
  points.translateY(1.75);
  points.translateZ(-0.3);
});

renderer.xr.addEventListener('sessionend', function () {
  camera.fov = THREE.MathUtils.radToDeg(fov);
  camera.near = cameraZ / 10;
  camera.far = cameraZ * 10;
  camera.updateProjectionMatrix();
  camera.position.x = window.innerWidth / 2;
  camera.position.y = window.innerHeight / 2;
  camera.position.z = (window.innerHeight / 2) / Math.tan(fov / 2);
  camera.lookAt(window.innerWidth / 2, window.innerHeight / 2, 0);
  material.size = 1.0;
  points.scale.set(2.0, -2.0, 2.0);
  points.position.set(0, 0, 0);
  points.translateX(window.innerWidth / 2 - 150);
  points.translateY(window.innerHeight / 2 + 150);
  points.translateZ(150);
  renderFrame(1);
  renderer.render(scene, camera);
});

window.addEventListener('resize', function() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});