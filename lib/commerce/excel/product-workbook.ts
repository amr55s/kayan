import 'server-only';

import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';

import {
  IMAGE_HEADERS,
  PRODUCT_HEADERS,
  PRODUCT_WORKBOOK_LIMITS,
  VARIANT_HEADERS,
  type ProductImageImportRow,
  type ProductImportIssue,
  type ProductImportRow,
  type ProductVariantImportRow,
  type ProductWorkbookParseResult,
} from './contract.ts';
import { UnsafeImageUrlError, validateHttpsImageUrlSyntax } from './image-fetch.ts';
import {
  cellText,
  normalizeHeader,
  normalizeProductKey,
  normalizeSku,
  parseEgpToPiastres,
  parseNonNegativeInteger,
  parseWorkbookBoolean,
  parseWorkbookStatus,
  safeIssueValue,
} from './validation.ts';
import { assertSafeXlsxEnvelope, UnsafeWorkbookError } from './zip-safety.ts';

const MAX_REPORTED_ISSUES = 1_000;

type HeaderMap = Map<string, number>;

interface WorkbookSheets {
  products: ExcelJS.Worksheet;
  variants: ExcelJS.Worksheet;
  images: ExcelJS.Worksheet | null;
}

export async function parseProductWorkbook(buffer: Buffer): Promise<ProductWorkbookParseResult> {
  const issues: ProductImportIssue[] = [];
  const report = createIssueReporter(issues);

  try {
    assertSafeXlsxEnvelope(buffer);
  } catch (error) {
    const code = error instanceof UnsafeWorkbookError ? error.code : 'file_format';
    const message = error instanceof Error ? error.message : 'The uploaded workbook is invalid.';
    report({ severity: 'error', code, sheet: 'Workbook', message });
    return { valid: false, issues, plan: null };
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    report({
      severity: 'error',
      code: 'workbook_parse',
      sheet: 'Workbook',
      message: 'Excel could not parse this workbook. Download a fresh template and try again.',
    });
    return { valid: false, issues, plan: null };
  }

  if (workbook.worksheets.length > PRODUCT_WORKBOOK_LIMITS.maxWorksheets) {
    report({
      severity: 'error',
      code: 'sheet_limit',
      sheet: 'Workbook',
      message: `A product workbook may contain at most ${PRODUCT_WORKBOOK_LIMITS.maxWorksheets} worksheets.`,
    });
  }

  const sheets = resolveWorkbookSheets(workbook, report);
  if (!sheets) return { valid: false, issues, plan: null };

  const productHeaders = readHeaders(sheets.products, PRODUCT_HEADERS, report);
  const variantHeaders = readHeaders(sheets.variants, VARIANT_HEADERS, report);
  const imageHeaders = sheets.images ? readHeaders(sheets.images, IMAGE_HEADERS, report) : null;

  if (!productHeaders || !variantHeaders || (sheets.images && !imageHeaders)) {
    return { valid: false, issues, plan: null };
  }

  enforceSheetRowLimit(sheets.products, PRODUCT_WORKBOOK_LIMITS.maxProducts, report);
  enforceSheetRowLimit(sheets.variants, PRODUCT_WORKBOOK_LIMITS.maxVariants, report);
  if (sheets.images) enforceSheetRowLimit(sheets.images, PRODUCT_WORKBOOK_LIMITS.maxImages, report);

  const products = parseProducts(sheets.products, productHeaders, report);
  const variants = parseVariants(sheets.variants, variantHeaders, products, report);
  const images = sheets.images && imageHeaders
    ? parseImages(sheets.images, imageHeaders, products, report)
    : [];

  if (products.length === 0) {
    report({
      severity: 'error',
      code: 'empty_products',
      sheet: sheets.products.name,
      message: 'The workbook does not contain any valid product rows.',
    });
  }
  if (variants.length === 0) {
    report({
      severity: 'error',
      code: 'empty_variants',
      sheet: sheets.variants.name,
      message: 'The workbook does not contain any valid variant rows.',
    });
  }

  const variantProductKeys = new Set(variants.map((variant) => variant.productKey));
  for (const product of products) {
    if (!variantProductKeys.has(product.productKey)) {
      report({
        severity: 'error',
        code: 'product_without_variant',
        sheet: sheets.products.name,
        row: product.sourceRow,
        column: 'product_key',
        message: 'Every product must have at least one row in the Variants sheet.',
        value: product.productKey,
      });
    }
  }

  const valid = !issues.some((issue) => issue.severity === 'error');
  return {
    valid,
    issues,
    plan: valid
      ? {
          contractVersion: 1,
          sourceSha256: createHash('sha256').update(buffer).digest('hex'),
          products,
          variants,
          images,
        }
      : null,
  };
}

