import 'server-only';

import ExcelJS from 'exceljs';

import {
  IMAGE_HEADERS,
  PRODUCT_HEADERS,
  PRODUCT_WORKBOOK_LIMITS,
  PRODUCT_WORKBOOK_SHEETS,
  VARIANT_HEADERS,
  type ProductExportRecord,
  type ProductExportSourceAdapter,
  type ProductImportIssue,
} from './contract.ts';
import { normalizeProductKey, normalizeSku, sanitizeSpreadsheetText } from './validation.ts';

export class ProductWorkbookExportError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ProductWorkbookExportError';
    this.code = code;
  }
}

export async function exportProductsFromAdapter(
  adapter: ProductExportSourceAdapter,
  input: { actorUserId: string; storeId: string },
): Promise<Buffer> {
  const records = await adapter.listProductsForExport(input);
  return createProductWorkbook(records);
}

export async function createProductImportTemplate(): Promise<Buffer> {
  return createProductWorkbook([]);
}

export async function createProductWorkbook(records: ProductExportRecord[]): Promise<Buffer> {
  validateExportRecords(records);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'DAIRTAK';
  workbook.subject = 'Marketplace product import and export';
  workbook.properties.date1904 = false;
  workbook.calcProperties.fullCalcOnLoad = false;

  const instructions = workbook.addWorksheet(PRODUCT_WORKBOOK_SHEETS.instructions, {
    views: [{ showGridLines: false }],
  });
  const products = workbook.addWorksheet(PRODUCT_WORKBOOK_SHEETS.products, {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
  });
  const variants = workbook.addWorksheet(PRODUCT_WORKBOOK_SHEETS.variants, {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
  });
  const images = workbook.addWorksheet(PRODUCT_WORKBOOK_SHEETS.images, {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
  });

  writeInstructions(instructions);
  products.addRow([...PRODUCT_HEADERS]);
  variants.addRow([...VARIANT_HEADERS]);
  images.addRow([...IMAGE_HEADERS]);

  for (const product of records) {
    products.addRow([
      spreadsheetText(product.productKey),
      spreadsheetText(product.name),
      spreadsheetText(product.category),
      spreadsheetText(product.brand),
      spreadsheetText(product.description),
      product.status,
    ]);

    for (const variant of product.variants) {
      variants.addRow([
        spreadsheetText(product.productKey),
        spreadsheetText(variant.sku),
        spreadsheetText(variant.options[0]?.name),
        spreadsheetText(variant.options[0]?.value),
        spreadsheetText(variant.options[1]?.name),
        spreadsheetText(variant.options[1]?.value),
        variant.pricePiastres / 100,
        variant.compareAtPricePiastres === null ? null : variant.compareAtPricePiastres / 100,
        variant.stock,
        variant.active,
      ]);

    }
    for (const image of [...product.images].sort((left, right) => left.position - right.position)) {
      images.addRow([
        spreadsheetText(product.productKey),
        spreadsheetText(image.url),
        image.position,
        spreadsheetText(image.altText),
      ]);
    }
  }

  formatDataSheet(products, {
    widths: [24, 34, 22, 22, 60, 20],
    textColumns: [1, 2, 3, 4, 5, 6],
  });
  formatDataSheet(variants, {
    widths: [24, 24, 20, 24, 20, 24, 18, 22, 14, 14],
    textColumns: [1, 2, 3, 4, 5, 6],
    moneyColumns: [7, 8],
    integerColumns: [9],
  });
  formatDataSheet(images, {
    widths: [24, 64, 14, 38],
    textColumns: [1, 2, 4],
    integerColumns: [3],
  });

  const validationEndRow = Math.max(100, products.rowCount);
  for (let row = 2; row <= validationEndRow; row += 1) {
    products.getCell(row, 6).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"draft,pending_review,active,archived"'],
      showErrorMessage: true,
      errorTitle: 'Invalid status',
      error: 'Choose draft, pending_review, active or archived.',
    };
  }

  const output = await workbook.xlsx.writeBuffer({
    useStyles: true,
    useSharedStrings: true,
  });
  return Buffer.from(output);
}

export async function createImportIssuesWorkbook(issues: ProductImportIssue[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'DAIRTAK';
  const sheet = workbook.addWorksheet('Validation Errors', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
  });
  sheet.addRow(['severity', 'code', 'sheet', 'row', 'column', 'message', 'value']);

  for (const issue of issues.slice(0, 10_000)) {
    sheet.addRow([
      issue.severity,
      spreadsheetText(issue.code),
      spreadsheetText(issue.sheet),
      issue.row ?? null,
      spreadsheetText(issue.column),
      spreadsheetText(issue.message),
      spreadsheetText(issue.value),
    ]);
  }
  formatDataSheet(sheet, {
    widths: [12, 28, 20, 10, 24, 64, 38],
    textColumns: [1, 2, 3, 5, 6, 7],
    integerColumns: [4],
  });

  const output = await workbook.xlsx.writeBuffer({ useStyles: true, useSharedStrings: true });
  return Buffer.from(output);
}

