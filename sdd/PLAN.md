# Multi-Turn Conversation Plan

## Overview

This document describes the unified plan for adding multi-turn conversation support to LLM Council. The key innovation is **mode selection**: after the first message (which always runs full council deliberation), users can choose between quick chairman-only follow-ups or re-running the full council pipeline.

---

## Core Concept

After the first message (which always runs the full 3-stage council), subsequent messages offer a choice:

1. **Chairman Mode (default):** Quick follow-up with just the chairman model, preserving conversation context. Returns only a simplified assistant response.
2. **Council Mode:** Re-runs the full 3-stage deliberation pipeline for the new question with history context.

---

## Backend Changes

### 1. Add Chairman-Only Chat Function (`backend/council.py`)

Add a lightweight function for direct chairman conversation:

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

### 2. Update Stage Functions to Accept History (`backend/council.py`)

Modify existing functions to include conversation context:

```python
async def stage1_collect_responses(
    user_query: str,
    conversation_history: List[Dict[str, str]] = None
) -> List[Dict[str, Any]]:
    # Build messages with history + new query
    messages = list(conversation_history or [])
    messages.append({"role": "user", "content": user_query})

    responses = await query_models_parallel(COUNCIL_MODELS, messages)
    # ... rest unchanged
```

For Stage 2 and Stage 3, embed a brief context note in the system prompt when history exists, rather than sending full message history (since these stages use custom prompts, not raw chat):

```python
async def stage2_collect_rankings(
    user_query: str,
    stage1_results: List[Dict[str, Any]],
    conversation_context: str = None  # Brief summary for context
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    # Prepend context to prompt if provided
    context_prefix = f"[Context: This is a follow-up question. Previous conversation summary:\n{conversation_context}\n\n]" if conversation_context else ""
    # ... modify prompt construction
```

### 3. Update `run_full_council` (`backend/council.py`)

```python
async def run_full_council(
    user_query: str,
    conversation_history: List[Dict[str, str]] = None
) -> Tuple[List, List, Dict, Dict, List]:
    """
    Run the full 3-stage council deliberation.
    Now accepts optional conversation history for multi-turn context.
    """
    # Build context summary for Stage 2/3 prompts (not full history)
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

Add helper function:

```python
def format_history_summary(history: List[Dict[str, str]], max_turns: int = 3) -> str:
    """Format recent conversation history as a brief summary string."""
    recent = history[-(max_turns * 2):]  # Last N turns (user + assistant pairs)
    lines = []
    for msg in recent:
        role = "User" if msg["role"] == "user" else "Assistant"
        # Truncate long messages
        content = msg["content"][:500] + "..." if len(msg["content"]) > 500 else msg["content"]
        lines.append(f"{role}: {content}")
    return "\n".join(lines)
```

### 4. Update API Endpoints (`backend/main.py`)

Modify the message endpoints to:
1. Accept a `mode` parameter ("chairman" or "council", default "chairman")
2. Build conversation history from stored messages
3. Route to appropriate handler

```python
@app.post("/api/conversations/{conversation_id}/message")
async def send_message(conversation_id: str, request: MessageRequest):
    # ... existing validation

    # Build conversation history
    history = build_conversation_history(conversation["messages"])

    # Check mode (default to "chairman" for follow-ups, "council" for first message)
    is_first_message = len(conversation["messages"]) == 0
    mode = "council" if is_first_message else request.mode or "chairman"

    if mode == "council":
        # Full 3-stage pipeline
        stage1, stage2, stage3, label_to_model, aggregate = await run_full_council(
            request.content, history if not is_first_message else None
        )
        add_assistant_message(conversation_id, stage1, stage2, stage3)
        return {
            "stage1": stage1, "stage2": stage2, "stage3": stage3,
            "metadata": {"label_to_model": label_to_model, "aggregate_rankings": aggregate},
            "mode": "council"
        }
    else:
        # Chairman-only response
        result = await chat_with_chairman(request.content, history)
        add_chairman_message(conversation_id, result)  # New storage function
        return {
            "chairman_response": result,
            "mode": "chairman"
        }

def build_conversation_history(messages: List[Dict]) -> List[Dict[str, str]]:
    """Convert stored messages to OpenRouter chat format."""
    history = []
    for msg in messages:
        if msg["role"] == "user":
            history.append({"role": "user", "content": msg["content"]})
        elif msg["role"] == "assistant":
            # Use stage3 response if available (council mode), else chairman_response
            if msg.get("stage3"):
                history.append({"role": "assistant", "content": msg["stage3"]["response"]})
            elif msg.get("chairman_response"):
                history.append({"role": "assistant", "content": msg["chairman_response"]["response"]})
    return history
```

Update `MessageRequest` model:

```python
class MessageRequest(BaseModel):
    content: str
    mode: Optional[str] = None  # "chairman" or "council"
```

### 5. Update Storage (`backend/storage.py`)

Add function to store chairman-only responses:

```python
def add_chairman_message(conversation_id: str, chairman_response: Dict[str, Any]) -> None:
    """Add a chairman-only assistant message to a conversation."""
    conversation = get_conversation(conversation_id)
    conversation["messages"].append({
        "role": "assistant",
        "chairman_response": chairman_response
        # No stage1, stage2, stage3 for chairman-only messages
    })
    save_conversation(conversation)
