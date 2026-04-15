import React, { useMemo } from 'react';

interface DistanceDecayPlotProps {
  data: { distance: number; sti: number }[];
  rD: number;
  rP: number;
}

export const DistanceDecayPlot: React.FC<DistanceDecayPlotProps> = ({ data, rD, rP }) => {
  const chartRef = useMemo(() => {
    // Basic SVG plotting logic for STI vs Log(Distance)
    const padding = 40;
    const width = 400;
    const height = 200;
    
    const maxDist = Math.max(...data.map(d => d.distance), 10);
    const minLog = Math.log10(Math.max(...data.map(d => d.distance).filter(d => d > 0), 0.1));
    const maxLog = Math.log10(maxDist);
    
    const xScale = (d: number) => padding + ((Math.log10(d) - minLog) / (maxLog - minLog)) * (width - 2 * padding);
    const yScale = (sti: number) => height - padding - (sti * (height - 2 * padding));
    
    const pathData = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.distance)} ${yScale(d.sti)}`).join(' ');
    
    return { pathData, xScale, yScale, width, height, padding };
  }, [data]);

  return (
    <svg width={chartRef.width} height={chartRef.height} className="bg-gray-900 rounded">
      <path d={chartRef.pathData} fill="none" stroke="#FFFFFF" strokeWidth="2" />      {rD > 0 && <line x1={chartRef.xScale(rD)} y1={chartRef.padding} x2={chartRef.xScale(rD)} y2={chartRef.height - chartRef.padding} stroke="yellow" strokeDasharray="4" />}
      {rP > 0 && <line x1={chartRef.xScale(rP)} y1={chartRef.padding} x2={chartRef.xScale(rP)} y2={chartRef.height - chartRef.padding} stroke="red" strokeDasharray="4" />}
      <text x={chartRef.width/2} y={chartRef.height-10} fill="white" fontSize="10" textAnchor="middle">Log Distance (m)</text>
      <text x={10} y={chartRef.height/2} fill="white" fontSize="10" transform="rotate(-90 10 100)">STI</text>
    </svg>
  );
};
