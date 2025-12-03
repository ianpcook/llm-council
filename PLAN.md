# Document Upload Feature - Implementation Plan

## Overview

Add document upload functionality to LLM Council, allowing users to upload documents (PDF, DOCX, TXT, etc.) that provide context to their queries. Documents are extracted, stored, and optionally included when consulting the council.

---

## Architecture Review & Decisions

### PR Architecture (What They Did)

The PR used this architecture:
1. **Separate registry file** (`document_registry.json`) storing all document metadata + extracted text
2. **Global document scope** - documents are available across all conversations
3. **Active/inactive toggle** - users enable/disable documents for context
4. **Context prepended to query** - active documents are added as a preamble to user queries

### Architecture Critique

**Issues with PR approach:**
1. **Registry bloat**: Storing full extracted text in JSON registry means it grows unbounded
2. **Global scope confusion**: Documents aren't tied to conversations, which can be confusing
3. **No conversation-specific context**: Can't have different documents for different conversations
4. **Heavy dependencies**: PyPDF2, python-docx, python-pptx all required upfront

**Alternative approaches considered:**

| Approach | Pros | Cons |
|----------|------|------|
| **A) Global documents (PR style)** | Simple, documents reusable | No per-conversation context |
| **B) Per-conversation documents** | Clear ownership, isolated | Can't share documents |
| **C) Hybrid: library + per-conversation selection** | Flexible, documents reusable | More complex UI |

### Chosen Architecture: **Hybrid (Option C)**

Documents are stored in a global library, but each conversation can select which documents to include. This provides:
- Reusable documents across conversations
- Per-conversation context selection
- Clear mental model for users

### Storage Design

```
data/
  documents/
    {uuid}.pdf          # Original file
    {uuid}.txt          # Extracted text (separate file, not in JSON)
  document_registry.json  # Metadata only (no extracted text)
  conversations/
    {uuid}.json         # Existing, add document_ids field
```

**Registry structure (metadata only):**
```json
{
  "documents": {
    "uuid-1": {
      "id": "uuid-1",
      "filename": "report.pdf",
      "extension": ".pdf",
      "size": 102400,
      "uploaded_at": "2024-01-15T10:30:00Z",
      "text_length": 15000,
      "is_active": true
    }
  }
}
```

**Extracted text stored separately** in `data/documents/{uuid}.txt` - keeps registry small.

---

## Implementation Plan

### Phase 1: Backend - Document Storage & Processing

#### 1.1 Add Dependencies

**File: `pyproject.toml`**
```toml
dependencies = [
    # ... existing ...
    "PyPDF2>=3.0.0",
    "python-docx>=1.0.0",
    "python-pptx>=0.6.0",
    "python-multipart>=0.0.6",  # For FastAPI file uploads
]
```

#### 1.2 Create Document Processor Module

**New file: `backend/documents.py`**

Functions to implement:
- `ensure_documents_dir()` - Create data/documents if needed
- `extract_text_from_pdf(file_path)` - PyPDF2 extraction
- `extract_text_from_docx(file_path)` - python-docx extraction
- `extract_text_from_pptx(file_path)` - python-pptx extraction
- `extract_text_from_txt(file_path)` - Plain text read
- `extract_text(file_path, extension)` - Router function
- `save_document(file_content, filename)` - Save file + extract text + create registry entry
- `get_document(doc_id)` - Get metadata
- `get_document_text(doc_id)` - Read extracted text from .txt file
- `list_documents()` - List all documents (metadata only)
- `delete_document(doc_id)` - Delete file + text + registry entry
- `toggle_document_active(doc_id, is_active)` - Update active status
- `get_active_documents_context()` - Build context string from active documents

**Supported formats:**
- `.pdf` - PyPDF2
- `.docx` - python-docx
- `.pptx` - python-pptx
- `.txt`, `.md` - Direct read
- Images - Metadata only (no OCR), inform user

**Size limits:**
- Max file size: 50MB
- Max extracted text: 500KB per document (truncate with notice)

#### 1.3 Add API Endpoints

**File: `backend/main.py`**

New endpoints:
```python
GET  /api/documents              # List all documents
POST /api/documents/upload       # Upload new document (multipart/form-data)
GET  /api/documents/{id}         # Get document details + preview
DELETE /api/documents/{id}       # Delete document
PATCH /api/documents/{id}/toggle # Toggle active status
GET  /api/documents/types        # Get supported file types
```