function resolveWorkbookSheets(
  workbook: ExcelJS.Workbook,
  report: ReturnType<typeof createIssueReporter>,
): WorkbookSheets | null {
  const aliases: Record<string, keyof WorkbookSheets | 'instructions'> = {
    products: 'products',
    product: 'products',
    المنتجات: 'products',
    variants: 'variants',
    variant: 'variants',
    الخيارات: 'variants',
    المتغيرات: 'variants',
    images: 'images',
    الصور: 'images',
    instructions: 'instructions',
    readme: 'instructions',
    التعليمات: 'instructions',
  };
  const found: Partial<WorkbookSheets> = {};

  for (const sheet of workbook.worksheets) {
    const key = aliases[normalizeSheetName(sheet.name)];
    if (!key) {
      report({
        severity: 'warning',
        code: 'unknown_sheet',
        sheet: sheet.name,
        message: 'This worksheet is not part of the product import contract and will be ignored.',
      });
      continue;
    }
    if (key === 'instructions') continue;
    if (found[key]) {
      report({
        severity: 'error',
        code: 'duplicate_sheet',
        sheet: sheet.name,
        message: `The workbook contains more than one ${key} worksheet.`,
      });
      continue;
    }
    if (sheet.state !== 'visible') {
      report({
        severity: 'error',
        code: 'hidden_data_sheet',
        sheet: sheet.name,
        message: 'Import data worksheets must be visible.',
      });
    }
    found[key] = sheet;
  }

  if (!found.products) {
    report({ severity: 'error', code: 'missing_sheet', sheet: 'Products', message: 'The Products worksheet is required.' });
  }
  if (!found.variants) {
    report({ severity: 'error', code: 'missing_sheet', sheet: 'Variants', message: 'The Variants worksheet is required.' });
  }
  if (!found.products || !found.variants) return null;
  return { products: found.products, variants: found.variants, images: found.images ?? null };
}

function normalizeSheetName(name: string): string {
  return name
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[\s_-]+/g, '');
}

function readHeaders(
  sheet: ExcelJS.Worksheet,
  requiredHeaders: readonly string[],
  report: ReturnType<typeof createIssueReporter>,
): HeaderMap | null {
  const headers = new Map<string, number>();
  const firstRow = sheet.getRow(1);

  for (let column = 1; column <= firstRow.cellCount; column += 1) {
    const cell = firstRow.getCell(column);
    if (isFormulaCell(cell)) {
      report({
        severity: 'error',
        code: 'formula_forbidden',
        sheet: sheet.name,
        row: 1,
        column: cell.address,
        message: 'Formulas are not allowed in import workbooks.',
      });
      continue;
    }
    const header = normalizeHeader(cell.value);
    if (!header) continue;
    if (headers.has(header)) {
      report({
        severity: 'error',
        code: 'duplicate_header',
        sheet: sheet.name,
        row: 1,
        column: cell.address,
        message: `The normalized header "${header}" appears more than once.`,
      });
      continue;
    }
    headers.set(header, column);
  }

  for (const required of requiredHeaders) {
    if (!headers.has(required)) {
      report({
        severity: 'error',
        code: 'missing_header',
        sheet: sheet.name,
        row: 1,
        column: required,
        message: `The required "${required}" column is missing.`,
      });
    }
  }

  return requiredHeaders.every((header) => headers.has(header)) ? headers : null;
}

