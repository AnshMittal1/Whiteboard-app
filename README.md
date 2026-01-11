# 🎨 Virtual Whiteboard

A high-performance, interactive whiteboard application built with **Next.js 14**, **TypeScript**, and **Fabric.js**. This tool enables users to sketch, create diagrams, and organize ideas on an infinite canvas with a focus on smooth UX and modern design patterns.

![Project Status](https://img.shields.io/badge/Status-In_Development-blue)

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Project Architecture](#-project-architecture)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)

## ✨ Features (Current)

The application currently supports **Core Canvas Mechanics**, **Drawing Tools**, and **Object Manipulation** (Phase 1.1 - 1.4).

### 🖌️ Drawing & Tools
- **Infinite Canvas:** Pan and zoom capabilities with an auto-rendering grid system.
- **Shape Tools:** Draw Rectangles, Lines, and Arrows with smart control handles.
- **Freehand Drawing:** Smooth pencil tool for sketching.
- **Text Support:** Add and edit text directly on the canvas.
- **Smart Eraser:** High-performance eraser using spatial indexing (RBush) to detect and remove objects in the eraser path.

### ⚙️ Manipulation & Styling
- **Object Properties:** Real-time customization of:
  - Stroke color and width
  - Fill color (solid and transparent support)
  - Opacity
  - Font family and size
- **Transformation:** Move, resize, and rotate objects via interactive handles.
- **Clipboard:** Copy (`Ctrl+C`) and Paste (`Ctrl+V`) support.

### ↩️ History Management
- **Undo/Redo:** Robust history stack allowing users to revert and redo actions (`Ctrl+Z` / `Ctrl+Y`).
- **State Persistence:** Captures object additions, removals, and modifications.

## 🛠 Tech Stack

- **Framework:** [Next.js 14](https://nextjs.org/) (App Router)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Canvas Engine:** [Fabric.js](http://fabricjs.com/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Icons:** [Lucide React](https://lucide.dev/)
- **Spatial Indexing:** [RBush](https://github.com/mourner/rbush) (for efficient collision detection)
- **UI Components:** Custom components for Toolbar and Properties Panel.

## 🚀 Getting Started

Follow these steps to run the project locally.

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Installation

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/yourusername/whiteboard-app.git](https://github.com/yourusername/whiteboard-app.git)
   cd whiteboard-app