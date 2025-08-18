import { Logger } from '../logging/Logger.js';
import crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Secure data entry structure
 */
interface SecureDataEntry {
  encryptedData: string;
  iv: string;
  authTag: string;
  timestamp: number;
  keyId: string;
}

/**
 * Security configuration
 */
interface SecurityConfig {
  keyDerivationSalt?: string;
  keyDerivationIterations?: number;
  storageBasePath?: string;
  encryptionAlgorithm?: string;
}

/**
 * Security manager handles authentication, encryption, and access control
 */
export class SecurityManager {
  private isInitialized = false;
  private masterKey: Buffer | null = null;
  private keyDerivationSalt: Buffer;
  private readonly ENCRYPTION_ALGORITHM = 'aes-256-gcm';
  private readonly KEY_DERIVATION_ITERATIONS = 100000;
  private readonly KEY_LENGTH = 32;
  private readonly storageBasePath: string;
  private secureDataCache: Map<string, any> = new Map();

  constructor(
    private readonly config: SecurityConfig,
    private readonly logger: Logger
  ) {
    // Initialize key derivation salt
    const saltString = this.config.keyDerivationSalt || process.env.KEY_DERIVATION_SALT;
    if (saltString) {
      this.keyDerivationSalt = Buffer.from(saltString, 'hex');
    } else {
      // Generate and log new salt (should be stored securely)
      this.keyDerivationSalt = crypto.randomBytes(32);
      this.logger.warn('Generated new key derivation salt. Store this securely:', this.keyDerivationSalt.toString('hex'));
    }

    // Set storage base path
    this.storageBasePath = this.config.storageBasePath || process.env.SECURE_STORAGE_PATH || './secure/data';
  }

  /**
   * Initialize security manager
   */
  async initialize(masterPassword?: string): Promise<void> {
    this.logger.info('Initializing security manager');
    
    try {
      // Ensure storage directory exists
      await fs.mkdir(this.storageBasePath, { recursive: true });
      
      // Derive master key from password or environment
      await this.initializeMasterKey(masterPassword);
      
      // Rotate encryption keys if needed
      await this.checkKeyRotation();
      
      this.isInitialized = true;
      this.logger.info('Security manager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize security manager', error);
      throw error;
    }
  }

  /**
   * Initialize master encryption key
   */
  private async initializeMasterKey(masterPassword?: string): Promise<void> {
    const password = masterPassword || process.env.MASTER_PASSWORD;
    
    if (!password) {
      throw new Error('Master password is required for security manager initialization');
    }

    // Derive key using PBKDF2
    this.masterKey = await new Promise<Buffer>((resolve, reject) => {
      crypto.pbkdf2(
        password,
        this.keyDerivationSalt,
        this.config.keyDerivationIterations || this.KEY_DERIVATION_ITERATIONS,
        this.KEY_LENGTH,
        'sha256',
        (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey);
        }
      );
    });

