/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { 
  Box, 
  Settings, 
  Play, 
  Pause,
  SkipBack,
  SkipForward,
  Plus, 
  Trash2, 
  RotateCcw, 
  Volume2, 
  Move,
  FileText,
  ChevronRight,
  Zap,
  Maximize
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---

interface BoxType {
  id: number;
  w: number;
  h: number;
  d: number;
  qty: number;
  weight: number;
  color: string;
}

interface Placement {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: string;
  weight: number;
  id: number;
}

interface PalletResult {
  placements: Placement[];
  weight: number;
  max_y: number;
  palletIndex: number;
  volumeUtilization: string;
  palletWeight: string;
  metricPosition: { x: number; y: number; z: number };
}

// --- Utils ---

const createNoiseTexture = (colorHex: string, noiseAmount = 20) => {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();
  
  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, size, size);
  const imgData = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const noise = (Math.random() - 0.5) * noiseAmount;
    imgData.data[i] = Math.min(255, Math.max(0, imgData.data[i] + noise));
    imgData.data[i + 1] = Math.min(255, Math.max(0, imgData.data[i + 1] + noise));
    imgData.data[i + 2] = Math.min(255, Math.max(0, imgData.data[i + 2] + noise));
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
};

// --- Packer Algorithm ---

class Packer {
  pallet: { w: number; h: number; d: number; maxWeightKg: number };
  allowRotation: boolean;

  constructor(palletWidth: number, palletHeight: number, palletDepth: number, maxWeightKg: number, allowRotation: boolean) {
    this.pallet = { w: palletWidth, h: palletHeight, d: palletDepth, maxWeightKg };
    this.allowRotation = allowRotation;
  }

  intersect(b1: any, b2: any) {
    return (
      b1.x < b2.x + b2.w && b1.x + b1.w > b2.x &&
      b1.y < b2.y + b2.h && b1.y + b1.h > b2.y &&
      b1.z < b2.z + b2.d && b1.z + b1.d > b2.z
    );
  }

  getOrientations(box: any) {
    const orientations = [{ w: box.w, d: box.d, h: box.h }];
    if (this.allowRotation && box.w !== box.d) {
      orientations.push({ w: box.d, d: box.w, h: box.h });
    }
    return orientations;
  }

  solve(boxesToPack: any[]) {
    let queue = [...boxesToPack].sort((a, b) => (b.w * b.h * b.d) - (a.w * a.h * a.d));
    const pallets: any[] = [{ placements: [], weight: 0, max_y: 0 }];

    for (let box of queue) {
      let placed = false;
      const orientations = this.getOrientations(box);

      for (let p = 0; p < pallets.length; p++) {
        const currentPallet = pallets[p];
        const potentialCoords = [{ x: 0, y: 0, z: 0 }];
        
        currentPallet.placements.forEach((placement: any) => {
          potentialCoords.push({ x: placement.x + placement.w, y: placement.y, z: placement.z });
          potentialCoords.push({ x: placement.x, y: placement.y, z: placement.z + placement.d });
          if (placement.y + placement.h < this.pallet.h) {
            potentialCoords.push({ x: placement.x, y: placement.y + placement.h, z: placement.z });
          }
        });

        const uniqueCoords = Array.from(new Set(potentialCoords.map(c => `${c.x},${c.y},${c.z}`)))
          .map(s => { const [x, y, z] = s.split(',').map(Number); return { x, y, z }; });
        
        uniqueCoords.sort((a, b) => {
          if (a.y !== b.y) return a.y - b.y;
          if (a.z !== b.z) return a.z - b.z;
          return a.x - b.x;
        });

        for (let coord of uniqueCoords) {
          if (placed) break;
          for (let rotation of orientations) {
            if (placed) break;
            const { w, h, d } = rotation;
            if (coord.x + w > this.pallet.w) continue;
            if (coord.y + h > this.pallet.h) continue;
            if (coord.z + d > this.pallet.d) continue;
            if (currentPallet.weight + box.weight > this.pallet.maxWeightKg) continue;

            const candidate = { x: coord.x, y: coord.y, z: coord.z, w, h, d };
            let collides = false;
            for (let placement of currentPallet.placements) {
              if (this.intersect(candidate, placement)) {
                collides = true;
                break;
              }
            }
            if (collides) continue;

            let supported = false;
            if (coord.y < 1) {
              supported = true;
            } else {
              let supportArea = 0;
              const boxBaseArea = w * d;
              for (let placement of currentPallet.placements) {
                if (Math.abs((placement.y + placement.h) - candidate.y) < 1) {
                  const x_overlap = Math.max(0, Math.min(candidate.x + w, placement.x + placement.w) - Math.max(candidate.x, placement.x));
                  const z_overlap = Math.max(0, Math.min(candidate.z + d, placement.z + placement.d) - Math.max(candidate.z, placement.z));
                  supportArea += x_overlap * z_overlap;
                }
              }
              if (boxBaseArea > 0 && supportArea / boxBaseArea > 0.6) supported = true;
            }

            if (supported) {
              currentPallet.placements.push({ ...candidate, color: box.color, weight: box.weight, id: box.id });
              currentPallet.weight += box.weight;
              currentPallet.max_y = Math.max(currentPallet.max_y, coord.y + h);
              placed = true;
              break;
            }
          }
        }
      }

      if (!placed) {
        const newPallet = { placements: [], weight: 0, max_y: 0 };
        const orientation = orientations[0];
        const { w, h, d } = orientation;
        if (box.weight <= this.pallet.maxWeightKg && w <= this.pallet.w && h <= this.pallet.h && d <= this.pallet.d) {
          newPallet.placements.push({ x: 0, y: 0, z: 0, w, h, d, color: box.color, weight: box.weight, id: box.id });
          newPallet.weight += box.weight;
          newPallet.max_y = h;
          pallets.push(newPallet);
        }
      }
    }

    const palletHeightVolume = this.pallet.w * this.pallet.d * this.pallet.h;
    const processedPallets = pallets.map((p, index) => {
      const palletBoxVolume = p.placements.reduce((vSum: number, b: any) => vSum + (b.w * b.h * b.d), 0);
      const volumeUtilization = palletHeightVolume > 0 ? (palletBoxVolume / palletHeightVolume) * 100 : 0;
      return {
        ...p,
        palletIndex: index + 1,
        volumeUtilization: volumeUtilization.toFixed(2),
        palletWeight: p.weight.toFixed(2),
        metricPosition: { x: this.pallet.w / 2, y: 10, z: this.pallet.d + 150 },
      };
    }).filter(p => p.placements.length > 0);

    const totalUsed = processedPallets.reduce((sum, p) => sum + p.placements.length, 0);
    const totalWeight = processedPallets.reduce((sum, p) => sum + parseFloat(p.palletWeight), 0);
    const totalBoxVolume = processedPallets.reduce((sum, p) => 
      sum + p.placements.reduce((vSum: number, b) => vSum + (b.w * b.h * b.d), 0)
    , 0);
    const availablePalletVolume = processedPallets.length * this.pallet.w * this.pallet.d * this.pallet.h;
    const overallVolumeUtilization = availablePalletVolume > 0 ? (totalBoxVolume / availablePalletVolume) * 100 : 0;

    return {
      pallets: processedPallets,
      count: totalUsed,
      total: boxesToPack.length,
      totalWeight,
      volumeUtilization: overallVolumeUtilization,
    };
  }
}

