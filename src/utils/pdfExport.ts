import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Asset } from '../types';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

export const formatCurrencyBR = (val: number) => {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
};

export const exportToPDF = (assets: Asset[], reportTitle: string) => {
  const doc = new jsPDF('l', 'mm', 'a4');
  
  // Header
  doc.setFontSize(20);
  doc.setTextColor(40, 42, 54); // Dark color
  doc.text('FIXEDASSET PRO', 14, 20);
  
  doc.setFontSize(12);
  doc.setTextColor(100);
  doc.text(reportTitle.toUpperCase(), 14, 30);
  doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 250, 30);

  const tableData = assets.map(asset => [
    asset.id,
    asset.name,
    asset.accountDescription,
    asset.companyName,
    asset.location,
    asset.status,
    formatCurrencyBR(asset.acquisitionValueBRL),
    formatCurrencyBR(asset.residualValueBRL)
  ]);

  doc.autoTable({
    startY: 40,
    head: [['ID', 'Nome', 'Conta', 'Empresa', 'Local', 'Status', 'Vl. Aquisição', 'Vl. Residual']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [56, 189, 248] }, // Primary color
    styles: { fontSize: 8, cellPadding: 2 },
    alternateRowStyles: { fillColor: [248, 250, 252] }
  });

  const fileName = `Relatorio_${reportTitle.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
};
