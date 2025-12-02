"""FastAPI backend for LLM Council."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import uuid
import json
import asyncio

from . import storage
from . import personalities
from .storage import get_conversation, add_user_message, add_assistant_message, add_chairman_message, update_conversation_title
from .council import run_full_council, generate_conversation_title, stage1_collect_responses, stage2_collect_rankings, stage3_synthesize_final, calculate_aggregate_rankings, chat_with_chairman, format_history_summary
from .config import COUNCIL_MODELS, CHAIRMAN_MODEL

app = FastAPI(title="LLM Council API")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PersonalityConfig(BaseModel):
    """Configuration for personality assignments in a conversation."""
    mode: str  # "all_same" | "each_different" | "none"
    council_assignments: Optional[Dict[str, str]] = None  # model_id -> personality_id
    chairman_personality_id: Optional[str] = None
    shuffle_each_turn: bool = False


class Personality(BaseModel):
    """Personality data for API responses."""
    id: str
    name: str
    type: str  # "simple" | "detailed"
    role: str
    expertise: List[str] = []
    perspective: str = ""
    communication_style: str = ""


class CreatePersonalityRequest(BaseModel):
    """Request body for creating a personality."""
    name: str
    role: str
    type: str = "detailed"
    expertise: List[str] = []
    perspective: str = ""
    communication_style: str = ""


class CreateConversationRequest(BaseModel):
    """Request to create a new conversation."""
    personality_config: Optional[PersonalityConfig] = None


class MessageRequest(BaseModel):
    """Request to send a message in a conversation."""
    content: str
    mode: Optional[str] = None  # "chairman" or "council"


class ConversationMetadata(BaseModel):
    """Conversation metadata for list view."""
    id: str
    created_at: str
    title: str
    message_count: int


class Conversation(BaseModel):
    """Full conversation with all messages."""
    id: str
    created_at: str
    title: str
    messages: List[Dict[str, Any]]


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


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "service": "LLM Council API"}


@app.get("/api/config")
async def get_config():
    """Get council configuration (models list)."""
    return {
        "council_models": COUNCIL_MODELS,
        "chairman_model": CHAIRMAN_MODEL
    }


@app.get("/api/personalities", response_model=List[Personality])
async def list_personalities(type_filter: Optional[str] = None):
    """List all personalities with optional type filter."""
    results = personalities.list_personalities(type_filter=type_filter)
    return [Personality(**p) for p in results]


@app.get("/api/personalities/{personality_id}", response_model=Personality)
async def get_personality(personality_id: str):
    """Get a specific personality."""
    personality = personalities.get_personality(personality_id)
    if personality is None:
        raise HTTPException(status_code=404, detail="Personality not found")
    return Personality(**personality)


@app.post("/api/personalities", response_model=Personality, status_code=201)
async def create_personality(request: CreatePersonalityRequest):
    """Create a new personality."""
    try:
        result = personalities.create_personality(
            name=request.name,
            role=request.role,
            personality_type=request.type,
            expertise=request.expertise,
            perspective=request.perspective,
            communication_style=request.communication_style
        )
        return Personality(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.put("/api/personalities/{personality_id}", response_model=Personality)
async def update_personality(personality_id: str, request: CreatePersonalityRequest):
    """Update an existing personality."""
    updated = personalities.update_personality(
        personality_id,
        name=request.name,
        role=request.role,
        type=request.type,
        expertise=request.expertise,
        perspective=request.perspective,
        communication_style=request.communication_style
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Personality not found")
    return Personality(**updated)


@app.delete("/api/personalities/{personality_id}")
async def delete_personality(personality_id: str):
    """Delete a personality."""
    if not personalities.delete_personality(personality_id):
        raise HTTPException(status_code=404, detail="Personality not found")
    return {"status": "deleted", "id": personality_id}


@app.get("/api/conversations", response_model=List[ConversationMetadata])
async def list_conversations():
    """List all conversations (metadata only)."""
    return storage.list_conversations()


@app.post("/api/conversations", response_model=Conversation)
async def create_conversation(request: CreateConversationRequest):
    """Create a new conversation."""
    conversation_id = str(uuid.uuid4())
    # Convert Pydantic model to dict if present
    personality_config = request.personality_config.model_dump() if request.personality_config else None
    conversation = storage.create_conversation(conversation_id, personality_config=personality_config)
    return conversation


@app.get("/api/conversations/{conversation_id}", response_model=Conversation)
async def get_conversation(conversation_id: str):
    """Get a specific conversation with all its messages."""
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@app.post("/api/conversations/{conversation_id}/message")
async def send_message(conversation_id: str, request: MessageRequest):
    """
    Send a message and route to appropriate handler based on mode.
    First message always uses council mode. Subsequent messages default to chairman.
    """
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Build conversation history before adding new message
    history = build_conversation_history(conversation["messages"])

    # Add the new user message
    add_user_message(conversation_id, request.content)

    # Determine mode (first message always council, otherwise default to chairman)
    is_first_message = len(conversation["messages"]) == 0
    mode = "council" if is_first_message else (request.mode or "chairman")

    if mode == "council":
        # Get personality config from conversation
        personality_config = conversation.get("personality_config")

        # Full 3-stage pipeline
        stage1, stage2, stage3, metadata = await run_full_council(
            request.content,
            history if not is_first_message else None,
            personality_config
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
            "metadata": metadata,
            "mode": "council"
        }
    else:
        # Chairman-only response
        result = await chat_with_chairman(request.content, history)
        add_chairman_message(conversation_id, result)
        return {
            "chairman_response": result,
            "mode": "chairman"
        }


@app.post("/api/conversations/{conversation_id}/message/stream")
async def send_message_stream(conversation_id: str, request: MessageRequest):
    """
    Send a message and stream the response with mode routing.
    Returns Server-Sent Events as each stage completes.
    """
    # Check if conversation exists
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    async def event_generator():
        try:
            # Build history before adding new message
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
                # Get personality config from conversation
                personality_config = conversation.get("personality_config")

                # Start title generation in parallel (don't await yet)
                title_task = None
                if is_first_message:
                    title_task = asyncio.create_task(generate_conversation_title(request.content))

                # Generate context summary for stages 2 and 3 if we have history
                context_summary = None
                if history:
                    context_summary = format_history_summary(history)

                # Stage 1: Collect responses
                yield f"data: {json.dumps({'type': 'stage1_start'})}\n\n"
                stage1_results = await stage1_collect_responses(request.content, history if not is_first_message else None, personality_config)
                yield f"data: {json.dumps({'type': 'stage1_complete', 'data': stage1_results})}\n\n"

                # Stage 2: Collect rankings
                yield f"data: {json.dumps({'type': 'stage2_start'})}\n\n"
                stage2_results, label_to_model = await stage2_collect_rankings(request.content, stage1_results, context_summary, personality_config)
                aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)
                yield f"data: {json.dumps({'type': 'stage2_complete', 'data': stage2_results, 'metadata': {'label_to_model': label_to_model, 'aggregate_rankings': aggregate_rankings}})}\n\n"

                # Stage 3: Synthesize final answer
                yield f"data: {json.dumps({'type': 'stage3_start'})}\n\n"

                # Get chairman personality if configured
                chairman_personality = None
                if personality_config and personality_config.get('chairman_personality_id'):
                    chairman_personality = personalities.get_personality(personality_config['chairman_personality_id'])

                stage3_result = await stage3_synthesize_final(request.content, stage1_results, stage2_results, context_summary, chairman_personality)
                yield f"data: {json.dumps({'type': 'stage3_complete', 'data': stage3_result})}\n\n"

                # Wait for title generation if it was started
                if title_task:
                    title = await title_task
                    update_conversation_title(conversation_id, title)
                    yield f"data: {json.dumps({'type': 'title_complete', 'data': {'title': title}})}\n\n"

                # Save complete assistant message
                add_assistant_message(
                    conversation_id,
                    stage1_results,
                    stage2_results,
                    stage3_result
                )

                # Send completion event
                yield f"data: {json.dumps({'type': 'complete', 'mode': 'council'})}\n\n"

        except Exception as e:
            # Send error event
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
