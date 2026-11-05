import path from "path";
import fs from "fs";
import {
  PRIVATE_ASSIGNMENT_STORAGE_ROOT,
  resolveAssignmentStoragePath,
} from "../config/assignment_upload";

export interface StoredFileMetadata {
  storageKey: string;
  size: number;
  mimeType: string;
  lastModified?: Date;
}

export interface IFileStorageService {
  /**
   * Uploads or writes a file to storage under the given canonical key.
   */
  uploadFile(
    storageKey: string,
    content: Buffer | NodeJS.ReadableStream,
    mimeType: string
  ): Promise<StoredFileMetadata>;

  /**
   * Retrieves a readable stream for the file identified by storageKey.
   */
  getFileStream(storageKey: string): Promise<NodeJS.ReadableStream>;

  /**
   * Retrieves the full buffer of a file identified by storageKey.
   */
  getFileBuffer(storageKey: string): Promise<Buffer>;

  /**
   * Deletes a file identified by storageKey.
   */
  deleteFile(storageKey: string): Promise<void>;

  /**
   * Checks whether a file identified by storageKey exists.
   */
  fileExists(storageKey: string): Promise<boolean>;

  /**
   * Generates an authorized download URL.
   * For cloud object storage (S3/R2), generates a pre-signed URL.
   * For local storage, returns an internal API delivery path.
   */
  getDownloadUrl(storageKey: string, expiresInSeconds?: number): Promise<string>;
}

export class StorageConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageConfigurationError";
  }
}

/**
 * Genuinely implemented Local File Storage Provider.
 * Fully operational for development, testing, and single-host deployments with persistent mounts.
 * Operates strictly inside PRIVATE_ASSIGNMENT_STORAGE_ROOT (outside public /uploads/).
 */
export class LocalFileStorageService implements IFileStorageService {
  async uploadFile(
    storageKey: string,
    content: Buffer | NodeJS.ReadableStream,
    mimeType: string
  ): Promise<StoredFileMetadata> {
    const absolutePath = resolveAssignmentStoragePath(storageKey);
    const dir = path.dirname(absolutePath);
    await fs.promises.mkdir(dir, { recursive: true });

    if (Buffer.isBuffer(content)) {
      await fs.promises.writeFile(absolutePath, content);
      return {
        storageKey,
        size: content.length,
        mimeType,
        lastModified: new Date(),
      };
    }

    const writeStream = fs.createWriteStream(absolutePath);
    await new Promise<void>((resolve, reject) => {
      content.pipe(writeStream);
      writeStream.on("finish", () => resolve());
      writeStream.on("error", (err) => reject(err));
    });

    const stat = await fs.promises.stat(absolutePath);
    return {
      storageKey,
      size: stat.size,
      mimeType,
      lastModified: stat.mtime,
    };
  }

  async getFileStream(storageKey: string): Promise<NodeJS.ReadableStream> {
    const absolutePath = resolveAssignmentStoragePath(storageKey);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found in storage: '${storageKey}'`);
    }
    return fs.createReadStream(absolutePath);
  }

  async getFileBuffer(storageKey: string): Promise<Buffer> {
    const absolutePath = resolveAssignmentStoragePath(storageKey);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found in storage: '${storageKey}'`);
    }
    return fs.promises.readFile(absolutePath);
  }

  async deleteFile(storageKey: string): Promise<void> {
    try {
      const absolutePath = resolveAssignmentStoragePath(storageKey);
      if (fs.existsSync(absolutePath)) {
        await fs.promises.unlink(absolutePath);
      }
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        throw err;
      }
    }
  }

  async fileExists(storageKey: string): Promise<boolean> {
    try {
      const absolutePath = resolveAssignmentStoragePath(storageKey);
      return fs.existsSync(absolutePath);
    } catch {
      return false;
    }
  }

  async getDownloadUrl(
    storageKey: string,
    _expiresInSeconds = 900
  ): Promise<string> {
    return `/api/assignments/files/download?key=${encodeURIComponent(storageKey)}`;
  }
}

/**
 * Cloudflare R2 / AWS S3 Provider Interface Template (INCOMPLETE - PENDING SDK INSTALLATION).
 *
 * Current Status:
 * - This class defines the contract and credential validation for S3/R2.
 * - Cloud operations (upload, stream, buffer, delete, signed URL) cannot be executed
 *   until package installation for `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`
 *   is explicitly approved by the user.
 * - createStorageService() prevents production from selecting this provider while incomplete.
 */
export class S3CompatibleStorageService implements IFileStorageService {
  private bucket: string;
  private endpoint?: string;
  private region: string;
  private accessKeyId: string;
  private secretAccessKey: string;