function parseProducts(
  sheet: ExcelJS.Worksheet,
  headers: HeaderMap,
  report: ReturnType<typeof createIssueReporter>,
): ProductImportRow[] {
  const products: ProductImportRow[] = [];
  const seenKeys = new Set<string>();

  forEachDataRow(sheet, PRODUCT_WORKBOOK_LIMITS.maxProducts, (rowNumber) => {
    const values = readRecognizedRow(sheet, rowNumber, headers, report);
    if (isEmptyRow(values)) return;

    const productKey = normalizeProductKey(values.product_key);
    const name = cellText(values.name);
    const category = cellText(values.category);
    const brand = nullableText(values.brand);
    const description = nullableText(values.description);
    const status = parseWorkbookStatus(values.status || 'draft');

    if (!productKey) fieldError(report, sheet, rowNumber, 'product_key', 'invalid_product_key', 'Use 1-80 letters, numbers, dots, slashes, underscores or hyphens.', values.product_key);
    if (productKey && seenKeys.has(productKey)) fieldError(report, sheet, rowNumber, 'product_key', 'duplicate_product_key', 'Each product_key may appear only once in Products.', productKey);
    if (name.length < 2 || name.length > 200) fieldError(report, sheet, rowNumber, 'name', 'invalid_name', 'Product names must contain 2-200 characters.', values.name);
    if (category.length < 1 || category.length > 100) fieldError(report, sheet, rowNumber, 'category', 'invalid_category', 'Categories must contain 1-100 characters.', values.category);
    if (brand && brand.length > 100) fieldError(report, sheet, rowNumber, 'brand', 'invalid_brand', 'Brands may contain at most 100 characters.', values.brand);
    if (description && description.length > PRODUCT_WORKBOOK_LIMITS.maxCellCharacters) fieldError(report, sheet, rowNumber, 'description', 'cell_too_long', 'Descriptions may contain at most 5000 characters.', values.description);
    if (!status) fieldError(report, sheet, rowNumber, 'status', 'invalid_status', 'Use draft, pending_review, active or archived.', values.status);

    if (productKey) seenKeys.add(productKey);
    if (productKey && name.length >= 2 && name.length <= 200 && category.length >= 1 && category.length <= 100 && status) {
      products.push({ sourceRow: rowNumber, productKey, name, category, brand, description, status });
    }
  });
  return products;
}

function parseVariants(
  sheet: ExcelJS.Worksheet,
  headers: HeaderMap,
  products: ProductImportRow[],
  report: ReturnType<typeof createIssueReporter>,
): ProductVariantImportRow[] {
  const variants: ProductVariantImportRow[] = [];
  const productKeys = new Set(products.map((product) => product.productKey));
  const seenSkus = new Set<string>();

  forEachDataRow(sheet, PRODUCT_WORKBOOK_LIMITS.maxVariants, (rowNumber) => {
    const values = readRecognizedRow(sheet, rowNumber, headers, report);
    if (isEmptyRow(values)) return;

    const productKey = normalizeProductKey(values.product_key);
    const sku = normalizeSku(values.sku);
    const pricePiastres = parseEgpToPiastres(values.price_egp);
    const compareAtPricePiastres = cellText(values.compare_at_price_egp)
      ? parseEgpToPiastres(values.compare_at_price_egp)
      : null;
    const stock = parseNonNegativeInteger(values.stock);
    const active = cellText(values.active) ? parseWorkbookBoolean(values.active) : true;
    const optionPairs = [
      [nullableText(values.option_1_name), nullableText(values.option_1_value)],
      [nullableText(values.option_2_name), nullableText(values.option_2_value)],
    ] as const;
    const options: Array<{ name: string; value: string }> = [];

    if (!productKey || !productKeys.has(productKey)) fieldError(report, sheet, rowNumber, 'product_key', 'unknown_product_key', 'Variant product_key must match one Products row.', values.product_key);
    if (!sku) fieldError(report, sheet, rowNumber, 'sku', 'invalid_sku', 'Use a 1-64 character SKU made of letters, numbers, dots, slashes, underscores or hyphens.', values.sku);
    if (sku && seenSkus.has(sku)) fieldError(report, sheet, rowNumber, 'sku', 'duplicate_sku', 'Every normalized SKU must be unique across the entire workbook.', sku);
    if (pricePiastres === null || pricePiastres <= 0) fieldError(report, sheet, rowNumber, 'price_egp', 'invalid_price', 'Price must be greater than zero with at most two decimals.', values.price_egp);
    if (compareAtPricePiastres === null && cellText(values.compare_at_price_egp)) fieldError(report, sheet, rowNumber, 'compare_at_price_egp', 'invalid_compare_price', 'Compare-at price must be a valid EGP amount.', values.compare_at_price_egp);
    if (pricePiastres !== null && compareAtPricePiastres !== null && compareAtPricePiastres < pricePiastres) fieldError(report, sheet, rowNumber, 'compare_at_price_egp', 'compare_price_below_price', 'Compare-at price cannot be lower than the selling price.', values.compare_at_price_egp);
    if (stock === null) fieldError(report, sheet, rowNumber, 'stock', 'invalid_stock', 'Stock must be a whole number between 0 and 1,000,000.', values.stock);
    if (active === null) fieldError(report, sheet, rowNumber, 'active', 'invalid_boolean', 'Use true/false, yes/no, 1/0 or نعم/لا.', values.active);

    for (let index = 0; index < optionPairs.length; index += 1) {
      const [name, value] = optionPairs[index]!;
      if ((name && !value) || (!name && value)) {
        fieldError(report, sheet, rowNumber, `option_${index + 1}_name`, 'incomplete_option', 'Each variant option requires both a name and value.', name ?? value);
      } else if (name && value) {
        if (name.length > 60 || value.length > 100) {
          fieldError(report, sheet, rowNumber, `option_${index + 1}_name`, 'option_too_long', 'Option names may contain 60 characters and values 100.', name);
        } else {
          options.push({ name, value });
        }
      }
    }
    if (options.length === 2 && options[0]!.name.toLocaleLowerCase() === options[1]!.name.toLocaleLowerCase()) {
      fieldError(report, sheet, rowNumber, 'option_2_name', 'duplicate_option_name', 'A variant cannot repeat the same option name.', options[1]!.name);
    }

    if (sku) seenSkus.add(sku);
    if (productKey && productKeys.has(productKey) && sku && pricePiastres !== null && pricePiastres > 0 && stock !== null && active !== null) {
      variants.push({ sourceRow: rowNumber, productKey, sku, options, pricePiastres, compareAtPricePiastres, stock, active });
    }
  });
  return variants;
}

