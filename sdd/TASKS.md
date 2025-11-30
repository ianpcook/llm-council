# Multi-Turn Conversation Tasks

This document breaks down the implementation plan into discrete, well-scoped tasks suitable for individual commits.

---

## Task Overview

| # | Task | File(s) | Depends On | Status |
|---|------|---------|------------|--------|
| 1 | Add history helper functions to council.py | `backend/council.py` | - | ✅ DONE |
| 2 | Add chairman-only chat function | `backend/council.py` | 1 | ✅ DONE |
| 3 | Update Stage 1 to accept conversation history | `backend/council.py` | 1 | ✅ DONE |
| 4 | Update Stage 2 to accept conversation context | `backend/council.py` | 1 | ✅ DONE |
| 5 | Update Stage 3 to accept conversation context | `backend/council.py` | 1 | ✅ DONE |
| 6 | Update run_full_council to pass history through | `backend/council.py` | 3, 4, 5 | ✅ DONE |
| 7 | Add chairman message storage function | `backend/storage.py` | - | ✅ DONE |
| 8 | Add history builder and update MessageRequest | `backend/main.py` | - | ✅ DONE |
| 9 | Update non-streaming endpoint with mode routing | `backend/main.py` | 2, 6, 7, 8 | ✅ DONE |
| 10 | Update streaming endpoint with mode routing | `backend/main.py` | 2, 6, 7, 8 | ✅ DONE |
| 11 | Add mode parameter to API client | `frontend/src/api.js` | - | ✅ DONE |
| 12 | Add mode state and selector UI | `frontend/src/components/ChatInterface.jsx`, `.css` | - | ✅ DONE |
| 13 | Always show input form (remove conditional) | `frontend/src/components/ChatInterface.jsx` | - | ✅ DONE |
| 14 | Add chairman response rendering | `frontend/src/components/ChatInterface.jsx`, `.css` | - | ✅ DONE |
| 15 | Update App.jsx to handle mode and chairman responses | `frontend/src/App.jsx` | 11, 12, 14 | ✅ DONE |
| 16 | End-to-end testing and verification | - | All | ✅ DONE |

---

## Task Details

### Task 1: Add history helper functions to council.py

**File:** `backend/council.py`

**Description:**
Add the `format_history_summary()` helper function that converts conversation history into a brief text summary for use in prompts.

**Changes:**
- Add import for `List, Dict` from typing if not present
- Add `format_history_summary(history: List[Dict[str, str]], max_turns: int = 3) -> str` function

**Code:**
```python
def format_history_summary(history: List[Dict[str, str]], max_turns: int = 3) -> str:
    """Format recent conversation history as a brief summary string."""
    recent = history[-(max_turns * 2):]  # Last N turns (user + assistant pairs)
    lines = []
    for msg in recent:
        role = "User" if msg["role"] == "user" else "Assistant"
        content = msg["content"][:500] + "..." if len(msg["content"]) > 500 else msg["content"]
        lines.append(f"{role}: {content}")
    return "\n".join(lines)
```

**Acceptance Criteria:**
- Function exists and is importable
- Returns empty string for empty history
- Truncates messages over 500 chars
- Only includes last N turns based on max_turns parameter

---

### Task 2: Add chairman-only chat function

**File:** `backend/council.py`

**Description:**
Add `chat_with_chairman()` function for direct conversation with the chairman model without running the full council pipeline.

**Changes:**
- Import `query_model` from `.openrouter` if not already imported
- Add `chat_with_chairman()` async function

**Code:**
```python
async def chat_with_chairman(
    user_query: str,
    conversation_history: List[Dict[str, str]]
) -> Dict[str, Any]:
    """
    Direct conversation with the chairman model only.
    Used for follow-up questions that don't need full council deliberation.
    """
    messages = list(conversation_history)
    messages.append({"role": "user", "content": user_query})

    response = await query_model(CHAIRMAN_MODEL, messages)

    return {
        "model": CHAIRMAN_MODEL,
        "response": response["content"] if response else "Failed to get response"
    }
```

**Acceptance Criteria:**
- Function is async
- Accepts user query and conversation history
- Returns dict with "model" and "response" keys
- Gracefully handles None response from query_model

---

### Task 3: Update Stage 1 to accept conversation history

**File:** `backend/council.py`

**Description:**
Modify `stage1_collect_responses()` to accept an optional `conversation_history` parameter and prepend it to the messages sent to models.

