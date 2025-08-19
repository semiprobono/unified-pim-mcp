import { File, FileEntity, FilePermissions, ShareLink, FileVersion, FileActivity } from '../../../../domain/entities/File.js';
import { UnifiedId } from '../../../../domain/value-objects/UnifiedId.js';
import { FileMetadataImpl } from '../../../../domain/value-objects/FileMetadata.js';

/**
 * Maps Microsoft Graph DriveItem to domain File entities
 */
export class FileMapper {
  /**
   * Map Microsoft Graph driveItem to domain File entity
   */
  static fromGraphDriveItem(driveItem: any): File {
    // Create unified ID
    const unifiedId = UnifiedId.create('microsoft', 'file');
    const platformIds = new Map();
    platformIds.set('microsoft', driveItem.id);

    // Extract basic properties
    const name = driveItem.name;
    const displayName = driveItem.name;
    const isFolder = !!driveItem.folder;
    const mimeType = driveItem.file?.mimeType || (isFolder ? 'folder' : 'application/octet-stream');
    const size = driveItem.size || 0;
    
    // Build path from parent reference
    const path = driveItem.parentReference?.path ? 
      `${driveItem.parentReference.path.replace('/drive/root:', '')}/${name}` : 
      `/${name}`;

    // Parse dates
    const createdDateTime = new Date(driveItem.createdDateTime);
    const lastModifiedDateTime = new Date(driveItem.lastModifiedDateTime);
    const lastAccessedDateTime = driveItem.lastAccessedDateTime ? 
      new Date(driveItem.lastAccessedDateTime) : undefined;

    // Extract user information
    const createdBy = driveItem.createdBy?.user?.displayName || 
                     driveItem.createdBy?.user?.email || 
                     'system';
    const lastModifiedBy = driveItem.lastModifiedBy?.user?.displayName || 
                          driveItem.lastModifiedBy?.user?.email || 
                          'system';

    // URLs
    const downloadUrl = driveItem['@microsoft.graph.downloadUrl'] || undefined;
    const webUrl = driveItem.webUrl;
    const previewUrl = driveItem.webUrl; // OneDrive uses webUrl for preview
    const thumbnailUrl = driveItem.thumbnails?.[0]?.large?.url || 
                        driveItem.thumbnails?.[0]?.medium?.url || 
                        driveItem.thumbnails?.[0]?.small?.url || 
                        undefined;

    // File hash
    const hash = driveItem.file?.hashes?.sha256Hash || 
                driveItem.file?.hashes?.sha1Hash || 
                driveItem.file?.hashes?.quickXorHash || 
                undefined;

    // Tags and categories (not directly supported, use empty arrays)
    const tags: string[] = [];
    const categories: string[] = [];
    
    // Description
    const description = driveItem.description || undefined;

    // Map permissions
    const permissions: FilePermissions = this.mapPermissions(driveItem);

    // Map versions
    const versions: FileVersion[] = this.mapVersions(driveItem);

    // Map share links
    const shareLinks: ShareLink[] = this.mapShareLinks(driveItem);

    // Map activities
    const activities: FileActivity[] = this.mapActivities(driveItem);

    // Check if deleted
    const isDeleted = !!driveItem.deleted;
    const deletedDateTime = driveItem.deleted?.deletedDateTime ? 
      new Date(driveItem.deleted.deletedDateTime) : undefined;
    const deletedBy = driveItem.deleted?.deletedBy?.user?.displayName || undefined;

    // Create metadata
    const metadata = new FileMetadataImpl(
      'microsoft',
      driveItem.id,
      driveItem.file?.mimeType || mimeType,
      size,
      createdDateTime,
      lastModifiedDateTime,
      new Date(),
      false, // isReadOnly
      !!driveItem.shared, // isShared
      'private', // sharingScope
      permissions,
      'upload', // source
      driveItem.parentReference?.driveId,
      driveItem.parentReference?.driveType,
      driveItem.parentReference?.id,
      driveItem.parentReference?.path,
      webUrl,
      downloadUrl,
      previewUrl,
      thumbnailUrl,
      undefined, // shareUrl
      driveItem.cTag,
      driveItem.eTag,
      undefined, // version
      hash,
      createdBy,
      lastModifiedBy,
      createdBy, // ownedBy
      lastAccessedDateTime
    );

    // Create file entity
    return new FileEntity(
      unifiedId,
      platformIds,
      name,
      displayName,
      mimeType,
      size,
      path,
      isFolder,
      createdDateTime,
      lastModifiedDateTime,
      tags,
      categories,
      versions,
      permissions,
      shareLinks,
      activities,
      isDeleted,
      metadata,
      driveItem.parentReference?.id,
      lastAccessedDateTime,
      createdBy,
      lastModifiedBy,
      downloadUrl,
      previewUrl,
      thumbnailUrl,
      webUrl,
      hash,
      description,
      deletedDateTime,
      deletedBy
    );
  }

  /**
   * Map domain File to Graph API format
   */
  static toGraphDriveItem(file: File): any {
    const graphItem: any = {
      name: file.name,
      description: file.description
    };

    // Add file-specific properties
    if (!file.isFolder) {
      graphItem.file = {
        mimeType: file.mimeType
      };
    }

    // Add folder-specific properties
    if (file.isFolder) {
      graphItem.folder = {};
    }

    // Parent reference
    if (file.parentId) {
      graphItem.parentReference = {
        id: file.parentId
      };
    }

    return graphItem;
  }