function parseImages(
  sheet: ExcelJS.Worksheet,
  headers: HeaderMap,
  products: ProductImportRow[],
  report: ReturnType<typeof createIssueReporter>,
): ProductImageImportRow[] {
  const images: ProductImageImportRow[] = [];
  const knownProductKeys = new Set(products.map((product) => product.productKey));
  const positionsByProduct = new Map<string, Set<number>>();
  const urlsByProduct = new Map<string, Set<string>>();

  forEachDataRow(sheet, PRODUCT_WORKBOOK_LIMITS.maxImages, (rowNumber) => {
    const values = readRecognizedRow(sheet, rowNumber, headers, report);
    if (isEmptyRow(values)) return;

    const productKey = normalizeProductKey(values.product_key);
    const imageUrl = cellText(values.image_url);
    const altText = nullableText(values.alt_text);
    const positions = productKey ? (positionsByProduct.get(productKey) ?? new Set<number>()) : new Set<number>();
    let position = cellText(values.position)
      ? parseNonNegativeInteger(values.position, PRODUCT_WORKBOOK_LIMITS.maxImagesPerProduct - 1)
      : firstFreePosition(positions);

    if (!productKey || !knownProductKeys.has(productKey)) fieldError(report, sheet, rowNumber, 'product_key', 'unknown_product_key', 'Image product_key must match one Products row.', values.product_key);
    if (!imageUrl) {
      fieldError(report, sheet, rowNumber, 'image_url', 'missing_image_url', 'An HTTPS image URL is required.', values.image_url);
    } else {
      try {
        validateHttpsImageUrlSyntax(imageUrl);
      } catch (error) {
        const code = error instanceof UnsafeImageUrlError ? error.code : 'invalid_url';
        fieldError(report, sheet, rowNumber, 'image_url', code, 'Use a public HTTPS URL without credentials, fragments or nonstandard ports.', imageUrl);
      }
    }
    if (position === null) fieldError(report, sheet, rowNumber, 'position', 'invalid_position', 'Image position must be a unique number from 0 to 9.', values.position);
    if (position !== null && positions.has(position)) fieldError(report, sheet, rowNumber, 'position', 'duplicate_image_position', 'Image positions must be unique within each product.', position);
    if (positions.size >= PRODUCT_WORKBOOK_LIMITS.maxImagesPerProduct) fieldError(report, sheet, rowNumber, 'product_key', 'image_limit', 'Each product may contain at most 10 images.', productKey);
    if (altText && altText.length > 180) fieldError(report, sheet, rowNumber, 'alt_text', 'alt_text_too_long', 'Alternative text may contain at most 180 characters.', altText);

    const urls = productKey ? (urlsByProduct.get(productKey) ?? new Set<string>()) : new Set<string>();
    if (imageUrl && urls.has(imageUrl)) fieldError(report, sheet, rowNumber, 'image_url', 'duplicate_image_url', 'The same image URL cannot be repeated for one product.', imageUrl);

    if (productKey) {
      positionsByProduct.set(productKey, positions);
      urlsByProduct.set(productKey, urls);
    }
    if (productKey && knownProductKeys.has(productKey) && imageUrl && position !== null && positions.size < PRODUCT_WORKBOOK_LIMITS.maxImagesPerProduct) {
      positions.add(position);
      urls.add(imageUrl);
      images.push({ sourceRow: rowNumber, productKey, imageUrl, position, altText });
    }
  });
  return images;
}

