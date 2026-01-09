'use client';

import React, { useEffect, useRef } from 'react';
import * as fabric from 'fabric';

const InfiniteWhiteboard = () => {
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const canvasInstance = useRef<fabric.Canvas | null>(null);

  useEffect(() => {
    if (!canvasEl.current) return;

    // 1. Initialize Canvas
    // Added 'renderOnAddRemove: false' to prevent auto-rendering during the visibility loop
    const canvas = new fabric.Canvas(canvasEl.current, {
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: '#f3f3f3',
      selection: true,
      enableRetinaScaling: true,
      renderOnAddRemove: false, 
    });
    canvasInstance.current = canvas;
    canvas.requestRenderAll();
    // --- 2. THE CULLING FUNCTION (Virtual Rendering Logic) ---
    const updateVisibleObjects = () => {
      // Get all objects on the board
      const objects = canvas.getObjects();
      
      let requestRender = false;

      objects.forEach((obj) => {
        // Ask Fabric: "Is this object currently inside the screen view?"
        const isOnScreen = obj.isOnScreen();

        // Only update if the state has changed (Optimization)
        if (obj.visible !== isOnScreen) {
          obj.visible = isOnScreen;
          requestRender = true;
        }
      });

      // Only force a redraw if we actually hid or showed something
      if (requestRender) {
        canvas.requestRenderAll();
      }
    };

    // 3. Add Reference Shapes
    const centerMarker = new fabric.Circle({
        left: 0, top: 0, radius: 10, fill: 'red'
    });
    canvas.add(centerMarker);
    // Initial check (in case we start with many objects)
    updateVisibleObjects(); 


    // 4. Zoom & Pan Logic (Updated to call culling)
    canvas.on('mouse:wheel', function(opt) {
      const evt = opt.e as WheelEvent;
      
      // Zoom
      if (evt.ctrlKey || evt.metaKey) {
        let zoom = canvas.getZoom();
        zoom *= 0.999 ** evt.deltaY;
        if (zoom > 20) zoom = 20;
        if (zoom < 0.01) zoom = 0.01;
        canvas.zoomToPoint(new fabric.Point(evt.offsetX, evt.offsetY), zoom);
      } 
      // Pan
      else {
        const vpt = canvas.viewportTransform;
        if (!vpt) return;
        vpt[5] -= evt.deltaY;
        vpt[4] -= evt.deltaX;
      }
      
      // CALL CULLING: Update visibility immediately after moving camera
      updateVisibleObjects();
      
      // Because we set renderOnAddRemove: false, we need to request render manually here
      // if updateVisibleObjects didn't already trigger it.
      canvas.requestRenderAll(); 

      evt.preventDefault();
      evt.stopPropagation();
    });

    // 5. Resize Logic
    const handleResize = () => {
        canvas.setDimensions({
            width: window.innerWidth,
            height: window.innerHeight
        });
        updateVisibleObjects(); // Check visibility again on resize
    };
    window.addEventListener('resize', handleResize);

    return () => {
      canvas.dispose();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // --- NEW FUNCTIONS TO ADD SHAPES ---

  const addRectangle = () => {
    if (!canvasInstance.current) return;
    const rect = new fabric.Rect({
      width: 100, height: 60, fill: '#FF6B6B', rx: 5, ry: 5,
    });
    addToCanvas(rect);
  };

  const addSquare = () => {
    if (!canvasInstance.current) return;
    const square = new fabric.Rect({
      width: 80, height: 80, fill: '#4ECDC4',
    });
    addToCanvas(square);
  };

  const addCircle = () => {
    if (!canvasInstance.current) return;
    const circle = new fabric.Circle({
      radius: 40, fill: '#FFE66D',
    });
    addToCanvas(circle);
  };

  // Helper to add object and center it in view
  const addToCanvas = (object: fabric.Object) => {
    const canvas = canvasInstance.current;
    if (!canvas) return;

    canvas.add(object);
    canvas.centerObject(object);
    canvas.setActiveObject(object);
    
    // IMPORTANT: Even though we just added it, we force a render
    // because renderOnAddRemove is false.
    canvas.requestRenderAll();
  };

  return (
    <div className="w-screen h-screen overflow-hidden relative">
      <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 z-20 flex gap-4 bg-white p-3 rounded-lg shadow-xl border border-gray-200">
            <button onClick={addRectangle} className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition font-medium">Rectangle</button>
            <button onClick={addSquare} className="px-4 py-2 bg-teal-500 text-white rounded hover:bg-teal-600 transition font-medium">Square</button>
            <button onClick={addCircle} className="px-4 py-2 bg-yellow-400 text-black rounded hover:bg-yellow-500 transition font-medium">Circle</button>
      </div>
      <canvas ref={canvasEl} className="block" />
    </div>
  );
};

export default InfiniteWhiteboard;