function validateExportRecords(records: ProductExportRecord[]): void {
  if (records.length > PRODUCT_WORKBOOK_LIMITS.maxProducts) {
    throw new ProductWorkbookExportError('product_limit', 'The export exceeds the 5000-product workbook limit.');
  }

  const productKeys = new Set<string>();
  const skus = new Set<string>();
  let variantCount = 0;
  let imageCount = 0;
  for (const product of records) {
    const productKey = normalizeProductKey(product.productKey);
    if (!productKey || productKeys.has(productKey)) {
      throw new ProductWorkbookExportError('duplicate_product_key', 'Export product keys must be valid and unique.');
    }
    productKeys.add(productKey);
    if (product.variants.length === 0) {
      throw new ProductWorkbookExportError('product_without_variant', 'Every exported product must have a variant.');
    }

    for (const variant of product.variants) {
      const sku = normalizeSku(variant.sku);
      if (!sku || skus.has(sku)) {
        throw new ProductWorkbookExportError('duplicate_sku', 'Export SKUs must be valid and globally unique per workbook.');
      }
      skus.add(sku);
      variantCount += 1;
      if (
        !Number.isSafeInteger(variant.pricePiastres) ||
        variant.pricePiastres <= 0 ||
        !Number.isSafeInteger(variant.stock) ||
        variant.stock < 0
      ) {
        throw new ProductWorkbookExportError('invalid_variant_numbers', 'Prices must be positive integer piastres and stock non-negative.');
      }
    }
    imageCount += product.images.length;
    if (product.images.length > PRODUCT_WORKBOOK_LIMITS.maxImagesPerProduct) {
      throw new ProductWorkbookExportError('image_limit', 'A product cannot export more than 10 images.');
    }
    const positions = new Set(product.images.map((image) => image.position));
    if (
      positions.size !== product.images.length ||
      product.images.some((image) => !Number.isInteger(image.position) || image.position < 0 || image.position >= PRODUCT_WORKBOOK_LIMITS.maxImagesPerProduct)
    ) {
      throw new ProductWorkbookExportError('image_position', 'Image positions must be unique integers from 0 to 9 for each product.');
    }
  }
  if (variantCount > PRODUCT_WORKBOOK_LIMITS.maxVariants || imageCount > PRODUCT_WORKBOOK_LIMITS.maxImages) {
    throw new ProductWorkbookExportError('row_limit', 'The export exceeds the workbook row limits.');
  }
}

function writeInstructions(sheet: ExcelJS.Worksheet): void {
  sheet.getColumn(1).width = 30;
  sheet.getColumn(2).width = 100;
  sheet.mergeCells('A1:B1');
  sheet.getCell('A1').value = 'DAIRTAK Product Workbook · Contract v1';
  sheet.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 16 };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF18181B' } };
  sheet.getCell('A1').alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 34;

  const rows: Array<[string, string]> = [
    ['Workflow', 'Fill Products first, Variants second, then optional Images. Upload runs validation/dry-run before any database commit.'],
    ['Product identity', 'product_key is stable per store. Reusing it updates the same product; omitting a product never deletes it.'],
    ['SKU identity', 'SKU is normalized and must be unique across the entire workbook. Duplicate rows are rejected, even when their values match.'],
    ['Money', 'Enter EGP as a numeric value with at most two decimals. The server converts it exactly to integer piastres.'],
    ['Images', 'Use public HTTPS raster-image URLs only. Each product supports positions 0-9; the server fetches and copies validated images to managed storage.'],
    ['Publishing', 'The first publication requires approval. Later ordinary imports preserve an already-approved active product; the database adapter enforces this rule.'],
    ['Safety limits', '10 MB file; 5,000 products; 20,000 variants; 50,000 image rows; 10 images per product. Formulas, macros and embedded objects are rejected.'],
    ['Arabic headers', 'Common Arabic and English header aliases are accepted. Keep the canonical exported headers for the clearest error reports.'],
  ];
  sheet.addRows(rows);
  sheet.getColumn(1).font = { bold: true, color: { argb: 'FF27272A' } };
  sheet.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
  for (let row = 2; row <= sheet.rowCount; row += 1) {
    sheet.getRow(row).height = 36;
    if (row % 2 === 0) {
      sheet.getRow(row).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F4F5' } };
    }
  }
  sheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }];
}

function formatDataSheet(
  sheet: ExcelJS.Worksheet,
  options: {
    widths: number[];
    textColumns: number[];
    moneyColumns?: number[];
    integerColumns?: number[];
  },
): void {
  const header = sheet.getRow(1);
  header.height = 28;
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF18181B' } };
  header.alignment = { vertical: 'middle' };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: options.widths.length } };

  options.widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  for (const column of options.textColumns) sheet.getColumn(column).numFmt = '@';
  for (const column of options.moneyColumns ?? []) sheet.getColumn(column).numFmt = '#,##0.00';
  for (const column of options.integerColumns ?? []) sheet.getColumn(column).numFmt = '#,##0';

  for (let row = 2; row <= sheet.rowCount; row += 1) {
    sheet.getRow(row).alignment = { vertical: 'top', wrapText: true };
    sheet.getRow(row).height = 24;
  }
}

function spreadsheetText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return sanitizeSpreadsheetText(value);
}
