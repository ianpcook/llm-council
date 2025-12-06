import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Stage1 from './Stage1';
import Stage2 from './Stage2';
import Stage3 from './Stage3';
import DocumentPanel from './DocumentPanel';
import './ChatInterface.css';

export default function ChatInterface({
  conversation,
  onSendMessage,
  onCancelRequest,     // () => void - cancels in-progress request
  isLoading,
  documents,           // Array of document metadata
  onDocumentUpload,    // (file) => Promise
  onDocumentDelete,    // (docId) => Promise
  onDocumentToggle,    // (docId, isActive) => Promise
}) {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('chairman');
  const [showDocuments, setShowDocuments] = useState(false);
  const [includeDocuments, setIncludeDocuments] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const activeDocuments = documents?.filter(d => d.is_active) || [];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      try {
        await onDocumentUpload(file);
      } catch (error) {
        console.error('Failed to upload:', file.name);
      }
    }
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      try {
        await onDocumentUpload(file);
      } catch (error) {
        console.error('Failed to upload:', file.name);
      }
    }
    e.target.value = '';
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input, mode, includeDocuments);
      setInput('');
    }
  };

  const handleKeyDown = (e) => {
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (!conversation) {
    return (
      <div className="chat-interface">
        <div className="empty-state">
          <h2>Welcome to LLM Council</h2>
          <p>Create a new conversation to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="chat-interface"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="drop-overlay">
          <div className="drop-content">
            <span>Drop files to upload</span>
          </div>
        </div>
      )}

      {documents?.length > 0 && (
        <button
          className="documents-toggle"
          onClick={() => setShowDocuments(!showDocuments)}
        >
          📄 {activeDocuments.length} Active
        </button>
      )}

      {showDocuments && (
        <DocumentPanel
          documents={documents || []}
          onUpload={onDocumentUpload}
          onDelete={onDocumentDelete}
          onToggle={onDocumentToggle}
          onClose={() => setShowDocuments(false)}
        />
      )}

      <div className="messages-container">
        {conversation.messages.length === 0 ? (
          <div className="empty-state">
            <h2>Start a conversation</h2>
            <p>Ask a question to consult the LLM Council</p>
          </div>
        ) : (
          conversation.messages.map((msg, index) => (
            <div key={index} className="message-group">
              {msg.role === 'user' ? (
                <div className="user-message">
                  <div className="message-label">You</div>
                  <div className="message-content">
                    <div className="markdown-content">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="assistant-message">
                  <div className="message-label">LLM Council</div>

                  {msg.stage1 ? (
                    // Full council response
                    <>
                      {/* Stage 1 */}
                      {msg.loading?.stage1 && (
                        <div className="stage-loading">
                          <div className="spinner"></div>
                          <span>Running Stage 1: Collecting individual responses...</span>
                        </div>
                      )}
                      {msg.stage1 && <Stage1 responses={msg.stage1} />}

                      {/* Stage 2 */}
                      {msg.loading?.stage2 && (
                        <div className="stage-loading">
                          <div className="spinner"></div>
                          <span>Running Stage 2: Peer rankings...</span>
                        </div>
                      )}
                      {msg.stage2 && (
                        <Stage2
                          rankings={msg.stage2}
                          labelToModel={msg.metadata?.label_to_model}
                          aggregateRankings={msg.metadata?.aggregate_rankings}
                        />
                      )}

                      {/* Stage 3 */}
                      {msg.loading?.stage3 && (
                        <div className="stage-loading">
                          <div className="spinner"></div>
                          <span>Running Stage 3: Final synthesis...</span>
                        </div>
                      )}
                      {msg.stage3 && <Stage3 finalResponse={msg.stage3} />}
                    </>
                  ) : msg.chairman_response ? (
                    // Chairman-only response
                    <div className="chairman-response">
                      <div className="chairman-header">
                        <span className="chairman-badge">Chairman</span>
                        <span className="chairman-model">{msg.chairman_response.model}</span>
                      </div>
                      <div className="markdown-content">
                        <ReactMarkdown>{msg.chairman_response.response}</ReactMarkdown>
                      </div>
                    </div>
                  ) : msg.cancelled ? (
                    // Cancelled response
                    <div className="cancelled-response">
                      <span className="cancelled-badge">Cancelled</span>
                      <span className="cancelled-text">Response was cancelled by user</span>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))
        )}

        {isLoading && (
          <div className="loading-indicator">
            <div className="spinner"></div>
            <span>Consulting the council...</span>
            <button
              type="button"
              className="cancel-button"
              onClick={onCancelRequest}
              title="Cancel request"
            >
              Cancel
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {conversation.messages.length > 0 && (
        <div className="mode-selector">
          <span className="mode-label">Response mode:</span>
          <label>
            <input
              type="radio"
              name="mode"
              value="chairman"
              checked={mode === 'chairman'}
              onChange={() => setMode('chairman')}
            />
            Continue with Chairman
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              value="council"
              checked={mode === 'council'}
              onChange={() => setMode('council')}
            />
            Ask Full Council
          </label>
        </div>
      )}

      <form className="input-form" onSubmit={handleSubmit}>
        {activeDocuments.length > 0 && (
          <div className="document-context-bar">
            <label className="include-docs-toggle">
              <input
                type="checkbox"
                checked={includeDocuments}
                onChange={(e) => setIncludeDocuments(e.target.checked)}
              />
              <span>Include {activeDocuments.length} document{activeDocuments.length !== 1 ? 's' : ''}</span>
            </label>
          </div>
        )}
        <textarea
          className="message-input"
          placeholder="Ask your question... (Shift+Enter for new line, Enter to send)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          rows={3}
        />
        <button
          type="button"
          className="upload-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Upload document"
        >
          📎
        </button>
        <button
          type="submit"
          className="send-button"
          disabled={!input.trim() || isLoading}
        >
          {mode === 'council' && conversation.messages.length > 0 ? 'Ask Council' : 'Send'}
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          multiple
          accept=".pdf,.docx,.txt,.md,.pptx,.png,.jpg,.jpeg,.gif,.webp"
          style={{ display: 'none' }}
        />
      </form>
    </div>
  );
}