**Changes:**
- Add `conversation_history: List[Dict[str, str]] = None` parameter
- Build messages list from history + new query
- Pass messages list to `query_models_parallel()`

**Before:**
```python
async def stage1_collect_responses(user_query: str) -> List[Dict[str, Any]]:
    messages = [{"role": "user", "content": user_query}]
    responses = await query_models_parallel(COUNCIL_MODELS, messages)
```

**After:**
```python
async def stage1_collect_responses(
    user_query: str,
    conversation_history: List[Dict[str, str]] = None
) -> List[Dict[str, Any]]:
    messages = list(conversation_history or [])
    messages.append({"role": "user", "content": user_query})
    responses = await query_models_parallel(COUNCIL_MODELS, messages)
```

**Acceptance Criteria:**
- Function signature updated with optional parameter
- Backward compatible (works without history)
- History messages prepended before user query

---

### Task 4: Update Stage 2 to accept conversation context

**File:** `backend/council.py`

**Description:**
Modify `stage2_collect_rankings()` to accept an optional `conversation_context` string and include it in the ranking prompt.

**Changes:**
- Add `conversation_context: str = None` parameter
- Modify prompt construction to include context when provided

**Code changes:**
```python
async def stage2_collect_rankings(
    user_query: str,
    stage1_results: List[Dict[str, Any]],
    conversation_context: str = None
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    # ... existing setup code ...

    context_section = ""
    if conversation_context:
        context_section = f"""
CONVERSATION CONTEXT:
This is a follow-up question. Here is the recent conversation history:
{conversation_context}

"""

    prompt = f"""{context_section}You are evaluating responses to the following question:
"{user_query}"
... rest of existing prompt ...
"""
```

**Acceptance Criteria:**
- Function signature updated with optional parameter
- Backward compatible (works without context)
- Context included in prompt when provided
- Context clearly labeled in prompt

---

### Task 5: Update Stage 3 to accept conversation context

**File:** `backend/council.py`

**Description:**
Modify `stage3_synthesize_final()` to accept an optional `conversation_context` string and include it in the synthesis prompt.

**Changes:**
- Add `conversation_context: str = None` parameter
- Modify prompt construction to include context when provided

**Code changes:**
```python
async def stage3_synthesize_final(
    user_query: str,
    stage1_results: List[Dict[str, Any]],
    stage2_results: List[Dict[str, Any]],
    conversation_context: str = None
) -> Dict[str, Any]:
    # ... existing setup code ...

    context_section = ""
    if conversation_context:
        context_section = f"""
CONVERSATION CONTEXT:
This is a follow-up question. Here is the recent conversation history:
{conversation_context}

"""

    prompt = f"""{context_section}You are the chairman synthesizing a final answer...
... rest of existing prompt ...
"""
```

**Acceptance Criteria:**
- Function signature updated with optional parameter
- Backward compatible (works without context)
- Context included in prompt when provided

---

### Task 6: Update run_full_council to pass history through

**File:** `backend/council.py`

**Description:**
Update `run_full_council()` to accept conversation history and pass it appropriately to each stage.

**Changes:**
- Add `conversation_history: List[Dict[str, str]] = None` parameter
- Generate context summary from history
- Pass history to stage1, context summary to stage2 and stage3

**Code:**
```python
async def run_full_council(
    user_query: str,
    conversation_history: List[Dict[str, str]] = None
) -> Tuple[List, List, Dict, Dict, List]:
    """
    Run the full 3-stage council deliberation.
    Now accepts optional conversation history for multi-turn context.
    """
    context_summary = None
    if conversation_history:
        context_summary = format_history_summary(conversation_history)

    stage1_results = await stage1_collect_responses(user_query, conversation_history)
    stage2_results, label_to_model = await stage2_collect_rankings(
        user_query, stage1_results, context_summary
    )
    stage3_result = await stage3_synthesize_final(
        user_query, stage1_results, stage2_results, context_summary
    )
    aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)

    return stage1_results, stage2_results, stage3_result, label_to_model, aggregate_rankings
```

**Acceptance Criteria:**
- Function signature updated
- Backward compatible
- History passed to stage1
- Context summary passed to stage2 and stage3

---

### Task 7: Add chairman message storage function

**File:** `backend/storage.py`

**Description:**
Add `add_chairman_message()` function to store chairman-only responses in conversations.

**Changes:**
- Add new function following existing patterns