function readRecognizedRow(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  headers: HeaderMap,
  report: ReturnType<typeof createIssueReporter>,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  const row = sheet.getRow(rowNumber);
  for (const [header, column] of headers) {
    const cell = row.getCell(column);
    if (isFormulaCell(cell)) {
      report({
        severity: 'error',
        code: 'formula_forbidden',
        sheet: sheet.name,
        row: rowNumber,
        column: header,
        message: 'Formulas are not allowed in import workbooks; paste the calculated value instead.',
      });
      values[header] = null;
      continue;
    }
    const text = cellText(cell.value);
    if (text.length > PRODUCT_WORKBOOK_LIMITS.maxCellCharacters) {
      report({
        severity: 'error',
        code: 'cell_too_long',
        sheet: sheet.name,
        row: rowNumber,
        column: header,
        message: 'A cell exceeds the 5000-character safety limit.',
      });
    }
    values[header] = cell.value;
  }
  return values;
}

function isFormulaCell(cell: ExcelJS.Cell): boolean {
  if (cell.type === ExcelJS.ValueType.Formula) return true;
  return Boolean(
    cell.value &&
    typeof cell.value === 'object' &&
    ('formula' in cell.value || 'sharedFormula' in cell.value),
  );
}

function forEachDataRow(sheet: ExcelJS.Worksheet, limit: number, visitor: (rowNumber: number) => void): void {
  const lastRow = Math.min(sheet.rowCount, limit + 1);
  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) visitor(rowNumber);
}

function enforceSheetRowLimit(
  sheet: ExcelJS.Worksheet,
  limit: number,
  report: ReturnType<typeof createIssueReporter>,
): void {
  if (Math.max(0, sheet.rowCount - 1) > limit) {
    report({
      severity: 'error',
      code: 'row_limit',
      sheet: sheet.name,
      message: `${sheet.name} may contain at most ${limit.toLocaleString('en-US')} data rows.`,
    });
  }
}

function createIssueReporter(issues: ProductImportIssue[]) {
  return (issue: ProductImportIssue): void => {
    if (issues.length < MAX_REPORTED_ISSUES) {
      issues.push(issue);
      return;
    }
    if (issues.length === MAX_REPORTED_ISSUES) {
      issues.push({
        severity: 'error',
        code: 'too_many_issues',
        sheet: 'Workbook',
        message: 'Validation stopped reporting details after 1000 issues. Fix the first issues and retry.',
      });
    }
  };
}

function fieldError(
  report: ReturnType<typeof createIssueReporter>,
  sheet: ExcelJS.Worksheet,
  row: number,
  column: string,
  code: string,
  message: string,
  value?: unknown,
): void {
  report({ severity: 'error', code, sheet: sheet.name, row, column, message, value: safeIssueValue(value) });
}

function isEmptyRow(values: Record<string, unknown>): boolean {
  return Object.values(values).every((value) => cellText(value) === '');
}

function nullableText(value: unknown): string | null {
  const text = cellText(value);
  return text || null;
}

function firstFreePosition(used: Set<number>): number | null {
  for (let position = 0; position < PRODUCT_WORKBOOK_LIMITS.maxImagesPerProduct; position += 1) {
    if (!used.has(position)) return position;
  }
  return null;
}
