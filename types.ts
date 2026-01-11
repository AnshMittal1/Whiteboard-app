// src/types.ts

import { Tool } from '@/app/page';

export interface ShapeOptions {
  stroke: string;
  strokeWidth: number;
  fill: string;
  opacity: number;
  fontFamily: string;
  fontSize: number;
}

export const defaultOptions: ShapeOptions = {
  stroke: '#000000',
  strokeWidth: 2,
  fill: 'transparent', 
  opacity: 1,
  fontFamily: 'Arial',
  fontSize: 24,
};


export const getVisibleProperties = (tool: Tool) => {
  switch (tool) {
    case 'selection': 
      
      return { hasStroke: true, hasFill: true, hasText: true };
    case 'text':
      return { hasStroke: false, hasFill: true, hasText: true }; 
    case 'line':
    case 'arrow':
    case 'pencil':
      return { hasStroke: true, hasFill: false, hasText: false };
    case 'rectangle':
    default:
      return { hasStroke: true, hasFill: true, hasText: false };
  }
};