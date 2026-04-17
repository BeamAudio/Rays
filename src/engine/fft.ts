export interface Complex {
    re: number;
    im: number;
}

export function fft(real: Float64Array, imag: Float64Array): void {
    const n = real.length;
    let log2n = 0;
    while ((1 << log2n) < n) log2n++;

    // Bit reversal permutation
    for (let i = 0; i < n; i++) {
        let j = 0;
        for (let k = 0; k < log2n; k++) {
            j |= ((i >> k) & 1) << (log2n - 1 - k);
        }
        if (j > i) {
            let tempR = real[i];
            let tempI = imag[i];
            real[i] = real[j];
            imag[i] = imag[j];
            real[j] = tempR;
            imag[j] = tempI;
        }
    }

    // Cooley-Tukey decimation-in-time radix-2 FFT
    for (let size = 2; size <= n; size *= 2) {
        const halfSize = size / 2;
        const phaseShiftStepR = Math.cos(-2 * Math.PI / size);
        const phaseShiftStepI = Math.sin(-2 * Math.PI / size);

        for (let i = 0; i < n; i += size) {
            let currentPhaseShiftR = 1;
            let currentPhaseShiftI = 0;

            for (let j = 0; j < halfSize; j++) {
                const k = i + j;
                const m = i + j + halfSize;
                
                const factorR = currentPhaseShiftR * real[m] - currentPhaseShiftI * imag[m];
                const factorI = currentPhaseShiftR * imag[m] + currentPhaseShiftI * real[m];
                
                real[m] = real[k] - factorR;
                imag[m] = imag[k] - factorI;
                
                real[k] += factorR;
                imag[k] += factorI;
                
                // Update phase
                const tempR = currentPhaseShiftR * phaseShiftStepR - currentPhaseShiftI * phaseShiftStepI;
                const tempI = currentPhaseShiftR * phaseShiftStepI + currentPhaseShiftI * phaseShiftStepR;
                currentPhaseShiftR = tempR;
                currentPhaseShiftI = tempI;
            }
        }
    }
}
