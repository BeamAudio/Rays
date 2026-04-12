export interface RoomMode {
  nx: number;
  ny: number;
  nz: number;
  frequency: number;
  type: 'Axial' | 'Tangential' | 'Oblique';
}

export function calculateRoomModes(dims: { L: number, H: number, W: number }, maxFreq: number = 200): RoomMode[] {
  const modes: RoomMode[] = [];
  const c = 343; // Speed of sound

  // Iterate through mode indices
  for (let nx = 0; nx <= 10; nx++) {
    for (let ny = 0; ny <= 10; ny++) {
      for (let nz = 0; nz <= 10; nz++) {
        if (nx === 0 && ny === 0 && nz === 0) continue;

        // f = (c/2) * sqrt((nx/L)^2 + (ny/H)^2 + (nz/W)^2)
        const freq = (c / 2) * Math.sqrt(
          Math.pow(nx / dims.L, 2) + 
          Math.pow(ny / dims.H, 2) + 
          Math.pow(nz / dims.W, 2)
        );

        if (freq <= maxFreq) {
          let type: 'Axial' | 'Tangential' | 'Oblique' = 'Oblique';
          const zeros = [nx, ny, nz].filter(v => v === 0).length;
          if (zeros === 2) type = 'Axial';
          else if (zeros === 1) type = 'Tangential';

          modes.push({ nx, ny, nz, frequency: freq, type });
        }
      }
    }
  }

  return modes.sort((a, b) => a.frequency - b.frequency);
}