**Code:**
```python
def add_chairman_message(conversation_id: str, chairman_response: Dict[str, Any]) -> None:
    """Add a chairman-only assistant message to a conversation."""
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation {conversation_id} not found")

    conversation["messages"].append({
        "role": "assistant",
        "chairman_response": chairman_response
    })
    save_conversation(conversation)
```

**Acceptance Criteria:**
- Function follows existing code patterns
- Raises ValueError for missing conversation (consistent with other functions)
- Stores chairman_response in message object

---

### Task 8: Add history builder and update MessageRequest

**File:** `backend/main.py`

**Description:**
Add `build_conversation_history()` helper function and update `MessageRequest` model to accept optional `mode` parameter.

**Changes:**
- Update MessageRequest Pydantic model
- Add build_conversation_history function

**Code:**
```python
from typing import Optional

class MessageRequest(BaseModel):
    content: str
    mode: Optional[str] = None  # "chairman" or "council"

def build_conversation_history(messages: List[Dict]) -> List[Dict[str, str]]:
    """Convert stored messages to OpenRouter chat format."""
    history = []
    for msg in messages:
        if msg["role"] == "user":
            history.append({"role": "user", "content": msg["content"]})
        elif msg["role"] == "assistant":
            if msg.get("stage3"):
                history.append({"role": "assistant", "content": msg["stage3"]["response"]})
            elif msg.get("chairman_response"):
                history.append({"role": "assistant", "content": msg["chairman_response"]["response"]})
    return history
```

**Acceptance Criteria:**
- MessageRequest accepts optional mode field
- build_conversation_history handles both message types
- Returns proper chat format for OpenRouter

---

### Task 9: Update non-streaming endpoint with mode routing

**File:** `backend/main.py`

**Description:**
Update `send_message()` endpoint to support mode selection and route to appropriate handler.

**Changes:**
- Import `chat_with_chairman` and `add_chairman_message`
- Add mode detection and routing logic
- Return appropriate response format based on mode

**Code changes to endpoint:**
```python
@app.post("/api/conversations/{conversation_id}/message")
async def send_message(conversation_id: str, request: MessageRequest):
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    add_user_message(conversation_id, request.content)

    # Build conversation history
    history = build_conversation_history(conversation["messages"])

    # Determine mode
    is_first_message = len(conversation["messages"]) == 0
    mode = "council" if is_first_message else (request.mode or "chairman")

    if mode == "council":
        stage1, stage2, stage3, label_to_model, aggregate = await run_full_council(
            request.content,
            history if not is_first_message else None
        )
        add_assistant_message(conversation_id, stage1, stage2, stage3)

        # Generate title if first message
        if is_first_message:
            title = await generate_conversation_title(request.content)
            update_conversation_title(conversation_id, title)

        return {
            "stage1": stage1,
            "stage2": stage2,
            "stage3": stage3,
            "metadata": {
                "label_to_model": label_to_model,
                "aggregate_rankings": aggregate
            },
            "mode": "council"
        }
    else:
        result = await chat_with_chairman(request.content, history)
        add_chairman_message(conversation_id, result)
        return {
            "chairman_response": result,
            "mode": "chairman"
        }
```

**Acceptance Criteria:**
- First message always runs council mode
- Subsequent messages default to chairman mode
- Mode can be overridden via request parameter
- Response includes mode field

---

### Task 10: Update streaming endpoint with mode routing

**File:** `backend/main.py`

**Description:**
Update `send_message_stream()` endpoint to support mode selection with appropriate SSE events.

**Changes:**
- Add mode detection logic
- Add chairman-specific SSE events
- Route to appropriate handler in generator

**New SSE events for chairman mode:**
- `chairman_start`: Indicates chairman response starting
- `chairman_complete`: Contains the chairman response

**Code changes:**
```python
@app.post("/api/conversations/{conversation_id}/message/stream")
async def send_message_stream(conversation_id: str, request: MessageRequest):
    # ... existing validation ...

    async def generate():
        try:
            history = build_conversation_history(conversation["messages"])
            is_first_message = len(conversation["messages"]) == 0
            mode = "council" if is_first_message else (request.mode or "chairman")

            add_user_message(conversation_id, request.content)

            if mode == "chairman":
                yield f"data: {json.dumps({'type': 'chairman_start'})}\n\n"

                result = await chat_with_chairman(request.content, history)
                add_chairman_message(conversation_id, result)

                yield f"data: {json.dumps({'type': 'chairman_complete', 'data': result})}\n\n"
                yield f"data: {json.dumps({'type': 'complete', 'mode': 'chairman'})}\n\n"
            else:
                # Existing 3-stage streaming logic
                yield f"data: {json.dumps({'type': 'stage1_start'})}\n\n"
                stage1 = await stage1_collect_responses(
                    request.content,
                    history if not is_first_message else None
                )
                # ... rest of existing stage logic with history passed through ...

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
```

