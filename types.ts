// src/types.ts

import { Tool } from '@/app/page';

// 1. Define the "State" of our styling
export interface ShapeOptions {
  stroke: string;
  strokeWidth: number;
  fill: string;
  opacity: number;
  fontFamily: string;
  fontSize: number;
}

// 2. Define sensible defaults
export const defaultOptions: ShapeOptions = {
  stroke: '#000000',
  strokeWidth: 2,
  fill: 'transparent', 
  opacity: 1,
  fontFamily: 'Arial',
  fontSize: 24,
};

// 3. Helper to determine which sections to show in the UI
// This keeps the logic out of the view component
export const getVisibleProperties = (tool: Tool) => {
  switch (tool) {
    case 'selection': 
      // When selecting, we show everything (we'll filter by selected object type later)
      return { hasStroke: true, hasFill: true, hasText: true };
    case 'text':
      return { hasStroke: false, hasFill: true, hasText: true }; // Text "Fill" is the font color
    case 'line':
    case 'arrow':
    case 'pencil':
      return { hasStroke: true, hasFill: false, hasText: false };
    case 'rectangle':
    default:
      return { hasStroke: true, hasFill: true, hasText: false };
  }
};