```

---

## Frontend Changes

### 1. Add Mode Toggle UI (`frontend/src/components/ChatInterface.jsx`)

After the first message, show a mode selector above the input:

```jsx
{conversation.messages.length > 0 && (
  <div className="mode-selector">
    <label>
      <input
        type="radio"
        name="mode"
        value="chairman"
        checked={mode === "chairman"}
        onChange={() => setMode("chairman")}
      />
      Continue with Chairman
    </label>
    <label>
      <input
        type="radio"
        name="mode"
        value="council"
        checked={mode === "council"}
        onChange={() => setMode("council")}
      />
      Ask the Full Council
    </label>
  </div>
)}
```

### 2. Always Show Input Form (`frontend/src/components/ChatInterface.jsx`)

Remove the conditional that hides input after first message:

```jsx
{/* Always show input form */}
<form className="input-form" onSubmit={handleSubmit}>
  <textarea ... />
  <button type="submit" disabled={isLoading}>
    {mode === "council" ? "Ask Council" : "Send"}
  </button>
</form>
```

### 3. Update Message Rendering (`frontend/src/components/ChatInterface.jsx`)

Handle both message types:

```jsx
{msg.role === "assistant" && (
  msg.stage1 ? (
    // Full council response - render all stages
    <>
      <Stage1 ... />
      <Stage2 ... />
      <Stage3 ... />
    </>
  ) : msg.chairman_response ? (
    // Chairman-only response - simple display
    <div className="chairman-response">
      <div className="model-badge">{msg.chairman_response.model}</div>
      <div className="markdown-content">
        <ReactMarkdown>{msg.chairman_response.response}</ReactMarkdown>
      </div>
    </div>
  ) : null
)}
```

### 4. Update API Client (`frontend/src/api.js`)

Add mode parameter to send functions:

```javascript
async sendMessage(conversationId, content, mode = null) {
  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, mode }),
  });
  return response.json();
}

async sendMessageStream(conversationId, content, mode, onEvent) {
  // ... similar update
}
```

### 5. Update App.jsx

Pass mode through to API calls and handle both response types:

```javascript
const handleSendMessage = async (content, mode) => {
  // ... existing optimistic update

  await api.sendMessageStream(currentConversationId, content, mode, (eventType, event) => {
    if (event.mode === "chairman") {
      // Handle chairman-only response
      // ...
    } else {
      // Handle full council response (existing logic)
      // ...
    }
  });
};
```

---

## Streaming Endpoint Updates (`backend/main.py`)

The streaming endpoint needs similar mode handling:

```python
@app.post("/api/conversations/{conversation_id}/message/stream")
async def send_message_stream(conversation_id: str, request: MessageRequest):
    # ... setup

    async def generate():
        history = build_conversation_history(conversation["messages"])
        is_first_message = len(conversation["messages"]) == 0
        mode = "council" if is_first_message else request.mode or "chairman"

        if mode == "chairman":
            yield f"data: {json.dumps({'type': 'chairman_start'})}\n\n"
            result = await chat_with_chairman(request.content, history)
            add_chairman_message(conversation_id, result)
            yield f"data: {json.dumps({'type': 'chairman_complete', 'data': result, 'mode': 'chairman'})}\n\n"
        else:
            # Existing 3-stage streaming logic with history passed through
            yield f"data: {json.dumps({'type': 'stage1_start'})}\n\n"
            stage1 = await stage1_collect_responses(request.content, history if not is_first_message else None)
            # ... rest of existing flow

    return StreamingResponse(generate(), media_type="text/event-stream")
```

---

## CSS Additions (`frontend/src/components/ChatInterface.css`)

```css
.mode-selector {
  display: flex;
  gap: 16px;
  padding: 8px 12px;
  background: #f5f5f5;
  border-radius: 4px;
  margin-bottom: 8px;
  font-size: 14px;
}

.mode-selector label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.chairman-response {
  background: #f8f8ff;
  border-radius: 8px;
  padding: 16px;
}

.chairman-response .model-badge {
  font-size: 12px;
  color: #666;
  margin-bottom: 8px;
}
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `backend/council.py` | Add `chat_with_chairman()`, update stages to accept history, add `format_history_summary()` |
| `backend/main.py` | Add `mode` parameter, add `build_conversation_history()`, update both endpoints |
| `backend/storage.py` | Add `add_chairman_message()` |
| `frontend/src/api.js` | Add `mode` parameter to send functions |
| `frontend/src/App.jsx` | Pass mode, handle both response types |
| `frontend/src/components/ChatInterface.jsx` | Add mode selector, always show input, render chairman responses |
| `frontend/src/components/ChatInterface.css` | Style mode selector and chairman responses |

---

## What This Plan Deliberately Omits

1. **Token budget/summarization**: Over-engineering for MVP. Context limits can be addressed later if needed.
2. **New history.py module**: Unnecessary abstraction. Helper functions live where they're used.
3. **Schema changes to storage**: The existing structure accommodates both message types naturally.
4. **Breaking function signature changes**: History is an optional parameter, preserving backward compatibility.

---

## Verification Steps

1. Create new conversation, send first message -> Full council runs (3 stages)
2. Send follow-up in chairman mode -> Quick response from chairman only
3. Send follow-up in council mode -> Full 3-stage deliberation with history context
4. Verify council responses reference previous conversation context
5. Verify stored conversations can be reloaded with both message types displayed correctly