**Acceptance Criteria:**
- Chairman mode emits chairman_start and chairman_complete events
- Mode detection matches non-streaming endpoint
- Existing council streaming logic preserved
- Error handling maintained

---

### Task 11: Add mode parameter to API client

**File:** `frontend/src/api.js`

**Description:**
Update the frontend API client to accept and pass mode parameter.

**Changes:**
- Update `sendMessage()` to accept mode parameter
- Update `sendMessageStream()` to accept mode parameter

**Code:**
```javascript
async sendMessage(conversationId, content, mode = null) {
  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, mode }),
  });
  if (!response.ok) {
    throw new Error('Failed to send message');
  }
  return response.json();
},

async sendMessageStream(conversationId, content, mode, onEvent) {
  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/message/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, mode }),
  });
  // ... rest of streaming logic unchanged ...
}
```

**Acceptance Criteria:**
- Both methods accept optional mode parameter
- Mode included in request body
- Backward compatible (mode can be null/undefined)

---

### Task 12: Add mode state and selector UI

**Files:** `frontend/src/components/ChatInterface.jsx`, `frontend/src/components/ChatInterface.css`

**Description:**
Add state for tracking selected mode and render a mode selector UI after the first message.

**JSX changes:**
```jsx
import { useState } from 'react';

function ChatInterface({ conversation, onSendMessage, isLoading }) {
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState('chairman');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim() && !isLoading) {
      onSendMessage(message, mode);
      setMessage('');
    }
  };

  return (
    <div className="chat-interface">
      {/* ... existing message rendering ... */}

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

      {/* ... input form ... */}
    </div>
  );
}
```

**CSS additions:**
```css
.mode-selector {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 12px;
  background: #f5f5f5;
  border-radius: 4px;
  margin-bottom: 8px;
  font-size: 14px;
}

.mode-selector .mode-label {
  color: #666;
  font-weight: 500;
}

.mode-selector label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.mode-selector input[type="radio"] {
  margin: 0;
}
```

**Acceptance Criteria:**
- Mode state initialized to "chairman"
- Selector only shown after first message
- Radio buttons toggle mode state
- Mode passed to onSendMessage callback

---

### Task 13: Always show input form (remove conditional)

**File:** `frontend/src/components/ChatInterface.jsx`

**Description:**
Remove the conditional rendering that hides the input form after the first message.

**Before:**
```jsx
{conversation.messages.length === 0 && (
  <form className="input-form" onSubmit={handleSubmit}>
    ...
  </form>
)}
```

**After:**
```jsx
<form className="input-form" onSubmit={handleSubmit}>
  <textarea
    value={message}
    onChange={(e) => setMessage(e.target.value)}
    onKeyDown={handleKeyDown}
    placeholder="Ask a question..."
    rows={3}
    disabled={isLoading}
  />
  <button type="submit" disabled={isLoading || !message.trim()}>
    {mode === 'council' ? 'Ask Council' : 'Send'}
  </button>
</form>
```

**Acceptance Criteria:**
- Input form visible for all messages
- Button text changes based on mode
- Disabled states preserved

---

### Task 14: Add chairman response rendering

**Files:** `frontend/src/components/ChatInterface.jsx`, `frontend/src/components/ChatInterface.css`

**Description:**
Update message rendering to handle chairman-only responses alongside full council responses.

**JSX changes:**
```jsx
import ReactMarkdown from 'react-markdown';

// In message rendering section:
{msg.role === 'assistant' && (
  msg.stage1 ? (
    // Full council response
    <>
      <Stage1 data={msg.stage1} isLoading={false} />
      <Stage2
        data={msg.stage2}
        isLoading={false}
        labelToModel={metadata?.label_to_model}
        aggregateRankings={metadata?.aggregate_rankings}
      />
      <Stage3 data={msg.stage3} isLoading={false} />
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
  ) : null
)}
```

**CSS additions:**
```css
.chairman-response {
  background: #f8f8ff;
  border-radius: 8px;
  padding: 16px;
  border-left: 3px solid #4a90e2;
}

.chairman-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.chairman-badge {
  background: #4a90e2;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.chairman-model {
  font-size: 12px;
  color: #666;
}
```

