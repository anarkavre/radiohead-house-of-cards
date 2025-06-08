import * as THREE from 'three';

const verticesUrl = import.meta.env.VITE_VERTICES_URL;
const musicUrl = import.meta.env.VITE_MUSIC_URL;

const vertexData = [];
let maxVertices = 0;

const progress = document.getElementById('progress');

async function loadVertexData() {
  const response = await fetch(verticesUrl);
  let bytesRead = 0;
  let totalBytes;
  let data;

  for await (const chunk of response.body) {
    if (!totalBytes) {
      const dataView = new DataView(chunk.slice(0, 4).buffer);
      totalBytes = dataView.getUint32(0, true);
      data = chunk.slice(4);
    } else {
      const newData = new Uint8Array(data.length + chunk.length)
      newData.set(data, 0);
      newData.set(chunk, data.length);
      data = newData;
    }

    bytesRead += chunk.length;
    progress.value = bytesRead / totalBytes * 100;
  }

  const buffer = data.buffer;
  let offset = 0;

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
document.body.appendChild(renderer.domElement);

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
      playing = false;
      return;
    }

    renderFrame(frameCount);

    frameCount++;

    delta = delta % interval;
  }
}

async function renderFrame(n) {
  await loadGeometry(vertexData[n - 1]);
  renderer.render(scene, camera);
}

renderFrame(1);

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
    playing = false;
  }
});