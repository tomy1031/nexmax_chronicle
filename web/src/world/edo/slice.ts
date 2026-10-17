import * as THREE from 'three'

// 仮の起動確認用。見た目の試作は別途ここに作る。
export function startEdoSlice(app: HTMLDivElement, _ui: HTMLDivElement): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  app.appendChild(renderer.domElement)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#9cc8f0')
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500)
  camera.position.set(0, 2, 5)
  const box = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: '#3a86ff' }))
  scene.add(box, new THREE.HemisphereLight('#ffffff', '#444444', 2))
  renderer.setAnimationLoop((t) => {
    box.rotation.y = t / 1000
    renderer.render(scene, camera)
  })
}
