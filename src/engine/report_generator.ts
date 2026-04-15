import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { AcousticMetrics } from '../types';

export function generatePDFReport(metrics: AcousticMetrics, projectName: string) {
  const doc = new jsPDF();
  const date = new Date().toLocaleDateString();

  // Title
  doc.setFontSize(18);
  doc.text(`Acoustic Report: ${projectName}`, 14, 20);
  doc.setFontSize(12);
  doc.text(`Generated on: ${date}`, 14, 30);

  // Summary
  doc.setFontSize(14);
  doc.text('Key Performance Indicators', 14, 45);

  const tableData = [
    ['Band (Hz)', 'T30 (s)', 'C80 (dB)', 'D50 (-)', 'SPL (dB)'],
    ['63', metrics.t30[0]?.toFixed(2), metrics.c80[0]?.toFixed(1), metrics.d50[0]?.toFixed(2), metrics.spl[0]?.toFixed(1)],
    ['125', metrics.t30[1]?.toFixed(2), metrics.c80[1]?.toFixed(1), metrics.d50[1]?.toFixed(2), metrics.spl[1]?.toFixed(1)],
    ['250', metrics.t30[2]?.toFixed(2), metrics.c80[2]?.toFixed(1), metrics.d50[2]?.toFixed(2), metrics.spl[2]?.toFixed(1)],
    ['500', metrics.t30[3]?.toFixed(2), metrics.c80[3]?.toFixed(1), metrics.d50[3]?.toFixed(2), metrics.spl[3]?.toFixed(1)],
    ['1k', metrics.t30[4]?.toFixed(2), metrics.c80[4]?.toFixed(1), metrics.d50[4]?.toFixed(2), metrics.spl[4]?.toFixed(1)],
    ['2k', metrics.t30[5]?.toFixed(2), metrics.c80[5]?.toFixed(1), metrics.d50[5]?.toFixed(2), metrics.spl[5]?.toFixed(1)],
    ['4k', metrics.t30[6]?.toFixed(2), metrics.c80[6]?.toFixed(1), metrics.d50[6]?.toFixed(2), metrics.spl[6]?.toFixed(1)],
    ['8k', metrics.t30[7]?.toFixed(2), metrics.c80[7]?.toFixed(1), metrics.d50[7]?.toFixed(2), metrics.spl[7]?.toFixed(1)],
  ];

  autoTable(doc, {
    startY: 55,
    head: [tableData[0]],
    body: tableData.slice(1),
    theme: 'plain',
    headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    tableLineColor: [200, 200, 200],
    tableLineWidth: 0.1,
  });

  doc.save(`${projectName.replace(/\s+/g, '_')}_Acoustic_Report.pdf`);
}