  /**
   * Map permissions from Graph API
   */
  private static mapPermissions(driveItem: any): FilePermissions {
    const permissions = driveItem.permissions?.[0];
    
    return {
      canRead: true, // Default if user can access
      canWrite: permissions?.roles?.includes('write') || 
               permissions?.roles?.includes('owner') || 
               false,
      canDelete: permissions?.roles?.includes('owner') || false,
      canShare: permissions?.grantedTo === undefined || // Owner can share
               permissions?.roles?.includes('owner') || 
               false,
      canDownload: true, // Default if user can read
      inheritedFrom: permissions?.inheritedFrom?.id
    };
  }

  /**
   * Map versions from Graph API
   */
  private static mapVersions(driveItem: any): FileVersion[] {
    if (!driveItem.versions || !Array.isArray(driveItem.versions)) {
      // Return current version as the only version
      return [{
        id: driveItem.id,
        createdDateTime: new Date(driveItem.createdDateTime),
        lastModifiedDateTime: new Date(driveItem.lastModifiedDateTime),
        size: driveItem.size || 0,
        versionLabel: '1.0',
        createdBy: driveItem.lastModifiedBy?.user?.displayName || 'system'
      }];
    }

    return driveItem.versions.map((version: any) => ({
      id: version.id,
      createdDateTime: new Date(version.lastModifiedDateTime),
      lastModifiedDateTime: new Date(version.lastModifiedDateTime),
      size: version.size || 0,
      versionLabel: version.id,
      comment: version.comment,
      createdBy: version.lastModifiedBy?.user?.displayName || 'system',
      downloadUrl: version['@microsoft.graph.downloadUrl']
    }));
  }

  /**
   * Map share links from Graph API
   */
  private static mapShareLinks(driveItem: any): ShareLink[] {
    if (!driveItem.permissions || !Array.isArray(driveItem.permissions)) {
      return [];
    }

    const shareLinks: ShareLink[] = [];
    
    for (const permission of driveItem.permissions) {
      if (permission.link) {
        shareLinks.push({
          id: permission.id,
          url: permission.link.webUrl,
          type: permission.link.type === 'edit' ? 'edit' : 
               permission.link.type === 'embed' ? 'embed' : 'view',
          expirationDateTime: permission.expirationDateTime ? 
            new Date(permission.expirationDateTime) : undefined,
          requiresSignIn: permission.link.scope !== 'anonymous',
          password: undefined, // Not exposed in API response
          createdDateTime: new Date(permission.createdDateTime || driveItem.createdDateTime),
          createdBy: permission.grantedBy?.user?.displayName || 'system'
        });
      }
    }

    return shareLinks;
  }

  /**
   * Map activities from Graph API
   */
  private static mapActivities(driveItem: any): FileActivity[] {
    const activities: FileActivity[] = [];

    // Add creation activity
    activities.push({
      id: `activity_created_${driveItem.id}`,
      action: 'created',
      actor: driveItem.createdBy?.user?.displayName || 'system',
      timestamp: new Date(driveItem.createdDateTime),
      details: {}
    });

    // Add modification activity if different from creation
    if (driveItem.lastModifiedDateTime !== driveItem.createdDateTime) {
      activities.push({
        id: `activity_modified_${driveItem.id}`,
        action: 'modified',
        actor: driveItem.lastModifiedBy?.user?.displayName || 'system',
        timestamp: new Date(driveItem.lastModifiedDateTime),
        details: {}
      });
    }

    // Add share activities
    if (driveItem.shared) {
      activities.push({
        id: `activity_shared_${driveItem.id}`,
        action: 'shared',
        actor: driveItem.shared.sharedBy?.user?.displayName || 'system',
        timestamp: new Date(driveItem.shared.sharedDateTime),
        details: {
          scope: driveItem.shared.scope
        }
      });
    }

    return activities;
  }

  /**
   * Create a partial update object for Graph API
   */
  static toGraphUpdate(updates: Partial<File>): any {
    const graphUpdate: any = {};

    if (updates.name !== undefined) {
      graphUpdate.name = updates.name;
    }

    if (updates.description !== undefined) {
      graphUpdate.description = updates.description;
    }

    if (updates.parentId !== undefined) {
      graphUpdate.parentReference = {
        id: updates.parentId
      };
    }

    return graphUpdate;
  }

  /**
   * Map search results from Graph API
   */
  static fromGraphSearchResults(searchResults: any[]): File[] {
    return searchResults
      .filter(result => result.resource?.['@odata.type'] === '#microsoft.graph.driveItem')
      .map(result => this.fromGraphDriveItem(result.resource));
  }

  /**
   * Create upload session request body
   */
  static toUploadSessionRequest(filename: string, description?: string, conflictBehavior?: string): any {
    return {
      item: {
        '@microsoft.graph.conflictBehavior': conflictBehavior || 'rename',
        name: filename,
        description: description
      }
    };
  }

  /**
   * Create share link request body
   */
  static toShareLinkRequest(type: 'view' | 'edit' | 'embed', options?: any): any {
    const request: any = {
      type: type,
      scope: options?.scope || 'anonymous'
    };

    if (options?.password) {
      request.password = options.password;
    }

    if (options?.expirationDateTime) {
      request.expirationDateTime = options.expirationDateTime;
    }

    return request;
  }

  /**
   * Create invite request body
   */
  static toInviteRequest(recipients: string[], message?: string, requireSignIn: boolean = true): any {
    return {
      recipients: recipients.map(email => ({ email })),
      message: message || 'A file has been shared with you',
      requireSignIn: requireSignIn,
      sendInvitation: true,
      roles: ['read']
    };
  }
}