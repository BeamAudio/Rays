# Beam Audio Rays

**Consultancy-Grade Acoustic Simulation Engine**

Rays is a modern, high-performance acoustic raytracing and room simulation tool built for acoustic consultants and electro-acoustic engineers. It provides interactive, browser-based 3D modeling and computes standard ISO 3382 metrics, energy heatmaps, and Speech Transmission Index (STI) using stochastic raytracing algorithms.

## Features

- **Geometric Acoustics:** Fast stochastic raytracing engine with parallelized Web Workers.
- **Consultancy Standards:** Full support for 1/1 and 1/3 octave bands, A-weighted broadband summations, and standard metrics (T30, C80, D50, STI).
- **Material Library:** Assign frequency-dependent absorption, scattering, and transmission to any surface.
- **Directivity Models:** Import and utilize complex speaker directivity patterns (Omni, Cardioid, Horns).
- **Auralization:** Real-time convolution reverb of impulse responses against dry anechoic samples.
- **Persistent Workspace:** Entire project states and simulation results are seamlessly stored locally via `zustand/persist`, ensuring your data survives page reloads even on static hosts like GitHub Pages.
- **Analysis Overlays:** Volumetric room mode estimation (now based on arbitrary scene bounds), energy heatmaps, and individual reflection visualization.

## Getting Started

Visit the live deployment or run locally:

```bash
npm install
npm run dev
```

### Quick Workflow
1. **Workspace Mode:** Construct a basic shoebox room using the "Room Wizard" in the left panel, or import an existing `.gltf` CAD file.
2. **Add Components:** Spawn acoustic sources and receivers into your scene. 
3. **Set Properties:** Select individual walls or speakers to edit their acoustic materials and directivity patterns via the right-side Inspector.
4. **Compute:** Hit "Compute" in the top bar. The application will trace up to 100,000 rays to determine the impulse response.
5. **Analysis Mode:** Once computed, switch to Analysis Mode to view detailed T30 decay curves, STI distributions, and A-weighted Heatmaps across your measurement planes.

## Development Stack

- React + TypeScript + Vite
- Zustand (State Management + LocalStorage Persistence)
- Three.js / React Three Fiber (3D Visualization)
- Lucide React (Icons)
- League Spartan (Typography)

## License

MIT
