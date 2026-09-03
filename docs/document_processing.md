# Document Processing

## Current Approach

Uploaded documents are stored as files, while document metadata is stored
in MongoDB.

For supported text-based documents, the backend extracts the text before
sending the content to the AI layer.

Current supported formats:

- PDF
- DOCX
- TXT

## PDF Extraction Limitation

The current PDF extraction process works with text-based PDFs.

A scanned PDF may contain pages as images rather than actual text.
In that case, the PDF parser may return little or no text.

Example:

PDF
└── Page images
    ├── Image
    ├── Image
    └── Image

These documents will eventually require OCR (Optical Character Recognition)
to convert the images into machine-readable text.

OCR is intentionally not implemented in the current version.

## Future Improvement

If the platform needs to support scanned documents, an OCR pipeline can
be added later:

PDF
 ↓
Detect/extract page images
 ↓
OCR
 ↓
Extracted text
 ↓
SourceContent
 ↓
AI processing