    this.logger.info('Master key initialized successfully');
  }

  /**
   * Store secure data
   */
  async storeSecureData(key: string, data: any): Promise<void> {
    if (!this.isInitialized || !this.masterKey) {
      throw new Error('Security manager not initialized');
    }

    try {
      // Encrypt the data
      const encryptedEntry = await this.encryptData(data);
      
      // Store in cache
      this.secureDataCache.set(key, data);
      
      // Persist to secure storage
      const filePath = path.join(this.storageBasePath, `${this.sanitizeKey(key)}.enc`);
      await fs.writeFile(filePath, JSON.stringify(encryptedEntry), 'utf8');
      
      this.logger.debug(`Secure data stored for key: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to store secure data for key: ${key}`, error);
      throw error;
    }
  }

  /**
   * Retrieve secure data
   */
  async getSecureData(key: string): Promise<any | null> {
    if (!this.isInitialized || !this.masterKey) {
      throw new Error('Security manager not initialized');
    }

    try {
      // Check cache first
      if (this.secureDataCache.has(key)) {
        return this.secureDataCache.get(key);
      }

      // Load from secure storage
      const filePath = path.join(this.storageBasePath, `${this.sanitizeKey(key)}.enc`);
      
      try {
        const encryptedData = await fs.readFile(filePath, 'utf8');
        const encryptedEntry: SecureDataEntry = JSON.parse(encryptedData);
        
        // Decrypt the data
        const decryptedData = await this.decryptData(encryptedEntry);
        
        // Update cache
        this.secureDataCache.set(key, decryptedData);
        
        return decryptedData;
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          return null; // File doesn't exist
        }
        throw error;
      }
    } catch (error) {
      this.logger.error(`Failed to retrieve secure data for key: ${key}`, error);
      throw error;
    }
  }

  /**
   * Delete secure data
   */
  async deleteSecureData(key: string): Promise<void> {
    try {
      // Remove from cache
      this.secureDataCache.delete(key);
      
      // Remove from storage
      const filePath = path.join(this.storageBasePath, `${this.sanitizeKey(key)}.enc`);
      
      try {
        await fs.unlink(filePath);
        this.logger.debug(`Secure data deleted for key: ${key}`);
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    } catch (error) {
      this.logger.error(`Failed to delete secure data for key: ${key}`, error);
      throw error;
    }
  }

  /**
   * Encrypt data
   */
  private async encryptData(data: any): Promise<SecureDataEntry> {
    if (!this.masterKey) {
      throw new Error('Master key not initialized');
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.ENCRYPTION_ALGORITHM, this.masterKey, iv);
    
    const jsonData = JSON.stringify(data);
    const encrypted = Buffer.concat([
      cipher.update(jsonData, 'utf8'),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    return {
      encryptedData: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      timestamp: Date.now(),
      keyId: crypto.createHash('sha256').update(this.masterKey).digest('hex').substring(0, 8)
    };
  }

  /**
   * Decrypt data
   */
  private async decryptData(encryptedEntry: SecureDataEntry): Promise<any> {
    if (!this.masterKey) {
      throw new Error('Master key not initialized');
    }

    const decipher = crypto.createDecipheriv(
      this.ENCRYPTION_ALGORITHM,
      this.masterKey,
      Buffer.from(encryptedEntry.iv, 'base64')
    );
    
    decipher.setAuthTag(Buffer.from(encryptedEntry.authTag, 'base64'));
    
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedEntry.encryptedData, 'base64')),
      decipher.final()
    ]);
    
    return JSON.parse(decrypted.toString('utf8'));
  }

  /**
   * Sanitize key for filesystem
   */
  private sanitizeKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * Check if key rotation is needed
   */
  private async checkKeyRotation(): Promise<void> {
    // Check key rotation metadata
    const rotationKey = 'system_key_rotation_metadata';
    const metadata = await this.getSecureData(rotationKey);
    
    if (metadata) {
      const lastRotation = new Date(metadata.lastRotation);
      const daysSinceRotation = (Date.now() - lastRotation.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceRotation > 90) {
        this.logger.warn('Key rotation recommended (>90 days since last rotation)');
      }
    } else {
      // Store initial rotation metadata
      await this.storeSecureData(rotationKey, {
        lastRotation: new Date().toISOString(),
        rotationCount: 0
      });
    }
  }

  /**
   * Rotate encryption keys
   */
  async rotateKeys(newMasterPassword: string): Promise<void> {
    if (!this.isInitialized || !this.masterKey) {
      throw new Error('Security manager not initialized');
    }

    this.logger.info('Starting key rotation process');

    try {
      // Load all encrypted data
      const files = await fs.readdir(this.storageBasePath);
      const dataToReencrypt: Map<string, any> = new Map();

      // Decrypt all data with current key
      for (const file of files) {
        if (file.endsWith('.enc')) {
          const key = file.replace('.enc', '');
          const data = await this.getSecureData(key);
          if (data) {
            dataToReencrypt.set(key, data);
          }
        }
      }

      // Generate new master key
      const oldMasterKey = this.masterKey;
      await this.initializeMasterKey(newMasterPassword);

      // Re-encrypt all data with new key
      for (const [key, data] of dataToReencrypt) {
        await this.storeSecureData(key, data);
      }

      // Update rotation metadata
      await this.storeSecureData('system_key_rotation_metadata', {
        lastRotation: new Date().toISOString(),
        rotationCount: (dataToReencrypt.get('system_key_rotation_metadata')?.rotationCount || 0) + 1
      });

      // Clear cache
      this.secureDataCache.clear();

      this.logger.info('Key rotation completed successfully');
    } catch (error) {
      this.logger.error('Key rotation failed', error);
      throw error;
    }
  }

  /**
   * Get security status
   */
  async getStatus(): Promise<any> {
    const rotationMetadata = await this.getSecureData('system_key_rotation_metadata');
    
    return {
      initialized: this.isInitialized,
      encryptionEnabled: true,
      tokenStorageSecure: true,
      encryptionAlgorithm: this.ENCRYPTION_ALGORITHM,
      keyDerivationIterations: this.KEY_DERIVATION_ITERATIONS,
      lastKeyRotation: rotationMetadata?.lastRotation || 'Never',
      rotationCount: rotationMetadata?.rotationCount || 0,
      cacheSize: this.secureDataCache.size
    };
  }

  /**
   * Clear all secure data (use with caution)
   */
  async clearAllSecureData(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Security manager not initialized');
    }

    this.logger.warn('Clearing all secure data');

    try {
      // Clear cache
      this.secureDataCache.clear();

      // Remove all encrypted files
      const files = await fs.readdir(this.storageBasePath);
      for (const file of files) {
        if (file.endsWith('.enc')) {
          await fs.unlink(path.join(this.storageBasePath, file));
        }
      }

      this.logger.info('All secure data cleared');
    } catch (error) {
      this.logger.error('Failed to clear secure data', error);
      throw error;
    }
  }

  /**
   * Dispose security manager
   */
  async dispose(): Promise<void> {
    this.logger.info('Disposing security manager');
    
    // Clear sensitive data from memory
    if (this.masterKey) {
      this.masterKey.fill(0);
      this.masterKey = null;
    }
    
    this.secureDataCache.clear();
    this.isInitialized = false;
    
    this.logger.info('Security manager disposed');
  }
}