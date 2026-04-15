# Rays

**Acoustic Raytracing Engine**

Rays is a lightweight, high-performance acoustic simulation engine designed for rapid space analysis and acoustic modeling directly in the browser.

## Core Features

- **Raytracing Engine:** Efficient stochastic raytracing via GPU-accelerated Web Workers.
- **Spectrum Analysis:** Support for both 1/1 and 1/3 octave band analysis.
- **Data Visualization:** Interactive 3D volumetric heatmaps and detailed energy-time curves (ETC).
- **Auralization:** Real-time convolution reverb processing for listening tests.
- **Office Metrics:** Automatic calculation of speech transmission and decay characteristics for open-plan environments.
- **Persistent Storage:** Project data, simulation results, and custom settings survive browser refreshes.

## Getting Started

### Local Development

1. Clone the repository: `git clone https://github.com/BeamAudio/Rays.git`
2. Install dependencies: `npm install`
3. Run the development environment: `npm run dev`

### Project Workflow
1. **Scene Builder:** Use the integrated Room Wizard or import CAD meshes (GLTF/GLB) to define your space.
2. **Setup:** Place acoustic sources and receivers within the viewport.
3. **Materials:** Assign frequency-dependent absorption and diffusion properties to surfaces.
4. **Compute:** Run the raytracer to generate the acoustic response.
5. **Analyze:** Inspect results in the Analysis view, including heatmaps, decay plots, and frequency distribution data.
6. **Export:** Export raw results for external processing or download a summary report.

## Contributing

We encourage open contributions! If you have developed a custom speaker profile, please submit it to our marketplace. See [CONTRIBUTING.md](CONTRIBUTING.md) for submission details.

## License

MIT
