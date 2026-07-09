# pdf-processor Specification

## Purpose

Enables users to upload a PDF, browse pages via thumbnails, select pages by range or individually, and extract text for downstream processing. pdfjs-dist is lazy-loaded on first use, and PDF memory is freed immediately after extraction.

## Requirements

### Requirement: PDF Upload

The system MUST accept PDF files via browser file picker, validate the file type, and present selected pages as thumbnails within 3 seconds for files up to 50 MB.

#### Scenario: Upload valid PDF
- GIVEN the user opens the PDF upload interface
- WHEN a valid `.pdf` file is selected
- THEN thumbnails render for all pages at ~150 px height
- AND the original file name is displayed

#### Scenario: Reject invalid file
- GIVEN the user opens the PDF upload interface
- WHEN a non-PDF file is selected
- THEN the system rejects the upload and shows an error: "Solo archivos PDF (.pdf)"

### Requirement: Page Selection

The system MUST support page selection by numeric range (e.g., "23-45") and individual tap on thumbnails.

#### Scenario: Select by range
- GIVEN thumbnails are displayed
- WHEN the user enters "23-45" in the range input
- THEN pages 23 through 45 (inclusive) are highlighted as selected

#### Scenario: Select individual pages
- GIVEN thumbnails are displayed
- WHEN the user taps thumbnails on pages 5, 10, and 15
- THEN those three pages are highlighted and the selected count updates accordingly

### Requirement: Text Extraction

The system MUST extract text from all selected pages using PDF.js and store the result in Dexie's `pdfCache` table keyed by `++id` with a compound index on `[contentHash+pageRange]`. Each extraction record stores which pages were extracted, allowing the same PDF to be re-uploaded with different page ranges without overwriting previous extractions. Before extracting, the system checks the compound index (hash + range) to avoid re-extracting already-cached content.

#### Scenario: Extract selected pages
- GIVEN the user has selected pages 1-3
- WHEN the user confirms extraction
- THEN text from those pages is extracted, concatenated, and stored in IndexedDB with `pageRange: "1-3"`
- AND a success message shows the word count extracted

#### Scenario: Re-extract different page range
- GIVEN pages 1-10 were previously extracted for a PDF
- WHEN the user re-uploads the same PDF and selects pages 50-60
- THEN a new cache entry is created with `pageRange: "50-60"` (the previous entry for pages 1-10 is preserved)
- AND extraction proceeds normally for the new range

#### Scenario: Extraction from scanned (image-only) page
- GIVEN a page contains no extractable text layer
- WHEN extraction runs
- THEN the system returns an empty string for that page and notifies: "La página N no contiene texto extraíble"

### Requirement: Lazy Loading & Memory Management

pdfjs-dist MUST be loaded via dynamic `import()` only on first PDF upload. After extraction, the PDF document object MUST be freed.

#### Scenario: First PDF upload triggers lazy load
- GIVEN the app is running and no PDF has been uploaded before
- WHEN the user selects a PDF file
- THEN pdfjs-dist is dynamically imported before processing begins
- AND subsequent uploads reuse the cached module

#### Scenario: Memory freed after extraction
- GIVEN text has been extracted from the PDF
- WHEN extraction completes
- THEN `pdfDocument.destroy()` and `PDFWorker.destroy()` are called explicitly
- AND `requestIdleCallback` is used to hint the browser GC
- AND app returns to ~30 MB baseline RAM usage

### Requirement: Thumbnail Virtualization

To avoid DOM bloat for PDFs with many pages, the thumbnail grid MUST use Intersection Observer-based lazy rendering. Only visible thumbnails (8-10 at a time) are rendered in a virtual scroll container.

#### Scenario: Large PDF thumbnail rendering
- GIVEN a PDF with 200 pages
- WHEN thumbnails are displayed
- THEN only ~8-10 thumbnails are present in the DOM at any time
- AND scrolling replaces off-screen thumbnails with new ones (virtual list)