  constructor(config: {
    bucket: string;
    endpoint?: string;
    region?: string;
    accessKeyId: string;
    secretAccessKey: string;
  }) {
    this.bucket = config.bucket;
    this.endpoint = config.endpoint;
    this.region = config.region || "auto";
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;

    if (!this.bucket || !this.accessKeyId || !this.secretAccessKey) {
      throw new StorageConfigurationError(
        "S3/R2 storage provider requires bucket, accessKeyId, and secretAccessKey."
      );
    }
  }

  async uploadFile(
    _storageKey: string,
    _content: Buffer | NodeJS.ReadableStream,
    _mimeType: string
  ): Promise<StoredFileMetadata> {
    throw new StorageConfigurationError(
      `Cloudflare R2 / S3 uploadFile is not yet operational. Requires package installation approval for '@aws-sdk/client-s3'.`
    );
  }

  async getFileStream(_storageKey: string): Promise<NodeJS.ReadableStream> {
    throw new StorageConfigurationError(
      `Cloudflare R2 / S3 getFileStream is not yet operational. Requires package installation approval for '@aws-sdk/client-s3'.`
    );
  }

  async getFileBuffer(_storageKey: string): Promise<Buffer> {
    throw new StorageConfigurationError(
      `Cloudflare R2 / S3 getFileBuffer is not yet operational. Requires package installation approval for '@aws-sdk/client-s3'.`
    );
  }

  async deleteFile(_storageKey: string): Promise<void> {
    throw new StorageConfigurationError(
      `Cloudflare R2 / S3 deleteFile is not yet operational. Requires package installation approval for '@aws-sdk/client-s3'.`
    );
  }

  async fileExists(_storageKey: string): Promise<boolean> {
    throw new StorageConfigurationError(
      `Cloudflare R2 / S3 fileExists is not yet operational. Requires package installation approval for '@aws-sdk/client-s3'.`
    );
  }

  async getDownloadUrl(
    _storageKey: string,
    _expiresInSeconds = 900
  ): Promise<string> {
    throw new StorageConfigurationError(
      `Cloudflare R2 / S3 getDownloadUrl is not yet operational. Requires package installation approval for '@aws-sdk/s3-request-presigner'.`
    );
  }
}

/**
 * Storage Service Factory:
 * 1. In development/testing, uses LocalFileStorageService.
 * 2. In production:
 *    - If R2/S3 is requested, checks credentials AND enforces that incomplete provider
 *      cannot be selected without driver installation.
 *    - Never silently falls back to ephemeral local container storage.
 */
export function createStorageService(): IFileStorageService {
  const isProduction = process.env.NODE_ENV === "production";
  const provider = (process.env.STORAGE_PROVIDER || "").toLowerCase();

  // Cloudflare R2 configuration check
  const r2AccountId = process.env.R2_ACCOUNT_ID;
  const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
  const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const r2Bucket = process.env.R2_BUCKET_NAME;

  // AWS S3 configuration check
  const s3Bucket = process.env.AWS_S3_BUCKET;
  const s3AccessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const s3SecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const s3Region = process.env.AWS_REGION;

  if (provider === "r2" || (r2AccountId && r2AccessKeyId && r2Bucket)) {
    if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2Bucket) {
      throw new StorageConfigurationError(
        "Cloudflare R2 is selected as storage provider, but required environment variables (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME) are missing."
      );
    }
    if (isProduction) {
      throw new StorageConfigurationError(
        "Cloudflare R2 is configured, but the cloud driver package (@aws-sdk/client-s3) has not yet been approved or installed. Incomplete cloud provider cannot be selected in production."
      );
    }
    return new S3CompatibleStorageService({
      bucket: r2Bucket,
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
      region: "auto",
    });
  }

  if (provider === "s3" || (s3Bucket && s3AccessKeyId)) {
    if (!s3Bucket || !s3AccessKeyId || !s3SecretAccessKey) {
      throw new StorageConfigurationError(
        "AWS S3 is selected as storage provider, but required environment variables (AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) are missing."
      );
    }
    if (isProduction) {
      throw new StorageConfigurationError(
        "AWS S3 is configured, but the cloud driver package (@aws-sdk/client-s3) has not yet been approved or installed. Incomplete cloud provider cannot be selected in production."
      );
    }
    return new S3CompatibleStorageService({
      bucket: s3Bucket,
      accessKeyId: s3AccessKeyId,
      secretAccessKey: s3SecretAccessKey,
      region: s3Region || "us-east-1",
    });
  }

  if (isProduction && provider !== "local_allowed") {
    // Explicit security rule: never silently fall back to ephemeral container disk in production
    throw new StorageConfigurationError(
      "Production deployment requires configured durable object storage (Cloudflare R2 or AWS S3). Ephemeral local container storage is strictly disabled to prevent file loss on container restarts. Configure R2_BUCKET_NAME or AWS_S3_BUCKET, or set STORAGE_PROVIDER=local_allowed for persistent volume mounts."
    );
  }

  return new LocalFileStorageService();
}

export const storageService = createStorageService();

export default storageService;