**Acceptance Criteria:**
- Chairman responses render with distinct styling
- Model name displayed
- Markdown content properly rendered
- Visual distinction from council responses

---

### Task 15: Update App.jsx to handle mode and chairman responses

**File:** `frontend/src/App.jsx`

**Description:**
Update App.jsx to pass mode to API calls and handle chairman response events in streaming.

**Changes:**
- Update handleSendMessage to accept and pass mode
- Handle chairman_start and chairman_complete events
- Update optimistic message creation for chairman mode

**Code:**
```jsx
const handleSendMessage = async (content, mode) => {
  if (!currentConversationId) return;

  // Optimistic update - add user message
  setCurrentConversation(prev => ({
    ...prev,
    messages: [...prev.messages, { role: 'user', content }]
  }));

  setIsLoading(true);

  // Add placeholder assistant message
  const isFirstMessage = currentConversation.messages.length === 0;
  const effectiveMode = isFirstMessage ? 'council' : mode;

  if (effectiveMode === 'chairman') {
    setCurrentConversation(prev => ({
      ...prev,
      messages: [...prev.messages, {
        role: 'assistant',
        chairman_response: null,
        isLoading: true
      }]
    }));
  } else {
    // Existing council placeholder logic
    setCurrentConversation(prev => ({
      ...prev,
      messages: [...prev.messages, {
        role: 'assistant',
        stage1: null,
        stage2: null,
        stage3: null,
        isLoading: true
      }]
    }));
  }

  try {
    await api.sendMessageStream(currentConversationId, content, mode, (eventType, event) => {
      if (eventType === 'chairman_complete') {
        setCurrentConversation(prev => {
          const messages = [...prev.messages];
          const lastIdx = messages.length - 1;
          messages[lastIdx] = {
            ...messages[lastIdx],
            chairman_response: event.data,
            isLoading: false
          };
          return { ...prev, messages };
        });
      } else if (eventType === 'stage1_complete') {
        // ... existing logic ...
      }
      // ... rest of existing event handlers ...
    });
  } catch (error) {
    console.error('Failed to send message:', error);
  } finally {
    setIsLoading(false);
  }
};

// Update ChatInterface props
<ChatInterface
  conversation={currentConversation}
  onSendMessage={handleSendMessage}
  isLoading={isLoading}
  metadata={currentMetadata}
/>
```

**Acceptance Criteria:**
- Mode passed through to API
- Chairman events handled correctly
- Optimistic updates work for both modes
- Loading states managed properly

---

### Task 16: End-to-end testing and verification

**Description:**
Manual testing to verify all functionality works correctly.

**Test Cases:**

1. **New conversation, first message**
   - Create new conversation
   - Send message
   - Verify full council runs (3 stages displayed)
   - Verify title generated

2. **Follow-up in chairman mode (default)**
   - After first message, verify mode selector appears
   - Verify "chairman" is selected by default
   - Send follow-up message
   - Verify only chairman response appears
   - Verify it references conversation context

3. **Follow-up in council mode**
   - Select "Ask Full Council" mode
   - Send follow-up message
   - Verify full 3-stage pipeline runs
   - Verify responses reference previous conversation

4. **Mixed conversation**
   - Alternate between chairman and council modes
   - Verify history maintained correctly
   - Verify both response types render properly

5. **Reload conversation**
   - Close and reopen a conversation with mixed responses
   - Verify both chairman and council messages render
   - Verify mode selector works for new messages

6. **Error handling**
   - Test with network issues
   - Verify graceful degradation

**Acceptance Criteria:**
- All test cases pass
- No console errors
- Responsive UI during loading states
- Proper error messages when failures occur

---

## Implementation Order

Recommended order for minimal merge conflicts:

1. **Backend foundation** (Tasks 1, 7, 8) - Can be done in parallel
2. **Backend council updates** (Tasks 2, 3, 4, 5) - Can be done in parallel after Task 1
3. **Backend orchestration** (Task 6) - After Tasks 2-5
4. **Backend endpoints** (Tasks 9, 10) - After Task 6
5. **Frontend API** (Task 11) - Can start in parallel with backend
6. **Frontend UI** (Tasks 12, 13, 14) - Can be done in parallel
7. **Frontend integration** (Task 15) - After Tasks 11-14
8. **Testing** (Task 16) - Final step

Total: 16 tasks, approximately 8 can be parallelized in pairs.
