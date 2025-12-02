import { useState, useRef } from 'react';
import './DocumentPanel.css';

export default function DocumentPanel({
  documents,
  onUpload,
  onDelete,
  onToggle,
  onClose,
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const fileInputRef = useRef(null);

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (extension) => {
    const ext = extension.toLowerCase();

    // PDF
    if (ext === 'pdf') {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="15" y2="17" />
        </svg>
      );
    }

    // Word documents
    if (ext === 'doc' || ext === 'docx') {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="16" y2="17" />
          <line x1="10" y1="9" x2="14" y2="9" />
        </svg>
      );
    }

    // PowerPoint
    if (ext === 'ppt' || ext === 'pptx') {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <rect x="8" y="12" width="8" height="6" />
        </svg>
      );
    }

    // Text files
    if (ext === 'txt' || ext === 'rtf' || ext === 'md') {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="10" y1="12" x2="14" y2="12" />
          <line x1="10" y1="16" x2="14" y2="16" />
        </svg>
      );
    }

    // Images
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );
    }

    // Default file icon
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    );
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of files) {
        await onUpload(file);
      }
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteClick = async (docId) => {
    if (deleteConfirm === docId) {
      // Second click - actually delete
      await onDelete(docId);
      setDeleteConfirm(null);
      if (expandedDoc === docId) {
        setExpandedDoc(null);
      }
    } else {
      // First click - set confirmation state
      setDeleteConfirm(docId);
      // Reset confirmation after 3 seconds
      setTimeout(() => {
        setDeleteConfirm(null);
      }, 3000);
    }
  };

  const handleToggleExpand = (docId) => {
    setExpandedDoc(expandedDoc === docId ? null : docId);
  };

  const activeCount = documents.filter(doc => doc.is_active).length;

  return (
    <div className="document-panel">
      <div className="document-panel-header">
        <h2>Documents</h2>
        <button
          className="close-button"
          onClick={onClose}
          aria-label="Close panel"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="document-panel-content">
        {/* Upload Section */}
        <div className="upload-section">
          <input
            ref={fileInputRef}
            type="file"
            className="file-input"
            onChange={handleFileSelect}
            accept=".pdf,.docx,.doc,.txt,.rtf,.pptx,.ppt,.png,.jpg,.jpeg,.gif,.webp,.md"
            multiple
            disabled={isUploading}
          />
          <div
            className={`upload-area ${isUploading ? 'uploading' : ''}`}
            onClick={() => !isUploading && fileInputRef.current?.click()}
          >
            {isUploading ? (
              <>
                <div className="spinner"></div>
                <span className="upload-text">Uploading...</span>
              </>
            ) : (
              <>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span className="upload-text">Click to upload documents</span>
                <span className="upload-hint">
                  PDF, DOCX, TXT, RTF, PPTX, Images, Markdown
                </span>
              </>
            )}
          </div>
        </div>

        {/* Documents List */}
        <div className="documents-list">
          {documents.length === 0 ? (
            <div className="empty-documents">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <p>No documents uploaded yet</p>
            </div>
          ) : (
            documents.map((doc) => (
              <div
                key={doc.id}
                className={`document-item ${doc.is_active ? 'active' : 'inactive'}`}
              >
                <div className="document-main">
                  <div className="document-icon">
                    {getFileIcon(doc.extension)}
                  </div>
                  <div className="document-info">
                    <div className="document-filename" title={doc.filename}>
                      {doc.filename}
                    </div>
                    <div className="document-metadata">
                      {formatFileSize(doc.size)} • {doc.text_length.toLocaleString()} chars •{' '}
                      {new Date(doc.uploaded_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="document-actions">
                    <label className="toggle-switch" title={doc.is_active ? 'Active' : 'Inactive'}>
                      <input
                        type="checkbox"
                        checked={doc.is_active}
                        onChange={(e) => onToggle(doc.id, e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                    <button
                      className="expand-button"
                      onClick={() => handleToggleExpand(doc.id)}
                      aria-label={expandedDoc === doc.id ? 'Collapse preview' : 'Expand preview'}
                      title="Preview"
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        style={{
                          transform: expandedDoc === doc.id ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s',
                        }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    <button
                      className={`delete-button ${deleteConfirm === doc.id ? 'confirm' : ''}`}
                      onClick={() => handleDeleteClick(doc.id)}
                      aria-label="Delete document"
                      title={deleteConfirm === doc.id ? 'Click again to confirm' : 'Delete'}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
                {expandedDoc === doc.id && (
                  <div className="document-preview">
                    <div className="preview-label">Text Preview:</div>
                    <div className="preview-text">{doc.preview}</div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="document-panel-footer">
        <span className="active-count">
          {activeCount} of {documents.length} active
        </span>
      </div>
    </div>
  );
}
