/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface BoxType {
  id: number;
  w: number;
  h: number;
  d: number;
  qty: number;
  weight: number;
  color: string;
}

export interface Placement {
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

export interface PalletResult {
  placements: Placement[];
  weight: number;
  max_y: number;
  palletIndex: number;
  volumeUtilization: string;
  palletWeight: string;
  metricPosition: { x: number; y: number; z: number };
}

export interface PalletConfig {
  w: number;
  h: number;
  d: number;
  maxWeightKg: number;
}

export interface MetricsState {
  used: number;
  total: number;
  totalWeight: string;
  palletCount: number;
  volumeUtilization: string;
}