#### 1.4 Integrate with Message Flow

**File: `backend/main.py`** - Modify `send_message` and `send_message_stream`

Add optional `include_documents` parameter to request:
```python
class MessageRequest(BaseModel):
    content: str
    mode: Optional[str] = None
    include_documents: Optional[bool] = True  # New
```

When `include_documents=True`, prepend active document context to user query:
```python
if include_documents:
    doc_context = documents.get_active_documents_context()
    if doc_context:
        augmented_query = f"""Reference Documents:
{doc_context}

---

User Question: {content}"""
```

---

### Phase 2: Frontend - Document Management UI

#### 2.1 Add API Client Functions

**File: `frontend/src/api.js`**

```javascript
// Document APIs
async getDocuments() { ... }
async uploadDocument(file) { ... }
async getDocument(docId) { ... }
async deleteDocument(docId) { ... }
async toggleDocument(docId, isActive) { ... }
async getSupportedTypes() { ... }
```

#### 2.2 Create DocumentPanel Component

**New file: `frontend/src/components/DocumentPanel.jsx`**
**New file: `frontend/src/components/DocumentPanel.css`**

Features:
- Upload area (click or drag-and-drop)
- Document list with:
  - File icon by type
  - Filename, size, text length
  - Active/inactive toggle switch
  - Expand to show preview
  - Delete button (with confirmation)
- Footer showing "X of Y active"

#### 2.3 Integrate into ChatInterface

**File: `frontend/src/components/ChatInterface.jsx`**

Add:
- Document toggle button (top-right, shows count of active docs)
- DocumentPanel slide-out when toggled
- "Include documents" checkbox in input area (when docs exist)
- Drag-and-drop zone for file uploads
- Upload button next to input

**Props to add:**
```jsx
documents,           // Array of document metadata
onDocumentUpload,    // (file) => Promise
onDocumentDelete,    // (docId) => Promise
onDocumentToggle,    // (docId, isActive) => Promise
```

#### 2.4 Wire Up in App.jsx

**File: `frontend/src/App.jsx`**

Add:
- `documents` state
- `loadDocuments()` function
- Document event handlers
- Pass document props to ChatInterface

Modify `handleSendMessage` to pass `includeDocuments` flag.

---

### Phase 3: Polish & Edge Cases

#### 3.1 Error Handling

- File too large error message
- Unsupported file type error
- Extraction failure (corrupted file)
- Network errors during upload

#### 3.2 UX Improvements

- Upload progress indicator
- Toast notifications for success/error
- Loading states while extracting
- Truncation notice if text was cut

#### 3.3 CSS Styling

Follow existing patterns:
- Light mode theme
- Primary color: #4a90e2
- Consistent with existing panels (CouncilConfigPanel style)

---

## File Changes Summary

### New Files
- `backend/documents.py` (~300 lines)
- `frontend/src/components/DocumentPanel.jsx` (~200 lines)
- `frontend/src/components/DocumentPanel.css` (~150 lines)

### Modified Files
- `pyproject.toml` - Add dependencies
- `backend/main.py` - Add endpoints, modify message flow
- `frontend/src/api.js` - Add document API functions
- `frontend/src/components/ChatInterface.jsx` - Add document UI integration
- `frontend/src/components/ChatInterface.css` - Add document-related styles
- `frontend/src/App.jsx` - Add document state management

---

## Testing Checklist

- [ ] Upload PDF and verify text extraction
- [ ] Upload DOCX and verify text extraction
- [ ] Upload TXT/MD and verify content
- [ ] Upload PPTX and verify slide text extraction
- [ ] Upload image and verify metadata-only response
- [ ] Reject oversized file (>50MB)
- [ ] Reject unsupported file type
- [ ] Toggle document active/inactive
- [ ] Delete document
- [ ] Send message with documents included
- [ ] Send message without documents
- [ ] Verify document context appears in council responses
- [ ] Drag-and-drop upload works
- [ ] Multiple file upload works
- [ ] Document preview expands correctly

---

## Future Enhancements (Out of Scope)

- Per-conversation document selection (beyond global active toggle)
- OCR for images
- Document search/filtering
- Document tagging
- Conversation-specific document attachments
- Chunking for very large documents (RAG-style)
