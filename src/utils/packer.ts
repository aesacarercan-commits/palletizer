/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Placement, PalletResult } from '../types';

interface PalletDimensions {
  w: number;
  h: number;
  d: number;
  maxWeightKg: number;
}

interface BoxToPack {
  w: number;
  h: number;
  d: number;
  weight: number;
  color: string;
  id: number;
}

interface Orientation {
  w: number;
  d: number;
  h: number;
}

interface CandidatePlacement {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

interface PalletState {
  placements: any[];
  weight: number;
  max_y: number;
}

export class Packer {
  private pallet: PalletDimensions;
  private allowRotation: boolean;

  constructor(
    palletWidth: number,
    palletHeight: number,
    palletDepth: number,
    maxWeightKg: number,
    allowRotation: boolean
  ) {
    this.pallet = { w: palletWidth, h: palletHeight, d: palletDepth, maxWeightKg };
    this.allowRotation = allowRotation;
  }

  intersect(b1: CandidatePlacement, b2: CandidatePlacement): boolean {
    return (
      b1.x < b2.x + b2.w && b1.x + b1.w > b2.x &&
      b1.y < b2.y + b2.h && b1.y + b1.h > b2.y &&
      b1.z < b2.z + b2.d && b1.z + b1.d > b2.z
    );
  }

  getOrientations(box: BoxToPack): Orientation[] {
    const orientations: Orientation[] = [{ w: box.w, d: box.d, h: box.h }];
    if (this.allowRotation && box.w !== box.d) {
      orientations.push({ w: box.d, d: box.w, h: box.h });
    }
    return orientations;
  }

  solve(boxesToPack: BoxToPack[]): {
    pallets: PalletResult[];
    count: number;
    total: number;
    totalWeight: number;
    volumeUtilization: number;
  } {
    let queue = [...boxesToPack].sort((a, b) => (b.w * b.h * b.d) - (a.w * a.h * a.d));
    const pallets: PalletState[] = [{ placements: [], weight: 0, max_y: 0 }];

    for (const box of queue) {
      let placed = false;
      const orientations = this.getOrientations(box);

      for (let p = 0; p < pallets.length; p++) {
        const currentPallet = pallets[p];
        const potentialCoords = [{ x: 0, y: 0, z: 0 }];
        
        currentPallet.placements.forEach((placement) => {
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

        for (const coord of uniqueCoords) {
          if (placed) break;
          for (const rotation of orientations) {
            if (placed) break;
            const { w, h, d } = rotation;
            
            if (coord.x + w > this.pallet.w) continue;
            if (coord.y + h > this.pallet.h) continue;
            if (coord.z + d > this.pallet.d) continue;
            if (currentPallet.weight + box.weight > this.pallet.maxWeightKg) continue;

            const candidate: CandidatePlacement = { x: coord.x, y: coord.y, z: coord.z, w, h, d };
            
            let collides = false;
            for (const placement of currentPallet.placements) {
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
              for (const placement of currentPallet.placements) {
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
        const newPallet: PalletState = { placements: [], weight: 0, max_y: 0 };
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
      const palletBoxVolume = p.placements.reduce((vSum, b) => vSum + (b.w * b.h * b.d), 0);
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
      sum + p.placements.reduce((vSum, b) => vSum + (b.w * b.h * b.d), 0)
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
