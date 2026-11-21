/* 頁標題大字（Works、About 共用）：後面是一片大大小小的 3D 眼球（跟滑鼠轉、閒置隨機飄，同首頁），
   標題字形當遮罩，只露出字裡的眼球；每次載入隨機排列。失敗時保留原本黑字。 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const h1 = document.querySelector('.pagehead h1');
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
catch (e) { throw e; }                           // 不支援 WebGL → 維持黑字
renderer.outputColorSpace = THREE.SRGBColorSpace;
const gl = renderer.domElement;                  // 眼球畫在這（不放進頁面）

const out = document.createElement('canvas');    // 頁面上看到的：字形 × 眼球
out.setAttribute('aria-hidden', 'true');
h1.appendChild(out);
const ctx = out.getContext('2d');

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 2000);
camera.position.z = 1000;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(-0.6, 0.8, 1);
scene.add(key);

// 眼球：前半球貼虹膜、後半球眼白（與首頁相同）
const half = start => {
  const g = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, start, Math.PI / 2);
  g.rotateX(Math.PI / 2);
  return g;
};
const frontGeo = half(0), backGeo = half(Math.PI / 2);
const nrm = frontGeo.attributes.normal, uv = frontGeo.attributes.uv;
for (let i = 0; i < nrm.count; i++) uv.setXY(i, 0.5 + nrm.getX(i) * 0.5, 0.5 + nrm.getY(i) * 0.5);
const tex = new THREE.TextureLoader().load('images/eyes.jpg');
tex.colorSpace = THREE.SRGBColorSpace;
tex.anisotropy = 4;
const phong = { shininess: 69, specular: 0x777777 };
const frontMat = new THREE.MeshPhongMaterial({ map: tex, ...phong });
const backMat = new THREE.MeshPhongMaterial({ color: 0xf4f2ee, ...phong });

let meshes = [], eyes = [], W = 1, H = 1, depth = 300, font = '', text = '', baseY = 0, ink = '#0a0a0a';
const dummy = new THREE.Object3D();

function build() {
  h1.classList.remove('eyed');
  const cs = getComputedStyle(h1);
  const size = parseFloat(cs.fontSize);
  font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
  text = h1.textContent.trim().toUpperCase();
  ink = cs.color;
  const lineH = parseFloat(cs.lineHeight) || size * 0.85;
  ctx.font = font;
  const tm = ctx.measureText(text);
  const asc = tm.fontBoundingBoxAscent, desc = tm.fontBoundingBoxDescent;
  const bleed = Math.ceil(size * 0.25);
  W = Math.ceil(tm.width) + 4; H = Math.ceil(lineH) + bleed * 2;
  baseY = bleed + (lineH - (asc + desc)) / 2 + asc;

  const dpr = Math.min(devicePixelRatio || 1, 2);
  out.width = W * dpr; out.height = H * dpr;
  out.style.width = W + 'px'; out.style.height = H + 'px'; out.style.top = -bleed + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  Object.assign(camera, { left: -W / 2, right: W / 2, top: H / 2, bottom: -H / 2 });
  camera.updateProjectionMatrix();
  depth = H * 0.9;

  // 大大小小的眼球隨機塞滿整塊（由大到小，不重疊）
  const list = [], rMax = H * 0.2, rMin = H * 0.04;
  for (let r = rMax; r >= rMin; r *= 0.9) {
    for (let tries = 0; tries < 400; tries++) {
      const x = -W / 2 + Math.random() * W, y = -H / 2 + Math.random() * H;
      if (list.every(e => Math.hypot(e.x - x, e.y - y) > e.r + r + 1)) list.push({ x, y, r });
    }
  }
  eyes = list.map(e => ({ ...e, q: new THREE.Quaternion(),
    p1: Math.random() * 100, p2: Math.random() * 100, sp: 0.4 + Math.random() * 0.5 }));
  meshes.forEach(m => { scene.remove(m); m.dispose(); });
  meshes = [new THREE.InstancedMesh(frontGeo, frontMat, eyes.length),
            new THREE.InstancedMesh(backGeo, backMat, eyes.length)];
  meshes.forEach(m => scene.add(m));
  h1.classList.add('eyed');
}

// 滑鼠／手指位置（以字塊中心為原點、y 朝上）
const ptr = { x: 0, y: 0, last: -1e9 };
function setPtr(cx, cy) {
  const b = out.getBoundingClientRect();
  ptr.x = cx - b.left - W / 2; ptr.y = H / 2 - (cy - b.top); ptr.last = performance.now();
}
addEventListener('pointermove', e => setPtr(e.clientX, e.clientY), { passive: true });
addEventListener('touchstart', e => setPtr(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
addEventListener('touchmove', e => setPtr(e.touches[0].clientX, e.touches[0].clientY), { passive: true });

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const target = new THREE.Vector3(), want = new THREE.Quaternion();
let prev = performance.now(), mix = 0, visible = true;
new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(h1);   // 捲出畫面就不畫

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - prev) / 1000, 0.1); prev = now;
  if (!visible) return;
  const idle = now - ptr.last > 1500 && !reduce;
  mix += ((idle ? 1 : 0) - mix) * (1 - Math.exp(-dt / 0.8 * 3));
  const t = now / 1000, k = 1 - Math.exp(-dt / 0.12);
  eyes.forEach((e, idx) => {
    const wx = e.x + Math.sin(t * e.sp + e.p1) * depth * 0.9;
    const wy = e.y + Math.cos(t * e.sp * 0.8 + e.p2) * depth * 0.7;
    target.set(ptr.x * (1 - mix) + wx * mix, ptr.y * (1 - mix) + wy * mix, depth);
    dummy.position.set(e.x, e.y, 0);
    dummy.lookAt(target);
    want.copy(dummy.quaternion);
    e.q.slerp(want, k);
    dummy.quaternion.copy(e.q);
    dummy.scale.setScalar(e.r);
    dummy.updateMatrix();
    meshes.forEach(m => m.setMatrixAt(idx, dummy.matrix));
  });
  meshes.forEach(m => { m.instanceMatrix.needsUpdate = true; });
  renderer.render(scene, camera);

  // 字形當遮罩：先畫黑字，再只在字裡疊上眼球
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, W, H);
  ctx.font = font; ctx.fillStyle = ink;
  ctx.fillText(text, 0, baseY);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.drawImage(gl, 0, 0, W, H);
}

document.fonts.ready.then(() => {
  build();
  let tm; addEventListener('resize', () => { clearTimeout(tm); tm = setTimeout(build, 150); });
  requestAnimationFrame(frame);
});
