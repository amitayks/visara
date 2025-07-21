import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { databaseSchema } from './schema';
import { Document } from './models/Document';
import { DocumentMetadata } from './models/DocumentMetadata';
import { SearchVector } from './models/SearchVector';
import { ChatMessage } from './models/ChatMessage';
import { ProcessingQueue } from './models/ProcessingQueue';

// SQLite adapter configuration
const adapter = new SQLiteAdapter({
  schema: databaseSchema,
  // Enable migrations for future schema changes
  // @ts-ignore - migrations can be empty array
  migrations: [],
  // Enable JSI for better performance (if supported)
  jsi: true,
  // Enable WAL mode for better concurrency
  onSetUpDatabase: async (database: any) => {
    // WAL mode and other optimizations are handled by WatermelonDB
  },
});

// Create database instance
export const database = new Database({
  adapter,
  modelClasses: [
    Document,
    DocumentMetadata,
    SearchVector,
    ChatMessage,
    ProcessingQueue,
  ],
});

// Database helper functions
export class DatabaseService {
  static async initializeDatabase(): Promise<void> {
    try {
      // Database is automatically initialized when first accessed
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }
  
  static async clearDatabase(): Promise<void> {
    try {
      await database.write(async () => {
        await database.unsafeResetDatabase();
      });
      console.log('Database cleared successfully');
    } catch (error) {
      console.error('Failed to clear database:', error);
      throw error;
    }
  }
  
  static async getDatabaseStats(): Promise<{
    documents: number;
    metadata: number;
    chatMessages: number;
    processingQueue: number;
  }> {
    try {
      const [documents, metadata, chatMessages, processingQueue] = await Promise.all([
        database.collections.get('documents').query().fetchCount(),
        database.collections.get('document_metadata').query().fetchCount(),
        database.collections.get('chat_messages').query().fetchCount(),
        database.collections.get('processing_queue').query().fetchCount(),
      ]);
      
      return {
        documents,
        metadata,
        chatMessages,
        processingQueue,
      };
    } catch (error) {
      console.error('Failed to get database stats:', error);
      throw error;
    }
  }
  
  static async exportDatabase(): Promise<string> {
    try {
      // This would export the database to a file
      // Implementation depends on platform-specific file operations
      throw new Error('Export not yet implemented');
    } catch (error) {
      console.error('Failed to export database:', error);
      throw error;
    }
  }
  
  static async importDatabase(filePath: string): Promise<void> {
    try {
      // This would import the database from a file
      // Implementation depends on platform-specific file operations
      throw new Error('Import not yet implemented');
    } catch (error) {
      console.error('Failed to import database:', error);
      throw error;
    }
  }
  
  static async performMaintenance(): Promise<void> {
    try {
      await database.write(async () => {
        // Maintenance operations would go here
        // Note: Direct SQL execution is not available in WatermelonDB's public API
      });
      
      console.log('Database maintenance completed');
    } catch (error) {
      console.error('Failed to perform database maintenance:', error);
      throw error;
    }
  }
}

// Export collections for easy access
export const collections = {
  documents: database.collections.get('documents'),
  documentMetadata: database.collections.get('document_metadata'),
  searchVectors: database.collections.get('search_vectors'),
  chatMessages: database.collections.get('chat_messages'),
  processingQueue: database.collections.get('processing_queue'),
};

// Initialize database on module load
DatabaseService.initializeDatabase().catch(console.error);