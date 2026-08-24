import ExcelJS from 'exceljs';

import type { MarketplaceCommissionStatementDetail } from '../operations.ts';
import { sanitizeSpreadsheetText } from './validation.ts';

const MAX_STATEMENT_ENTRIES = 5_000;

function minor(value: string | number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error('invalid_commission_money');
  return parsed;
}

function egp(value: string | number): number {
  return minor(value) / 100;
}

function rate(value: string | number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) throw new Error('invalid_commission_rate');
  return parsed;
}

function text(value: unknown): string {
  return sanitizeSpreadsheetText(value);
}

function csvCell(value: string | number | null): string {
  const safe = typeof value === 'string' ? text(value) : value == null ? '' : String(value);
  return `"${safe.replaceAll('"', '""')}"`;
}

function assertStatement(statement: MarketplaceCommissionStatementDetail): void {
  if (statement.entries.length > MAX_STATEMENT_ENTRIES) throw new Error('commission_entry_limit');
  for (const entry of statement.entries) {
    minor(entry.gross_piastres);
    minor(entry.commission_piastres);
  }
  minor(statement.gross_piastres);
  minor(statement.commission_piastres);
  minor(statement.manual_adjustment_piastres);
  minor(statement.total_due_piastres);
  rate(statement.commission_rate);
}

