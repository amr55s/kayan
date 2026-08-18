import { PRODUCT_WORKBOOK_LIMITS } from './contract.ts';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const MAX_EOCD_SEARCH = 65_557;

export class UnsafeWorkbookError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'UnsafeWorkbookError';
    this.code = code;
  }
}

export interface WorkbookZipEnvelope {
  entryCount: number;
  compressedBytes: number;
  uncompressedBytes: number;
}

export function assertProductWorkbookUploadMetadata(input: {
  fileName: string;
  contentType: string;
  byteLength: number;
}): void {
  const fileName = input.fileName.normalize('NFKC').trim();
  if (
    !fileName ||
    fileName.length > 180 ||
    fileName.includes('/') ||
    fileName.includes('\\') ||
    !fileName.toLocaleLowerCase('en-US').endsWith('.xlsx')
  ) {
    throw new UnsafeWorkbookError('file_name', 'Upload a file with the .xlsx extension.');
  }
  const allowedContentTypes = new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
  ]);
  const contentType = input.contentType.split(';', 1)[0]!.trim().toLocaleLowerCase('en-US');
  if (!allowedContentTypes.has(contentType)) {
    throw new UnsafeWorkbookError('content_type', 'The upload Content-Type is not an Excel .xlsx type.');
  }
  if (
    !Number.isSafeInteger(input.byteLength) ||
    input.byteLength < 1 ||
    input.byteLength > PRODUCT_WORKBOOK_LIMITS.maxFileBytes
  ) {
    throw new UnsafeWorkbookError('file_size', 'The workbook must be a non-empty file no larger than 10 MB.');
  }
}

export function assertSafeXlsxEnvelope(buffer: Buffer): WorkbookZipEnvelope {
  if (buffer.byteLength === 0 || buffer.byteLength > PRODUCT_WORKBOOK_LIMITS.maxFileBytes) {
    throw new UnsafeWorkbookError('file_size', 'The workbook must be a non-empty .xlsx file no larger than 10 MB.');
  }
  if (buffer.byteLength < 4 || buffer.readUInt32LE(0) !== 0x04034b50) {
    throw new UnsafeWorkbookError('file_format', 'The uploaded file is not an OOXML .xlsx archive.');
  }

  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) {
    throw new UnsafeWorkbookError('zip_directory', 'The workbook ZIP directory is missing or malformed.');
  }

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new UnsafeWorkbookError('zip64_unsupported', 'ZIP64 workbooks are not accepted by the import endpoint.');
  }
  if (entryCount === 0 || entryCount > PRODUCT_WORKBOOK_LIMITS.maxZipEntries) {
    throw new UnsafeWorkbookError('zip_entries', 'The workbook contains too many archive entries.');
  }
  if (centralOffset + centralSize > eocdOffset || centralOffset + centralSize > buffer.byteLength) {
    throw new UnsafeWorkbookError('zip_directory', 'The workbook ZIP directory points outside the uploaded file.');
  }

  let cursor = centralOffset;
  let totalCompressed = 0;
  let totalUncompressed = 0;
  let sawContentTypes = false;
  let sawWorkbook = false;

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.byteLength || buffer.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new UnsafeWorkbookError('zip_directory', 'The workbook ZIP directory contains an invalid entry.');
    }

    const flags = buffer.readUInt16LE(cursor + 8);
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const nextCursor = cursor + 46 + fileNameLength + extraLength + commentLength;

    if (nextCursor > buffer.byteLength) {
      throw new UnsafeWorkbookError('zip_directory', 'The workbook ZIP entry is truncated.');
    }
    if ((flags & 0x1) !== 0) {
      throw new UnsafeWorkbookError('encrypted_workbook', 'Password-protected workbooks are not accepted.');
    }
    if (![0, 8].includes(compressionMethod)) {
      throw new UnsafeWorkbookError('zip_compression', 'The workbook uses an unsupported compression method.');
    }
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new UnsafeWorkbookError('zip64_unsupported', 'ZIP64 entries are not accepted.');
    }

    const fileName = buffer.subarray(cursor + 46, cursor + 46 + fileNameLength).toString('utf8');
    validateEntryName(fileName);
    const normalizedName = fileName.replace(/\\/g, '/').toLocaleLowerCase('en-US');
    if (normalizedName === '[content_types].xml') sawContentTypes = true;
    if (normalizedName === 'xl/workbook.xml') sawWorkbook = true;
    if (
      normalizedName.endsWith('/vbaproject.bin') ||
      normalizedName.startsWith('xl/externallinks/') ||
      normalizedName.startsWith('xl/embeddings/') ||
      normalizedName.startsWith('customxml/')
    ) {
      throw new UnsafeWorkbookError('active_content', 'Macros, embedded objects, external links and custom XML are not accepted.');
    }

    if (uncompressedSize > PRODUCT_WORKBOOK_LIMITS.maxZipEntryBytes) {
      throw new UnsafeWorkbookError('zip_entry_size', 'A workbook archive entry is too large.');
    }
    if (
      uncompressedSize > 0 &&
      (compressedSize === 0 || uncompressedSize / compressedSize > PRODUCT_WORKBOOK_LIMITS.maxCompressionRatio)
    ) {
      throw new UnsafeWorkbookError('zip_bomb', 'The workbook compression ratio exceeds the safety limit.');
    }

    totalCompressed += compressedSize;
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > PRODUCT_WORKBOOK_LIMITS.maxUncompressedBytes) {
      throw new UnsafeWorkbookError('zip_bomb', 'The expanded workbook exceeds the 100 MB safety limit.');
    }
    cursor = nextCursor;
  }

  if (cursor !== centralOffset + centralSize || !sawContentTypes || !sawWorkbook) {
    throw new UnsafeWorkbookError('file_format', 'The archive is not a complete OOXML workbook.');
  }

  return {
    entryCount,
    compressedBytes: totalCompressed,
    uncompressedBytes: totalUncompressed,
  };
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimum = Math.max(0, buffer.byteLength - MAX_EOCD_SEARCH);
  for (let cursor = buffer.byteLength - 22; cursor >= minimum; cursor -= 1) {
    if (buffer.readUInt32LE(cursor) === EOCD_SIGNATURE) return cursor;
  }
  return -1;
}

function validateEntryName(fileName: string): void {
  const normalized = fileName.replace(/\\/g, '/');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.split('/').some((segment) => segment === '..') ||
    normalized.includes('\u0000')
  ) {
    throw new UnsafeWorkbookError('zip_path', 'The workbook contains an unsafe archive path.');
  }
}