// --- Components ---

interface InputFieldProps {
  label: string;
  value: any;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  step?: string;
}

const InputField = ({ label, value, onChange, type = "number", step = "1" }: InputFieldProps) => (
  <div className="mb-3">
    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-1">{label}</label>
    <div className="relative">
      <input 
        type={type} 
        step={step} 
        value={value}
        onChange={onChange}
        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all hover:bg-white hover:border-slate-300"
      />
    </div>
  </div>
);

interface BoxRowProps {
  key?: React.Key;
  box: BoxType;
  onDelete: () => void;
  onChange: (id: number, field: string, val: any) => void;
}

const BoxRow = ({ box, onDelete, onChange }: BoxRowProps) => (
  <motion.div 
    layout
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, scale: 0.95 }}
    className="flex flex-col p-4 mb-4 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-cyan-100 transition-all group"
  >
    <div className="flex justify-between items-center mb-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl shadow-lg border border-slate-100 flex items-center justify-center p-1" style={{ backgroundColor: box.color }}>
          <Box className="w-4 h-4 text-white opacity-90" />
        </div>
        <div>
          <span className="font-bold text-slate-900 text-sm tracking-tight block">SKU-{box.id}</span>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Ürün Kartı</span>
        </div>
      </div>
      <button onClick={onDelete} className="text-slate-300 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-xl transition-all">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
    <div className="grid grid-cols-3 gap-3 mb-4">
      <div className="space-y-1">
        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest pl-1">Genişlik</span>
        <input type="number" value={box.w} onChange={(e: any) => onChange(box.id, 'w', parseInt(e.target.value) || 0)} className="w-full border border-slate-100 bg-slate-50 rounded-xl px-2 py-2 text-xs text-center font-bold focus:bg-white focus:ring-2 focus:ring-cyan-500/10 focus:outline-none transition-all" />
      </div>
      <div className="space-y-1">
        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest pl-1">Derinlik</span>
        <input type="number" value={box.d} onChange={(e: any) => onChange(box.id, 'd', parseInt(e.target.value) || 0)} className="w-full border border-slate-100 bg-slate-50 rounded-xl px-2 py-2 text-xs text-center font-bold focus:bg-white focus:ring-2 focus:ring-cyan-500/10 focus:outline-none transition-all" />
      </div>
      <div className="space-y-1">
        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest pl-1">Yükseklik</span>
        <input type="number" value={box.h} onChange={(e: any) => onChange(box.id, 'h', parseInt(e.target.value) || 0)} className="w-full border border-slate-100 bg-slate-50 rounded-xl px-2 py-2 text-xs text-center font-bold focus:bg-white focus:ring-2 focus:ring-cyan-500/10 focus:outline-none transition-all" />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <span className="text-[9px] text-cyan-400 font-bold uppercase tracking-widest pl-1">Ağırlık (kg)</span>
        <input type="number" step="0.1" value={box.weight} onChange={(e: any) => onChange(box.id, 'weight', parseFloat(e.target.value) || 0)} className="w-full border border-cyan-100 bg-cyan-50 text-cyan-700 rounded-xl px-2 py-2 text-xs text-center font-black focus:ring-2 focus:ring-cyan-500/10 focus:outline-none transition-all" />
      </div>
      <div className="space-y-1">
        <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest pl-1">Adet</span>
        <input type="number" value={box.qty} onChange={(e: any) => onChange(box.id, 'qty', parseInt(e.target.value) || 0)} className="w-full border border-emerald-100 bg-emerald-50 text-emerald-700 rounded-xl px-2 py-2 text-xs text-center font-black focus:ring-2 focus:ring-emerald-500/10 focus:outline-none transition-all" />
      </div>
    </div>
  </motion.div>
);


