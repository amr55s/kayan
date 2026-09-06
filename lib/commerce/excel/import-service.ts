import 'server-only';

import type {
  ProductImportExecutionContext,
  ProductImportExecutionResult,
  ProductImportPersistenceAdapter,
  ProductWorkbookParseResult,
} from './contract.ts';
import { parseProductWorkbook } from './product-workbook.ts';

export type ProductImportServiceResult =
  | { committed: false; validation: ProductWorkbookParseResult; execution: null }
  | { committed: boolean; validation: ProductWorkbookParseResult; execution: ProductImportExecutionResult };

export async function validateAndApplyProductWorkbook(
  buffer: Buffer,
  context: ProductImportExecutionContext,
  adapter: ProductImportPersistenceAdapter,
): Promise<ProductImportServiceResult> {
  assertExecutionContext(context);
  const validation = await parseProductWorkbook(buffer);
  if (!validation.valid || !validation.plan) {
    return { committed: false, validation, execution: null };
  }

  const execution = await adapter.applyProductImport(context, validation.plan);
  return {
    committed: !context.dryRun,
    validation,
    execution,
  };
}

function assertExecutionContext(context: ProductImportExecutionContext): void {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(context.actorUserId)) throw new TypeError('actorUserId must be a UUID.');
  if (!uuid.test(context.storeId)) throw new TypeError('storeId must be a UUID.');
  if (!uuid.test(context.idempotencyKey)) throw new TypeError('idempotencyKey must be a UUID.');
}
