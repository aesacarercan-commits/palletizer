/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { BoxType } from '../types';

interface InputFieldProps {
  label: string;
  value: number | string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  step?: string;
}

export const InputField: React.FC<InputFieldProps> = ({ 
  label, 
  value, 
  onChange, 
  type = "number", 
  step = "1" 
}) => (
  <div className="mb-3">
    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-1">
      {label}
    </label>
    <div className="relative">
      <input 
        type={type} 
        step={step} 
        value={value} 
        onChange={onChange} 
        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all hover:bg-white hover:border-slate-300" 
      />
    </div>
  </div>
);

interface BoxRowProps {
  box: BoxType;
  onDelete: () => void;
  onChange: (id: number, field: string, val: number) => void;
}

export const BoxRow: React.FC<BoxRowProps> = ({ box, onDelete, onChange }) => (
  <motion.div 
    layout
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, scale: 0.95 }}
    className="flex flex-col p-4 mb-4 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all group"
  >
    <div className="flex justify-between items-center mb-4">
      <div className="flex items-center gap-3">
        <div 
          className="w-8 h-8 rounded-xl shadow-lg border border-slate-100 flex items-center justify-center p-1" 
          style={{ backgroundColor: box.color }}
        >
          <svg className="w-4 h-4 text-white opacity-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
            <line x1="12" y1="22.08" x2="12" y2="12"/>
          </svg>
        </div>
        <div>
          <span className="font-bold text-slate-900 text-sm tracking-tight block">SKU-{box.id}</span>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Ürün Kartı</span>
        </div>
      </div>
      <button 
        onClick={onDelete} 
        className="text-slate-300 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-xl transition-all"
        aria-label="Delete box"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
    <div className="grid grid-cols-3 gap-3 mb-4">
      <div className="space-y-1">
        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest pl-1">Genişlik</span>
        <input 
          type="number" 
          value={box.w} 
          onChange={(e) => onChange(box.id, 'w', parseInt(e.target.value) || 0)} 
          className="w-full border border-slate-100 bg-slate-50 rounded-xl px-2 py-2 text-xs text-center font-bold focus:bg-white focus:ring-2 focus:ring-indigo-500/10 focus:outline-none transition-all" 
        />
      </div>
      <div className="space-y-1">
        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest pl-1">Derinlik</span>
        <input 
          type="number" 
          value={box.d} 
          onChange={(e) => onChange(box.id, 'd', parseInt(e.target.value) || 0)} 
          className="w-full border border-slate-100 bg-slate-50 rounded-xl px-2 py-2 text-xs text-center font-bold focus:bg-white focus:ring-2 focus:ring-indigo-500/10 focus:outline-none transition-all" 
        />
      </div>
      <div className="space-y-1">
        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest pl-1">Yükseklik</span>
        <input 
          type="number" 
          value={box.h} 
          onChange={(e) => onChange(box.id, 'h', parseInt(e.target.value) || 0)} 
          className="w-full border border-slate-100 bg-slate-50 rounded-xl px-2 py-2 text-xs text-center font-bold focus:bg-white focus:ring-2 focus:ring-indigo-500/10 focus:outline-none transition-all" 
        />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-widest pl-1">Ağırlık (kg)</span>
        <input 
          type="number" 
          step="0.1" 
          value={box.weight} 
          onChange={(e) => onChange(box.id, 'weight', parseFloat(e.target.value) || 0)} 
          className="w-full border border-indigo-100 bg-indigo-50 text-indigo-700 rounded-xl px-2 py-2 text-xs text-center font-black focus:ring-2 focus:ring-indigo-500/10 focus:outline-none transition-all" 
        />
      </div>
      <div className="space-y-1">
        <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest pl-1">Adet</span>
        <input 
          type="number" 
          value={box.qty} 
          onChange={(e) => onChange(box.id, 'qty', parseInt(e.target.value) || 0)} 
          className="w-full border border-emerald-100 bg-emerald-50 text-emerald-700 rounded-xl px-2 py-2 text-xs text-center font-black focus:ring-2 focus:ring-emerald-500/10 focus:outline-none transition-all" 
        />
      </div>
    </div>
  </motion.div>
);