const createTextSprite = (textLines: string[], maxWidth: number, color = '#0f172a', bgColor = 'rgba(255, 255, 255, 0.9)') => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Sprite();

  const fontSizePx = 64;
  const padding = 20;
  const lineHeightPx = fontSizePx * 1.5;
  ctx.font = `900 ${fontSizePx}px Inter, sans-serif`;

  let maxTextWidth = 0;
  textLines.forEach(line => {
    maxTextWidth = Math.max(maxTextWidth, ctx.measureText(line).width);
  });

  const canvasWidth = maxTextWidth + padding * 8;
  const canvasHeight = textLines.length * lineHeightPx + padding * 6;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  // Background
  ctx.fillStyle = bgColor;
  ctx.roundRect ? ctx.roundRect(0, 0, canvasWidth, canvasHeight, 20) : ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.fill();
  
  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.1)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 5;

  ctx.font = `900 ${fontSizePx}px Inter, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  textLines.forEach((line, index) => {
    ctx.fillText(line, canvasWidth / 2, padding * 3 + fontSizePx/2 + index * lineHeightPx);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  
  const material = new THREE.SpriteMaterial({ 
    map: texture, 
    transparent: true, 
    depthTest: false, 
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);

  const baseScale = maxWidth / 1.5;
  sprite.scale.set(baseScale * (canvasWidth / canvasHeight), baseScale, 1);
  sprite.userData.isMetric = true;

  const boxGeo = new THREE.PlaneGeometry(1, 1);
  const boxMat = new THREE.MeshBasicMaterial({ visible: false });
  const boxMesh = new THREE.Mesh(boxGeo, boxMat);
  boxMesh.userData.isInteractiveMetric = true;
  boxMesh.userData.sprite = sprite;
  boxMesh.scale.copy(sprite.scale);
  sprite.add(boxMesh);

  return sprite;
};

// --- Viewer Component ---

const Viewer3D = ({ pallet, palletResults, isOptimizing, boxOpacity, updatePalletMetric, removePalletMetric, simIndex, simReset, allPlacementsOrdered }: any) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const boxesGroupRef = useRef<THREE.Group>(new THREE.Group());

  // Make allPlacementsOrdered accessible via window for internal use if needed
  useEffect(() => {
    (window as any).allPlacementsOrdered = allPlacementsOrdered;
  }, [allPlacementsOrdered]);

  const fitCameraToContent = useCallback((instant = false) => {
    if (!sceneRef.current || !cameraRef.current || !controlsRef.current || palletResults.length === 0) return;

    const box = new THREE.Box3();
    let hasContent = false;
    sceneRef.current.traverse((child) => {
      if (child.userData.isDynamic || child.type === 'Mesh' || child.type === 'Group') {
        // We only want to fit the actual pallet/box content, not the background/lights
        if (child.userData.isDynamic) {
          box.expandByObject(child);
          hasContent = true;
        }
      }
    });

    if (!hasContent) return;

    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const maxSize = Math.max(size.x, size.y, size.z);
    const fov = cameraRef.current.fov;
    const aspect = cameraRef.current.aspect;
    
    // Calculate distance to fit the bounding box
    const fitHeightDistance = size.y / (2 * Math.atan(Math.PI * fov / 360));
    const fitWidthDistance = (size.x / aspect) / (2 * Math.atan(Math.PI * fov / 360));
    let distance = Math.max(fitHeightDistance, fitWidthDistance) + (size.z / 2);
    
    // Add margin
    distance *= 1.4;

    const offset = new THREE.Vector3(0, distance * 0.8, distance);
    const finalPosition = center.clone().add(offset);

    if (instant) {
      cameraRef.current.position.copy(finalPosition);
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
    } else {
      // Smooth transition using GSAP or simple linear interpolation in animate loop would be better,
      // but for now we'll do an immediate update to ensure it fits.
      cameraRef.current.position.copy(finalPosition);
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
    }
  }, [palletResults]);

  useEffect(() => {
    if (palletResults.length > 0 && !isOptimizing) {
      // Small timeout to ensure meshes are updated in the scene
      const timer = setTimeout(() => fitCameraToContent(true), 100);
      return () => clearTimeout(timer);
    }
  }, [palletResults.length, isOptimizing, fitCameraToContent]);

  const dragControlsRef = useRef<any>({
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2(),
    draggable: [],
    isDragging: false,
    currentObject: null,
    offset: new THREE.Vector3(),
    plane: new THREE.Plane(),
    intersection: new THREE.Vector3(),
    trashIcon: null
  });
  
  const textures = useMemo(() => ({ 
    wood: createNoiseTexture('#8d6a45', 50), 
    cardboard: createNoiseTexture('#e0bc87', 40) 
  }), []);

  useEffect(() => {
    if (!mountRef.current) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);
    sceneRef.current = scene;

    boxesGroupRef.current = new THREE.Group();
    boxesGroupRef.current.userData.isDynamic = true;
    scene.add(boxesGroupRef.current);

    const camera = new THREE.PerspectiveCamera(45, mountRef.current.clientWidth / mountRef.current.clientHeight, 1, 8000);
    camera.position.set(pallet.w * 0.75, pallet.h * 1.5, pallet.d * 2.5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); 
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8); 
    dirLight.position.set(pallet.w, pallet.h * 3, pallet.d); 
    dirLight.castShadow = true;
    const d = Math.max(pallet.w, pallet.d, pallet.h) * 2; 
    dirLight.shadow.camera.left = -d; 
    dirLight.shadow.camera.right = d; 
    dirLight.shadow.camera.top = d; 
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    const animate = () => {
      requestAnimationFrame(animate);
      if (controlsRef.current) controlsRef.current.update();
      
      // Animate active boxes (falling + landing effect)
      if (boxesGroupRef.current) {
        boxesGroupRef.current.children.forEach((box: any) => {
          if (box.userData.targetY !== undefined) {
            if (box.position.y > box.userData.targetY) {
              // Falling with acceleration
              box.userData.velocity = (box.userData.velocity || 0) + 1.2;
              box.position.y -= box.userData.velocity;

              if (box.position.y <= box.userData.targetY) {
                box.position.y = box.userData.targetY;
                box.userData.isLanding = true;
                box.userData.landingTick = 0;
              }
            } else if (box.userData.isLanding) {
              // Subtle bounce/squash effect on landing
              box.userData.landingTick++;
              const t = box.userData.landingTick;
              if (t < 15) {
                const s = 1 + Math.sin(t * 0.4) * (0.08 * (1 - t / 15));
                box.scale.set(s, 1 / s, s);
              } else {
                box.scale.set(1, 1, 1);
                box.userData.isLanding = false;
              }
            }
          }
        });
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    const handleResize = () => {
      if (!mountRef.current || !cameraRef.current || !rendererRef.current) return;
      cameraRef.current.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // Sürükle-Bırak metrikleri için Raycasting logic (same as before)
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !mountRef.current || !cameraRef.current) return;
      const rect = mountRef.current.getBoundingClientRect();
      dragControlsRef.current.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      dragControlsRef.current.pointer.y = - ((event.clientY - rect.top) / rect.height) * 2 + 1;
      dragControlsRef.current.raycaster.setFromCamera(dragControlsRef.current.pointer, cameraRef.current);
      
      const intersects = dragControlsRef.current.raycaster.intersectObjects(dragControlsRef.current.draggable, true);
      if (intersects.length > 0) {
        const target = intersects.find((i: any) => i.object.userData.isInteractiveMetric);
        if (!target) return;
        controls.enabled = false;
        dragControlsRef.current.isDragging = true;
        dragControlsRef.current.currentObject = target.object.userData.sprite;
        dragControlsRef.current.plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), dragControlsRef.current.currentObject.position);
        if (dragControlsRef.current.raycaster.ray.intersectPlane(dragControlsRef.current.plane, dragControlsRef.current.intersection)) {
          dragControlsRef.current.offset.copy(dragControlsRef.current.intersection).sub(dragControlsRef.current.currentObject.position);
        }
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragControlsRef.current.isDragging || !mountRef.current || !cameraRef.current) return;
      const rect = mountRef.current.getBoundingClientRect();
      dragControlsRef.current.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      dragControlsRef.current.pointer.y = - ((event.clientY - rect.top) / rect.height) * 2 + 1;
      dragControlsRef.current.raycaster.setFromCamera(dragControlsRef.current.pointer, cameraRef.current);
      if (dragControlsRef.current.raycaster.ray.intersectPlane(dragControlsRef.current.plane, dragControlsRef.current.intersection)) {
        const newPosition = dragControlsRef.current.intersection.sub(dragControlsRef.current.offset);
        newPosition.y = dragControlsRef.current.currentObject.position.y; 
        dragControlsRef.current.currentObject.position.copy(newPosition);
      }
    };

    const onPointerUp = () => {
      if (!dragControlsRef.current.isDragging) return;
      controls.enabled = true;
      dragControlsRef.current.isDragging = false;
      const object = dragControlsRef.current.currentObject;
      if (object) {
        updatePalletMetric(object.userData.palletIdx, object.position);
      }
      dragControlsRef.current.currentObject = null;
    };
    
    mountRef.current.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // Provide fit function globally for the manual button
    (window as any).fitCamera = () => fitCameraToContent(true);

    return () => { 
      window.removeEventListener('resize', handleResize); 
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      if (mountRef.current) mountRef.current.removeEventListener('pointerdown', onPointerDown);
      renderer.dispose();
    };
  }, [pallet.w, pallet.h, pallet.d, updatePalletMetric]);

  // Clear scene when simulation resets (new optimization result)
  useEffect(() => {
    if (!boxesGroupRef.current) return;
    while (boxesGroupRef.current.children.length > 0) {
      const child = boxesGroupRef.current.children[0] as any;
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      boxesGroupRef.current.remove(child);
    }
  }, [simReset]);

  // Handle Box Simulation Rendering
  useEffect(() => {
    if (!boxesGroupRef.current) return;

    const placementsList = allPlacementsOrdered || [];
    const currentBoxesInScene = boxesGroupRef.current.children.length;

    // Add new boxes
    if (simIndex > currentBoxesInScene) {
      const boxGeoCache: { [key: string]: THREE.BoxGeometry } = {};
      for (let i = currentBoxesInScene; i < simIndex; i++) {
        const p = placementsList[i];
        if (!p) continue;

        const key = `${p.w}-${p.h}-${p.d}`;
        if (!boxGeoCache[key]) boxGeoCache[key] = new THREE.BoxGeometry(p.w - 2, p.h - 2, p.d - 2);

        const material = new THREE.MeshStandardMaterial({
          color: p.color,
          map: textures.cardboard,
          roughness: 0.8,
          metalness: 0.05,
          transparent: true,
          opacity: boxOpacity,
        });
        const mesh = new THREE.Mesh(boxGeoCache[key], material);

        const targetY = 144 + p.y + p.h / 2;
        mesh.position.set(p.offsetX + p.x + p.w / 2, targetY + 600, p.z + p.d / 2);
        mesh.userData.targetY = targetY;
        mesh.userData.velocity = 0;

        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const edges = new THREE.EdgesGeometry(boxGeoCache[key]);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.1 }));
        mesh.add(line);
        boxesGroupRef.current.add(mesh);
      }
    }
    // Remove boxes if browsing back
    else if (simIndex < currentBoxesInScene) {
      while (boxesGroupRef.current.children.length > simIndex) {
        const child = boxesGroupRef.current.children[boxesGroupRef.current.children.length - 1] as any;
        boxesGroupRef.current.remove(child);
      }
    }
  }, [simIndex, allPlacementsOrdered, textures, boxOpacity]);

  // Sync opacity on existing boxes when slider changes
  useEffect(() => {
    if (!boxesGroupRef.current) return;
    boxesGroupRef.current.children.forEach((child: any) => {
      if (child.material) {
        child.material.opacity = boxOpacity;
        child.material.needsUpdate = true;
      }
    });
  }, [boxOpacity]);

  // Update Static Scene content (Pallets and Metrics)
  useEffect(() => {
    if (!sceneRef.current || !boxesGroupRef.current) return;
    const scene = sceneRef.current;
    
    const toRemove: THREE.Object3D[] = [];
    scene.traverse(c => { 
      if (c.userData.isDynamic && c !== boxesGroupRef.current) toRemove.push(c); 
    });
    toRemove.forEach(c => scene.remove(c));

    const woodMat = new THREE.MeshStandardMaterial({ map: textures.wood, color: 0xa87e53, roughness: 0.9, metalness: 0.0 });
    const woodMatDark = new THREE.MeshStandardMaterial({ map: textures.wood, color: 0x8b6d5c, roughness: 0.9, metalness: 0.0 });

    const createPalletMesh = (offsetX: number) => {
      const group = new THREE.Group();
      group.userData.isDynamic = true;
      const pw = pallet.w, pd = pallet.d;
      const ph = 144, boardH = 22, blockH = 78, blockW = 145, blockD = 100;
      
      const createBoard = (w: number, h: number, d: number, x: number, y: number, z: number, mat = woodMat) => {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x + w/2 + offsetX, y + h/2, z + d/2);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
      };
      
      // Bottom boards
      [-pd/2 + 50, 0, pd/2 - 50].forEach(z => group.add(createBoard(pw, boardH, 100, 0, 0, z + pd/2)));
      // Blocks
      [blockW/2, pw/2, pw - blockW/2].forEach(x => {
        [blockD/2, pd/2, pd - blockD/2].forEach(z => group.add(createBoard(blockW, blockH, blockD, x - blockW/2, boardH, z - blockD/2, woodMatDark)));
      });
      // Stringers
      [blockW/2, pw/2, pw - blockW/2].forEach(x => {
        group.add(createBoard(blockW, boardH, pd, x - blockW/2, boardH + blockH, 0));
      });
      // Top boards
      const topBoardZCoords = [boardH/2, boardH*1.5 + 40, pd/2, pd - boardH*1.5 - 40, pd - boardH/2];
      topBoardZCoords.forEach(z => group.add(createBoard(pw, boardH, 100, 0, ph - boardH, z)));
      
      return group;
    };

    dragControlsRef.current.draggable = [];

    // Render Pallets and Metrics
    palletResults.forEach((palletGroup, pIdx) => {
      const offsetX = pIdx * (pallet.w + 400); 
      scene.add(createPalletMesh(offsetX));

      // Metrics Sprite
      const textLines = [
        `PALET ${palletGroup.palletIndex}`,
        `AĞIRLIK: ${palletGroup.palletWeight} KG`,
        `DOLULUK: %${palletGroup.volumeUtilization}`
      ];
      const textSprite = createTextSprite(textLines, pallet.w);
      textSprite.userData.palletIdx = palletGroup.palletIndex;
      const { x, y, z } = palletGroup.metricPosition;
      textSprite.position.set(offsetX + x, y + 200, z);
      textSprite.userData.isDynamic = true;
      scene.add(textSprite);
      textSprite.traverse(child => {
        if (child.userData.isInteractiveMetric) {
          child.userData.palletIdx = palletGroup.palletIndex;
          dragControlsRef.current.draggable.push(child);
        }
      });
    });
  }, [pallet.w, pallet.d, pallet.h, palletResults, textures]);

  return (
    <div className="w-full h-full relative" ref={mountRef}>
      <AnimatePresence>
        {isOptimizing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-white/40 backdrop-blur-md z-50 flex items-center justify-center"
          >
            <div className="bg-white p-10 rounded-3xl shadow-2xl flex flex-col items-center border border-slate-100">
              <div className="w-12 h-12 border-4 border-cyan-600 border-t-transparent rounded-full animate-spin mb-6"></div>
              <span className="text-slate-900 font-bold text-xl tracking-tight uppercase">Algoritma Çalışıyor</span>
              <span className="text-sm text-slate-400 font-bold mt-2 uppercase tracking-widest">En İyi Konumlandırma Hesaplanıyor</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Main App Component ---

export default function App() {
  const [pallet, setPallet] = useState({ w: 1200, h: 1500, d: 800 });
  const [maxPalletWeight, setMaxPalletWeight] = useState(1200);
  const [allowRotation, setAllowRotation] = useState(true);
  const [boxes, setBoxes] = useState<BoxType[]>([
    { id: 1, w: 400, h: 300, d: 300, qty: 15, weight: 8.5, color: '#f59e0b' },
    { id: 2, w: 300, h: 200, d: 200, qty: 25, weight: 4.2, color: '#3b82f6' },
  ]);
  
  const [palletResults, setPalletResults] = useState<PalletResult[]>([]);
  const [metrics, setMetrics] = useState({ used: 0, total: 0, totalWeight: "0", palletCount: 0, volumeUtilization: "0" });
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [boxOpacity, setBoxOpacity] = useState(1.0);

  // Simulation State
  const [isSimulating, setIsSimulating] = useState(false);
  const [simIndex, setSimIndex] = useState(0);
  const [simSpeed, setSimSpeed] = useState(200); // ms per box
  const [simReset, setSimReset] = useState(0); // increment to force scene clear

  const allOrderedPlacements = useMemo(() => {
    const list: any[] = [];
    palletResults.forEach((pGroup, pIdx) => {
      pGroup.placements.forEach(p => {
        list.push({ 
          ...p, 
          palletIndex: pGroup.palletIndex, 
          offsetX: pIdx * (pallet.w + 400) 
        });
      });
    });
    return list;
  }, [palletResults, pallet.w]);

  const totalPlacements = allOrderedPlacements.length;

  useEffect(() => {
    let interval: any;
    if (isSimulating && simIndex < totalPlacements) {
      interval = setInterval(() => {
        setSimIndex(prev => {
          if (prev >= totalPlacements) {
            setIsSimulating(false);
            return prev;
          }
          return prev + 1;
        });
      }, simSpeed);
    } else if (simIndex >= totalPlacements) {
      setIsSimulating(false);
    }
    return () => clearInterval(interval);
  }, [isSimulating, simIndex, totalPlacements, simSpeed]);

  const addBox = () => {
    const colors = ['#ec4899', '#8b5cf6', '#10b981', '#f43f5e', '#6366f1'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const newId = boxes.length > 0 ? Math.max(...boxes.map(b => b.id)) + 1 : 1;
    setBoxes([...boxes, { id: newId, w: 300, h: 200, d: 200, qty: 10, weight: 5.0, color: randomColor }]);
  };
  
  const updateBox = (id: number, field: string, val: any) => {
    setBoxes(boxes.map(b => b.id === id ? { ...b, [field]: val } : b));
  };
  
  const removeBox = (id: number) => setBoxes(boxes.filter(b => b.id !== id));
  
  const runOptimization = useCallback(() => {
    setIsOptimizing(true);
    setSimIndex(0); // Reset simulation on new plan
    setIsSimulating(false);
    setTimeout(() => {
      const packer = new Packer(pallet.w, pallet.h, pallet.d, maxPalletWeight, allowRotation);
      let allItems: any[] = [];
      boxes.forEach(b => {
        for(let i = 0; i < b.qty; i++) allItems.push({ ...b, weight: b.weight });
      });
      const result = packer.solve(allItems);
      
      const newPallets = result.pallets.map((newP: any) => {
        const oldP = palletResults.find(p => p.palletIndex === newP.palletIndex);
        return {
          ...newP,
          metricPosition: oldP ? oldP.metricPosition : newP.metricPosition,
        };
      });
      
      setPalletResults(newPallets);
      setMetrics({
        used: result.count,
        total: result.total,
        totalWeight: result.totalWeight.toFixed(2),
        palletCount: result.pallets.length,
        volumeUtilization: result.volumeUtilization.toFixed(2)
      });
      setIsOptimizing(false);
      // Reset simulation then auto-start after a tick so allOrderedPlacements updates first
      setSimReset(r => r + 1);
      setSimIndex(0);
      setTimeout(() => setIsSimulating(true), 50);
    }, 400);
  }, [pallet, maxPalletWeight, boxes, allowRotation, palletResults]);

  useEffect(() => { runOptimization(); }, [pallet.w, pallet.h, pallet.d, maxPalletWeight, boxes, allowRotation]);

  const updatePalletMetric = useCallback((palletIdx: number, newPos: THREE.Vector3) => {
    setPalletResults(prev => prev.map(p => {
      if (p.palletIndex === palletIdx) {
        // Adjust position relative to its pallet offset
        const offsetX = (p.palletIndex - 1) * (pallet.w + 400);
        return { ...p, metricPosition: { x: newPos.x - offsetX, y: newPos.y, z: newPos.z } };
      }
      return p;
    }));
  }, [pallet.w]);

  const removePalletMetric = useCallback((palletIdx: number) => {
    setPalletResults(prev => prev.map(p => {
      if (p.palletIndex === palletIdx) {
        return { ...p, metricPosition: { x: -5000, y: -5000, z: -5000 } };
      }
      return p;
    }));
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900 font-sans selection:bg-cyan-100">
      {/* Sidebar */}
      <aside className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-xl z-20 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-4 mb-1">
            <div className="w-10 h-10 bg-cyan-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-cyan-100">
              <Box className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-none">AI Palletizer</h1>
              <p className="text-[10px] text-slate-500 font-semibold tracking-wider mt-1 uppercase">Pro Version</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scroll p-6 space-y-8 bg-white">
          <section>
            <div className="flex items-center gap-2 mb-5 text-slate-900 border-b pb-2 border-slate-100">
              <Settings className="w-4 h-4 text-cyan-600" />
              <h2 className="text-xs font-bold uppercase tracking-widest">Yapılandırma</h2>
            </div>
            
            <div className="grid grid-cols-3 gap-3">
              <InputField label="W (mm)" value={pallet.w} onChange={(e: any) => setPallet({...pallet, w: parseInt(e.target.value) || 0})} />
              <InputField label="D (mm)" value={pallet.d} onChange={(e: any) => setPallet({...pallet, d: parseInt(e.target.value) || 0})} />
              <InputField label="H (mm)" value={pallet.h} onChange={(e: any) => setPallet({...pallet, h: parseInt(e.target.value) || 0})} />
            </div>
            
            <InputField label="Kapasite (kg)" value={maxPalletWeight} step="0.1" onChange={(e: any) => setMaxPalletWeight(parseFloat(e.target.value) || 0)} />
            
            <div className="mt-4 flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl group transition-all hover:bg-slate-100 hover:border-slate-200">
              <label htmlFor="rot" className="flex items-center gap-3 text-[10px] font-bold text-slate-600 uppercase tracking-wider cursor-pointer select-none">
                <RotateCcw className="w-4 h-4 text-cyan-500" />
                Dönüşe İzin Ver
              </label>
              <button 
                id="rot"
                onClick={() => setAllowRotation(!allowRotation)}
                className={`relative w-10 h-6 flex items-center rounded-full transition-colors focus:outline-none ${allowRotation ? 'bg-cyan-600' : 'bg-slate-300'}`}
              >
                <motion.div 
                  initial={false}
                  animate={{ x: allowRotation ? 18 : 2 }}
                  className="w-5 h-5 bg-white rounded-full shadow-sm"
                />
              </button>
            </div>

            <div className="mt-6 p-4 bg-cyan-50 rounded-2xl border border-cyan-100">
              <label className="block text-[10px] font-bold text-cyan-800 uppercase tracking-widest mb-3">Kutu Opaklığı (%)</label>
              <input 
                type="range" 
                min="0.1" 
                max="1" 
                step="0.05" 
                value={boxOpacity} 
                onChange={(e) => setBoxOpacity(parseFloat(e.target.value))} 
                className="w-full h-1.5 bg-cyan-200 rounded-lg appearance-none cursor-pointer accent-cyan-600" 
              />
              <div className="flex justify-between mt-2 px-1">
                <span className="text-[10px] font-bold text-cyan-300">10%</span>
                <span className="text-[10px] font-bold text-cyan-600 tracking-widest">{Math.round(boxOpacity * 100)}%</span>
                <span className="text-[10px] font-bold text-cyan-300">100%</span>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-5 border-b pb-2 border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-600" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-900">Yük Listesi</h2>
              </div>
              <button 
                onClick={addBox} 
                className="flex items-center gap-1.5 p-2 bg-slate-50 text-slate-600 hover:bg-cyan-600 hover:text-white rounded-xl transition-all shadow-sm border border-slate-100"
                title="Yeni SKU Ekle"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            
            <AnimatePresence mode="popLayout">
              {boxes.map(box => (
                <BoxRow key={box.id} box={box} onDelete={() => removeBox(box.id)} onChange={updateBox} />
              ))}
            </AnimatePresence>
          </section>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-200">
          <button 
            onClick={runOptimization} 
            disabled={isOptimizing} 
            className="w-full group relative flex items-center justify-center gap-3 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-300 text-white py-4 rounded-2xl font-bold text-sm tracking-tight shadow-lg shadow-cyan-100 active:scale-[0.98] transition-all"
          >
            <Play className={`w-4 h-4 ${isOptimizing ? 'animate-pulse' : ''}`} />
            {isOptimizing ? 'Hesaplanıyor' : 'Planı Yenile'}
            <ChevronRight className="w-4 h-4 absolute right-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
          </button>
        </div>
      </aside>


      {/* Main Viewer Area */}
      <main className="flex-1 relative bg-slate-50 overflow-hidden">
        {/* Statistics HUD */}
        <div className="absolute top-8 left-8 z-10 flex flex-col gap-6 pointer-events-none">
          <motion.div 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-sm border border-slate-200 w-80"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse" />
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sistem Raporu</h3>
              </div>
              <button 
                onClick={() => (window as any).fitCamera()}
                className="pointer-events-auto p-2 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-cyan-600 rounded-xl transition-all border border-slate-100"
                title="Görünümü Sığdır"
              >
                <Maximize className="w-3.5 h-3.5" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="flex justify-between items-end border-b border-slate-100 pb-4">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block">Hacim Kullanım</span>
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-cyan-500" />
                    <span className="text-3xl font-bold text-slate-900 leading-none">{metrics.volumeUtilization}%</span>
                  </div>
                </div>
                <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500 transition-all duration-1000 ease-out" style={{ width: `${metrics.volumeUtilization}%` }} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block mb-1">Paletler</span>
                  <span className="text-xl font-bold text-slate-900">{metrics.palletCount}</span>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block mb-1">Toplam Ağırlık</span>
                  <span className="text-xl font-bold text-slate-900 leading-none">{metrics.totalWeight}<span className="text-[10px] ml-1 text-slate-400 font-bold uppercase">kg</span></span>
                </div>
              </div>

              <div className="pt-2">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block">Planlanan Ürün</span>
                  <span className="text-[10px] font-bold text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-full">{Math.round((metrics.used / metrics.total) * 100 || 0)}%</span>
                </div>
                <div className="flex justify-between items-center text-sm font-bold">
                  <span className="text-cyan-600 text-lg">{metrics.used}</span>
                  <div className="flex-1 mx-3 h-0.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-600/20" style={{ width: `${(metrics.used / metrics.total) * 100 || 0}%` }} />
                  </div>
                  <span className="text-slate-400">{metrics.total}</span>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-slate-900 rounded-2xl px-5 py-3 shadow-lg flex items-center gap-4 border border-slate-800"
          >
            <div className="p-1.5 bg-cyan-500 rounded-lg">
              <Move className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Kontrol İpucu</p>
              <p className="text-[11px] font-semibold text-white">Metrik kartlarını sahnede sürükleyin</p>
            </div>
          </motion.div>
        </div>

        {/* Legend */}
        <div className="absolute bottom-8 left-8 z-10 flex flex-wrap gap-3 pointer-events-none w-2/3">
          {boxes.map(b => (
            <div key={b.id} className="flex items-center gap-3 bg-white/90 backdrop-blur px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-3 h-3 rounded-md shadow-sm" style={{ backgroundColor: b.color }} />
              <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">SKU-{b.id}</span>
            </div>
          ))}
        </div>


        {/* Simulation Control HUD */}
        <div className="absolute bottom-8 right-8 left-80 z-10 pointer-events-none flex flex-col items-center gap-4">
          <AnimatePresence>
            {simIndex >= 0 && simIndex < allOrderedPlacements.length && isSimulating && (
              <motion.div 
                key="sim-status-indicator"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 10, opacity: 0 }}
                className="bg-cyan-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 mb-2"
              >
                <div className="w-2 h-2 rounded-full bg-white animate-ping" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Simülasyon Aktif</span>
              </motion.div>
            )}
            {simIndex > 0 && simIndex <= allOrderedPlacements.length && (
              <motion.div 
                key={`placement-info-card-${simIndex}`}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 10, opacity: 0 }}
                className="bg-slate-900 text-white p-4 rounded-2xl shadow-xl border border-slate-700 flex items-center gap-4 w-fit pointer-events-auto"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg border border-white/10" style={{ backgroundColor: allOrderedPlacements[simIndex-1]?.color || '#ccc' }}>
                  <Box className="w-5 h-5 text-white" />
                </div>
                <div className="pr-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest leading-none">Yerleştiriliyor</span>
                    <span className="w-1 h-1 rounded-full bg-cyan-400" />
                  </div>
                  <p className="text-sm font-bold text-white tracking-tight">
                    SKU-{allOrderedPlacements[simIndex-1]?.id} • Palet {allOrderedPlacements[simIndex-1]?.palletIndex}
                  </p>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">
                    {allOrderedPlacements[simIndex-1]?.w}x{allOrderedPlacements[simIndex-1]?.d}x{allOrderedPlacements[simIndex-1]?.h}mm • {allOrderedPlacements[simIndex-1]?.weight}kg
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-white/90 backdrop-blur-xl p-4 rounded-3xl shadow-2xl border border-slate-200 flex items-center gap-6 pointer-events-auto"
          >
            <div className="flex items-center gap-2 pr-6 border-r border-slate-100">
              <button 
                onClick={() => { setSimIndex(0); setIsSimulating(false); }}
                className="p-2 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-xl transition-all"
                title="Sıfırla"
              >
                <SkipBack className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setIsSimulating(!isSimulating)}
                className={`w-12 h-12 flex items-center justify-center rounded-2xl shadow-lg transition-all ${isSimulating ? 'bg-amber-100 text-amber-600 shadow-amber-100' : 'bg-cyan-600 text-white shadow-cyan-100'}`}
              >
                {isSimulating ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
              </button>
              <button 
                onClick={() => setSimIndex(prev => Math.min(totalPlacements, prev + 1))}
                className="p-2 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-xl transition-all"
                title="Sonraki Adım"
              >
                <SkipForward className="w-5 h-5" />
              </button>
            </div>

            <div className="min-w-[200px] space-y-2">
              <div className="flex justify-between items-center px-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">SİMÜLASYON İLERLEMESİ</span>
                <span className="text-xs font-black text-cyan-600">{simIndex} / {totalPlacements}</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden cursor-pointer group relative">
                <div 
                  className="h-full bg-cyan-500 transition-all duration-300 relative" 
                  style={{ width: `${(simIndex / totalPlacements) * 100}%` }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-cyan-500 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 pl-6 border-l border-slate-100">
              <div className="flex flex-col">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">HIZ</span>
                <select 
                  value={simSpeed} 
                  onChange={(e) => setSimSpeed(parseInt(e.target.value))}
                  className="bg-transparent text-xs font-black text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value={1000}>0.5x</option>
                  <option value={500}>1.0x</option>
                  <option value={200}>2.5x</option>
                  <option value={50}>5.0x</option>
                </select>
              </div>
              <Zap className={`w-5 h-5 ${isSimulating ? 'text-amber-500 animate-pulse' : 'text-slate-200'}`} />
            </div>
          </motion.div>
        </div>

        <Viewer3D
          pallet={pallet}
          palletResults={palletResults}
          isOptimizing={isOptimizing}
          boxOpacity={boxOpacity}
          updatePalletMetric={updatePalletMetric}
          removePalletMetric={removePalletMetric}
          simIndex={simIndex}
          simReset={simReset}
          allPlacementsOrdered={allOrderedPlacements}
        />
      </main>
    </div>
  );
}