export async function createCommissionStatementWorkbook(
  statement: MarketplaceCommissionStatementDetail,
): Promise<Buffer> {
  assertStatement(statement);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'DAIRTAK';
  workbook.subject = 'Marketplace commission statement';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = false;

  const summary = workbook.addWorksheet('Statement', {
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      paperSize: 9, margins: { left: 0.35, right: 0.35, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });
  const entries = workbook.addWorksheet('Entries', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    pageSetup: {
      orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      paperSize: 9, margins: { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
    },
  });
  entries.pageSetup.printTitlesRow = '1:1';

  summary.mergeCells('A1:D1');
  summary.getCell('A1').value = 'DAIRTAK · Commission Statement';
  summary.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 16 };
  summary.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF18181B' } };
  summary.getCell('A1').alignment = { vertical: 'middle' };
  summary.getRow(1).height = 34;
  summary.addRows([
    ['Statement ID', text(statement.id), 'Status', text(statement.status)],
    ['Store ID', text(statement.store_id), 'Period', `${text(statement.period_start)} — ${text(statement.period_end)}`],
    ['Issued at', statement.issued_at ? new Date(statement.issued_at) : null, 'Paid at', statement.paid_at ? new Date(statement.paid_at) : null],
    [],
    ['Gross merchandise value (EGP)', egp(statement.gross_piastres)],
    ['Commission rate', rate(statement.commission_rate)],
    ['Commission due (EGP)', egp(statement.commission_piastres)],
    ['Manual adjustment (EGP)', egp(statement.manual_adjustment_piastres)],
    ['Total due (EGP)', egp(statement.total_due_piastres)],
    [],
    ['Notes', text(statement.notes ?? '')],
  ]);
  summary.getColumn(1).width = 34;
  summary.getColumn(2).width = 28;
  summary.getColumn(3).width = 18;
  summary.getColumn(4).width = 34;
  for (let row = 2; row <= 12; row += 1) {
    summary.getCell(row, 1).font = { bold: true, color: { argb: 'FF3F3F46' } };
  }
  for (let row = 2; row <= 4; row += 1) {
    summary.getCell(row, 3).font = { bold: true, color: { argb: 'FF3F3F46' } };
  }
  for (let row = 6; row <= 10; row += 1) {
    for (let column = 1; column <= 2; column += 1) {
      summary.getCell(row, column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F4F5' } };
    }
    summary.getCell(row, 2).numFmt = '#,##0.00;[Red](#,##0.00);-';
  }
  summary.getCell('B7').numFmt = '0.00%';
  for (let row = 2; row <= 12; row += 1) {
    for (let column = 2; column <= 4; column += 1) {
      summary.getCell(row, column).alignment = { vertical: 'top', wrapText: true };
    }
  }
  summary.getCell('B4').numFmt = 'yyyy-mm-dd hh:mm';
  summary.getCell('D4').numFmt = 'yyyy-mm-dd hh:mm';
  summary.getRow(12).height = 42;

  entries.addRow(['Recognized at', 'Entry type', 'Order ID', 'Gross (EGP)', 'Commission (EGP)']);
  for (const entry of statement.entries) {
    entries.addRow([
      new Date(entry.recognized_at),
      text(entry.entry_type),
      text(entry.order_id ?? ''),
      egp(entry.gross_piastres),
      egp(entry.commission_piastres),
    ]);
  }
  const header = entries.getRow(1);
  header.height = 28;
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF18181B' } };
  entries.autoFilter = { from: 'A1', to: 'E1' };
  [22, 18, 40, 18, 20].forEach((width, index) => { entries.getColumn(index + 1).width = width; });
  entries.getColumn(1).numFmt = 'yyyy-mm-dd hh:mm';
  entries.getColumn(2).numFmt = '@';
  entries.getColumn(3).numFmt = '@';
  entries.getColumn(4).numFmt = '#,##0.00;[Red](#,##0.00);-';
  entries.getColumn(5).numFmt = '#,##0.00;[Red](#,##0.00);-';
  for (let row = 2; row <= entries.rowCount; row += 1) {
    entries.getRow(row).alignment = { vertical: 'top', wrapText: true };
    entries.getRow(row).height = 22;
  }

  const lastEntryRow = Math.max(2, entries.rowCount);
  summary.getCell('A14').value = 'Reconciliation checks';
  summary.getCell('A14').font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summary.getCell('A14').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF52525B' } };
  summary.getCell('A15').value = 'Entries gross total (EGP)';
  summary.getCell('B15').value = { formula: `SUM('Entries'!D2:D${lastEntryRow})` };
  summary.getCell('A16').value = 'Entries commission total (EGP)';
  summary.getCell('B16').value = { formula: `SUM('Entries'!E2:E${lastEntryRow})` };
  summary.getCell('A17').value = 'Gross delta';
  summary.getCell('B17').value = { formula: 'B6-B15' };
  summary.getCell('A18').value = 'Commission delta';
  summary.getCell('B18').value = { formula: 'B8-B16' };
  for (let row = 15; row <= 18; row += 1) {
    summary.getCell(row, 1).font = { bold: true };
    summary.getCell(row, 2).numFmt = '#,##0.00;[Red](#,##0.00);-';
  }
  for (let row = 14; row <= 18; row += 1) {
    for (let column = 1; column <= 2; column += 1) {
      summary.getCell(row, column).border = {
        bottom: { style: 'thin', color: { argb: 'FFD4D4D8' } },
      };
    }
  }
  summary.headerFooter.oddFooter = '&LDAIRTAK&C&P / &N&R&D';
  entries.headerFooter.oddFooter = '&LDAIRTAK&C&P / &N&R&D';

  const output = await workbook.xlsx.writeBuffer({ useStyles: true, useSharedStrings: true });
  return Buffer.from(output);
}

export function createCommissionStatementCsv(statement: MarketplaceCommissionStatementDetail): Buffer {
  assertStatement(statement);
  const rows: Array<Array<string | number | null>> = [
    ['statement_id', statement.id],
    ['store_id', statement.store_id],
    ['period_start', statement.period_start],
    ['period_end', statement.period_end],
    ['status', statement.status],
    ['gross_egp', egp(statement.gross_piastres)],
    ['commission_rate', rate(statement.commission_rate)],
    ['commission_egp', egp(statement.commission_piastres)],
    ['manual_adjustment_egp', egp(statement.manual_adjustment_piastres)],
    ['total_due_egp', egp(statement.total_due_piastres)],
    ['notes', statement.notes ?? ''],
    [],
    ['recognized_at', 'entry_type', 'order_id', 'gross_egp', 'commission_egp'],
    ...statement.entries.map((entry) => [
      entry.recognized_at,
      entry.entry_type,
      entry.order_id ?? '',
      egp(entry.gross_piastres),
      egp(entry.commission_piastres),
    ]),
  ];
  return Buffer.from(`\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`, 'utf8');
}
