import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'documents',
      columns: [
        { name: 'image_uri', type: 'string' },
        { name: 'ocr_text', type: 'string' },
        { name: 'document_type', type: 'string' },
        { name: 'confidence', type: 'number' },
        { name: 'vendor', type: 'string', isOptional: true },
        { name: 'total_amount', type: 'number', isOptional: true },
        { name: 'currency', type: 'string', isOptional: true },
        { name: 'date', type: 'number', isOptional: true },
        { name: 'metadata', type: 'string' }, // JSON string
        { name: 'processed_at', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
});