import { schemaMigrations, createTable, addColumns } from '@nozbe/watermelondb/Schema/migrations';

export default schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'documents',
          columns: [
            { name: 'thumbnail_uri', type: 'string', isOptional: true },
            { name: 'image_hash', type: 'string', isIndexed: true },
            { name: 'image_taken_date', type: 'number', isOptional: true },
            { name: 'keywords', type: 'string', isOptional: true },
            { name: 'search_vector', type: 'string', isOptional: true },
            { name: 'image_width', type: 'number', isOptional: true },
            { name: 'image_height', type: 'number', isOptional: true },
            { name: 'image_size', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
  ],
});