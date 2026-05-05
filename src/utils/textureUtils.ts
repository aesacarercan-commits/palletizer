/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

export const createNoiseTexture = (colorHex: string, noiseAmount = 20): THREE.Texture => {
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

export const createTextSprite = (
  textLines: string[],
  maxWidth: number,
  color = '#0f172a',
  bgColor = 'rgba(255, 255, 255, 0.9)'
): THREE.Sprite => {
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

  ctx.fillStyle = bgColor;
  if (ctx.roundRect) {
    ctx.roundRect(0, 0, canvasWidth, canvasHeight, 20);
  } else {
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }
  ctx.fill();
  
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
