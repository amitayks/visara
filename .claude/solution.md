WHERE & WHAT to Change:
1. stores/documentStore.ts - Add Immer Integration
Current Problem:
typescript// Line ~300-320: This ALWAYS creates new objects
const transformedDocs: Document[] = sortedDocs.map((doc) => ({
    id: doc.id,
    imageUri: doc.imageUri,
    // ... creates brand new object every time
}));
What Needs to Change:

Add immer to the store creation
Store documents in a Map structure internally
Create a documentsMap: Map<string, Document> for O(1) lookups
Add a documentArrayCache that only updates when Map changes
Add a cacheVersion number to track real changes

Implementation Strategy:

Install: npm install immer zustand-immer
Wrap store with immer middleware
Replace array storage with Map + cached array
In the database observer callback:

Compare incoming documents with existing Map entries
Only update Map entries that actually changed
Only increment cache version if Map changed
Only recreate array if cache version changed



2. stores/documentStore.ts - initializeRealTimeUpdates Method
Current Problem (Line ~365-415):

Creates new transformed docs array even when checking shows no changes
The debouncing doesn't prevent object recreation

What Needs to Change:

Before transforming, check each document against existing Map
Use immer's produce to maintain structural sharing
Only transform documents that are new or changed
Keep existing references for unchanged documents

Specific Logic:
For each incoming document:
  1. Check if exists in documentsMap by ID
  2. If exists, deep compare the fields we care about (ocrText, type, etc.)
  3. If unchanged → keep existing reference
  4. If changed → create new object
  5. Only update state if any document changed
3. stores/documentStore.ts - loadDocuments Method
Current Problem (Line ~95-180):

Always creates new array even when reloading same documents

What Needs to Change:

Check against existing documentsMap before transformation
Reuse existing Document objects when data matches
Only create new Document objects for truly new/changed items

4. stores/documentStore.ts - State Structure
Add to State Interface:
typescriptdocumentsMap: Map<string, Document>  // Primary storage
documentArrayCache: Document[]       // Cached array (computed)
cacheVersion: number                 // Increments only on real changes
lastArrayBuildTime: number           // For cache invalidation
5. stores/documentStore.ts - Filtered Documents
Current Problem:

filteredDocuments is a full array copy
Updates trigger double re-renders

What Needs to Change:

Store only filteredDocumentIds: Set<string>
Compute filtered array on-demand from documentsMap
Use a getter or computed property

Key Implementation Points:

Document Comparison Function:

Create a hasDocumentChanged(oldDoc, newDoc) helper
Compare only fields that matter for display
Ignore timestamps unless they affect UI


Array Building:

Only rebuild array when cacheVersion changes
Sort using stable sort (maintain order for unchanged items)
Use same array reference if nothing changed


Update Flow:

   Database Change → 
   Compare with Map → 
   Update only changed entries → 
   Increment version if changed → 
   Rebuild array only if version changed → 
   FlashList only re-renders if array reference changed

Memory Management:

Clean up Map entries when documents deleted
Set max cache age for array cache
Clear old entries periodically



Critical Success Factors:

Never transform unchanged documents - reuse existing object
Only increment cacheVersion on real changes - not on every update
Memoize array creation - same Map state = same array reference
Use shallow equality in FlashList - it's already doing this
Separate filtered IDs from filtered array - compute on demand

This approach will reduce re-renders from every database update to only when documents actually change in a meaningful way.