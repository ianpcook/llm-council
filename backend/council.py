"""3-stage LLM Council orchestration."""

from typing import List, Dict, Any, Tuple, Optional
from .openrouter import query_models_parallel, query_model
from .config import COUNCIL_MODELS, CHAIRMAN_MODEL
from .personalities import get_personality, build_personality_prompt, shuffle_assignments, list_personalities


async def stage1_collect_responses(
    user_query: str,
    conversation_history: List[Dict[str, str]] = None,
    personality_config: Dict[str, Any] = None
) -> List[Dict[str, Any]]:
    """
    Stage 1: Collect individual responses from all council models.

    Args:
        user_query: The user's question
        conversation_history: Optional list of prior messages (with 'role' and 'content' keys)
        personality_config: Optional personality configuration for council members

    Returns:
        List of dicts with 'model' and 'response' keys
    """
    # Build base messages from history + new query
    base_messages = list(conversation_history or [])
    base_messages.append({"role": "user", "content": user_query})

    # Get personality assignments if configured
    council_assignments = {}
    if personality_config and personality_config.get('council_assignments'):
        council_assignments = personality_config['council_assignments']

    # Query each model, potentially with different personality prompts
    stage1_results = []

    if council_assignments:
        # Query models individually with personality-specific system prompts
        import asyncio

        async def query_with_personality(model: str):
            personality_id = council_assignments.get(model)
            personality = get_personality(personality_id) if personality_id else None

            messages = []
            if personality:
                persona_prompt = build_personality_prompt(personality, "response")
                if persona_prompt:
                    messages.append({"role": "system", "content": persona_prompt})
            messages.extend(base_messages)

            response = await query_model(model, messages)
            return model, response

        tasks = [query_with_personality(model) for model in COUNCIL_MODELS]
        results = await asyncio.gather(*tasks)

        for model, response in results:
            if response is not None:
                stage1_results.append({
                    "model": model,
                    "response": response.get('content', '')
                })
    else:
        # No personalities - use original parallel query
        responses = await query_models_parallel(COUNCIL_MODELS, base_messages)
        for model, response in responses.items():
            if response is not None:
                stage1_results.append({
                    "model": model,
                    "response": response.get('content', '')
                })

    return stage1_results


async def stage2_collect_rankings(
    user_query: str,
    stage1_results: List[Dict[str, Any]],
    conversation_context: str = None,
    personality_config: Dict[str, Any] = None
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    """
    Stage 2: Each model ranks the anonymized responses.

    Args:
        user_query: The original user query
        stage1_results: Results from Stage 1
        conversation_context: Optional conversation history for multi-turn context
        personality_config: Optional personality configuration for council members

    Returns:
        Tuple of (rankings list, label_to_model mapping)
    """
    # Create anonymized labels for responses (Response A, Response B, etc.)
    labels = [chr(65 + i) for i in range(len(stage1_results))]  # A, B, C, ...

    # Create mapping from label to model name
    label_to_model = {
        f"Response {label}": result['model']
        for label, result in zip(labels, stage1_results)
    }

    # Build the ranking prompt
    responses_text = "\n\n".join([
        f"Response {label}:\n{result['response']}"
        for label, result in zip(labels, stage1_results)
    ])

    # Add context section if conversation history is provided
    context_section = ""
    if conversation_context:
        context_section = f"""CONVERSATION CONTEXT:
This is a follow-up question. Here is the recent conversation history:
{conversation_context}

"""

    ranking_prompt = f"""{context_section}You are evaluating different responses to the following question:

Question: {user_query}

Here are the responses from different models (anonymized):

{responses_text}

Your task:
1. First, evaluate each response individually. For each response, explain what it does well and what it does poorly.
2. Then, at the very end of your response, provide a final ranking.

IMPORTANT: Your final ranking MUST be formatted EXACTLY as follows:
- Start with the line "FINAL RANKING:" (all caps, with colon)
- Then list the responses from best to worst as a numbered list
- Each line should be: number, period, space, then ONLY the response label (e.g., "1. Response A")
- Do not add any other text or explanations in the ranking section

Example of the correct format for your ENTIRE response:

Response A provides good detail on X but misses Y...
Response B is accurate but lacks depth on Z...
Response C offers the most comprehensive answer...

FINAL RANKING:
1. Response C
2. Response A
3. Response B

Now provide your evaluation and ranking:"""

    # Get personality assignments if configured
    council_assignments = {}
    if personality_config and personality_config.get('council_assignments'):
        council_assignments = personality_config['council_assignments']

    if council_assignments:
        # Query models individually with personality-specific perspectives
        import asyncio

        async def query_with_perspective(model: str):
            personality_id = council_assignments.get(model)
            personality = get_personality(personality_id) if personality_id else None

            messages = []
            if personality:
                perspective_prompt = build_personality_prompt(personality, "ranking")
                if perspective_prompt:
                    messages.append({"role": "system", "content": perspective_prompt})
            messages.append({"role": "user", "content": ranking_prompt})

            response = await query_model(model, messages)
            return model, response

        tasks = [query_with_perspective(model) for model in COUNCIL_MODELS]
        results = await asyncio.gather(*tasks)
        responses = {model: response for model, response in results}
    else:
        # No personalities - use original parallel query
        messages = [{"role": "user", "content": ranking_prompt}]
        responses = await query_models_parallel(COUNCIL_MODELS, messages)

    # Format results
    stage2_results = []
    for model, response in responses.items():
        if response is not None:
            full_text = response.get('content', '')
            parsed = parse_ranking_from_text(full_text)
            stage2_results.append({
                "model": model,
                "ranking": full_text,
                "parsed_ranking": parsed
            })

    return stage2_results, label_to_model


async def stage3_synthesize_final(
    user_query: str,
    stage1_results: List[Dict[str, Any]],
    stage2_results: List[Dict[str, Any]],
    conversation_context: str = None,
    chairman_personality: Dict[str, Any] = None
) -> Dict[str, Any]:
    """
    Stage 3: Chairman synthesizes final response.

    Args:
        user_query: The original user query
        stage1_results: Individual model responses from Stage 1
        stage2_results: Rankings from Stage 2
        conversation_context: Optional conversation history for context

    Returns:
        Dict with 'model' and 'response' keys
    """
    # Build comprehensive context for chairman
    stage1_text = "\n\n".join([
        f"Model: {result['model']}\nResponse: {result['response']}"
        for result in stage1_results
    ])

    stage2_text = "\n\n".join([
        f"Model: {result['model']}\nRanking: {result['ranking']}"
        for result in stage2_results
    ])

    # Add conversation context section if provided
    context_section = ""
    if conversation_context:
        context_section = f"""CONVERSATION CONTEXT:
This is a follow-up question. Here is the recent conversation history:
{conversation_context}

"""

    chairman_prompt = f"""{context_section}You are the Chairman of an LLM Council. Multiple AI models have provided responses to a user's question, and then ranked each other's responses.

Original Question: {user_query}

STAGE 1 - Individual Responses:
{stage1_text}

STAGE 2 - Peer Rankings:
{stage2_text}

Your task as Chairman is to synthesize all of this information into a single, comprehensive, accurate answer to the user's original question. Consider:
- The individual responses and their insights
- The peer rankings and what they reveal about response quality
- Any patterns of agreement or disagreement

Provide a clear, well-reasoned final answer that represents the council's collective wisdom:"""

    # Build messages with optional personality
    messages = []
    if chairman_personality:
        persona_prompt = build_personality_prompt(chairman_personality, "synthesis")
        if persona_prompt:
            messages.append({"role": "system", "content": persona_prompt})
    messages.append({"role": "user", "content": chairman_prompt})

    # Query the chairman model
    response = await query_model(CHAIRMAN_MODEL, messages)

    if response is None:
        # Fallback if chairman fails
        return {
            "model": CHAIRMAN_MODEL,
            "response": "Error: Unable to generate final synthesis."
        }

    return {
        "model": CHAIRMAN_MODEL,
        "response": response.get('content', '')
    }


def parse_ranking_from_text(ranking_text: str) -> List[str]:
    """
    Parse the FINAL RANKING section from the model's response.

    Args:
        ranking_text: The full text response from the model

    Returns:
        List of response labels in ranked order
    """
    import re

    # Look for "FINAL RANKING:" section
    if "FINAL RANKING:" in ranking_text:
        # Extract everything after "FINAL RANKING:"
        parts = ranking_text.split("FINAL RANKING:")
        if len(parts) >= 2:
            ranking_section = parts[1]
            # Try to extract numbered list format (e.g., "1. Response A")
            # This pattern looks for: number, period, optional space, "Response X"
            numbered_matches = re.findall(r'\d+\.\s*Response [A-Z]', ranking_section)
            if numbered_matches:
                # Extract just the "Response X" part
                return [re.search(r'Response [A-Z]', m).group() for m in numbered_matches]

            # Fallback: Extract all "Response X" patterns in order
            matches = re.findall(r'Response [A-Z]', ranking_section)
            return matches

    # Fallback: try to find any "Response X" patterns in order
    matches = re.findall(r'Response [A-Z]', ranking_text)
    return matches


def calculate_aggregate_rankings(
    stage2_results: List[Dict[str, Any]],
    label_to_model: Dict[str, str]
) -> List[Dict[str, Any]]:
    """
    Calculate aggregate rankings across all models.

    Args:
        stage2_results: Rankings from each model
        label_to_model: Mapping from anonymous labels to model names

    Returns:
        List of dicts with model name and average rank, sorted best to worst
    """
    from collections import defaultdict

    # Track positions for each model
    model_positions = defaultdict(list)

    for ranking in stage2_results:
        ranking_text = ranking['ranking']

        # Parse the ranking from the structured format
        parsed_ranking = parse_ranking_from_text(ranking_text)

        for position, label in enumerate(parsed_ranking, start=1):
            if label in label_to_model:
                model_name = label_to_model[label]
                model_positions[model_name].append(position)

    # Calculate average position for each model
    aggregate = []
    for model, positions in model_positions.items():
        if positions:
            avg_rank = sum(positions) / len(positions)
            aggregate.append({
                "model": model,
                "average_rank": round(avg_rank, 2),
                "rankings_count": len(positions)
            })

    # Sort by average rank (lower is better)
    aggregate.sort(key=lambda x: x['average_rank'])

    return aggregate


def format_history_summary(history: List[Dict[str, str]], max_turns: int = 3) -> str:
    """
    Format recent conversation history as a brief summary string.

    Args:
        history: List of message dicts with 'role' and 'content' keys
        max_turns: Maximum number of recent turns (user + assistant pairs) to include

    Returns:
        Formatted string with recent conversation history
    """
    recent = history[-(max_turns * 2):]  # Last N turns (user + assistant pairs)
    lines = []
    for msg in recent:
        role = "User" if msg["role"] == "user" else "Assistant"
        content = msg["content"][:500] + "..." if len(msg["content"]) > 500 else msg["content"]
        lines.append(f"{role}: {content}")
    return "\n".join(lines)


async def chat_with_chairman(
    user_query: str,
    conversation_history: List[Dict[str, str]]
) -> Dict[str, Any]:
    """
    Direct conversation with the chairman model only.
    Used for follow-up questions that don't need full council deliberation.

    Args:
        user_query: The user's question
        conversation_history: List of previous messages with 'role' and 'content' keys

    Returns:
        Dict with 'model' and 'response' keys
    """
    messages = list(conversation_history)
    messages.append({"role": "user", "content": user_query})

    response = await query_model(CHAIRMAN_MODEL, messages)

    return {
        "model": CHAIRMAN_MODEL,
        "response": response["content"] if response else "Failed to get response"
    }


async def generate_conversation_title(user_query: str) -> str:
    """
    Generate a short title for a conversation based on the first user message.

    Args:
        user_query: The first user message

    Returns:
        A short title (3-5 words)
    """
    title_prompt = f"""Generate a very short title (3-5 words maximum) that summarizes the following question.
The title should be concise and descriptive. Do not use quotes or punctuation in the title.

Question: {user_query}

Title:"""

    messages = [{"role": "user", "content": title_prompt}]

    # Use gemini-2.5-flash for title generation (fast and cheap)
    response = await query_model("google/gemini-2.5-flash", messages, timeout=30.0)

    if response is None:
        # Fallback to a generic title
        return "New Conversation"

    title = response.get('content', 'New Conversation').strip()

    # Clean up the title - remove quotes, limit length
    title = title.strip('"\'')

    # Truncate if too long
    if len(title) > 50:
        title = title[:47] + "..."

    return title


async def run_full_council(
    user_query: str,
    conversation_history: List[Dict[str, str]] = None,
    personality_config: Dict[str, Any] = None
) -> Tuple[List, List, Dict, Dict]:
    """
    Run the complete 3-stage council process.
    Now accepts optional conversation history for multi-turn context.

    Args:
        user_query: The user's question
        conversation_history: Optional list of prior messages (with 'role' and 'content' keys)

    Returns:
        Tuple of (stage1_results, stage2_results, stage3_result, metadata)
    """
    # Handle shuffle_each_turn
    actual_personality_config = personality_config
    if personality_config and personality_config.get('shuffle_each_turn'):
        # Get all available personality IDs
        all_personalities = list_personalities()
        personality_ids = [p['id'] for p in all_personalities]

        if personality_ids:
            # Shuffle assignments for this turn
            shuffled_assignments = shuffle_assignments(COUNCIL_MODELS, personality_ids)

            # Create a new config with shuffled assignments
            actual_personality_config = {
                **personality_config,
                'council_assignments': shuffled_assignments
            }

    # Generate context summary for stages 2 and 3 prompts
    context_summary = None
    if conversation_history:
        context_summary = format_history_summary(conversation_history)

    # Stage 1: Collect individual responses
    stage1_results = await stage1_collect_responses(user_query, conversation_history, actual_personality_config)

    # If no models responded successfully, return error
    if not stage1_results:
        return [], [], {
            "model": "error",
            "response": "All models failed to respond. Please try again."
        }, {}

    # Stage 2: Collect rankings
    stage2_results, label_to_model = await stage2_collect_rankings(
        user_query, stage1_results, context_summary, actual_personality_config
    )

    # Calculate aggregate rankings
    aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)

    # Extract chairman personality if provided
    chairman_personality = None
    if personality_config and personality_config.get('chairman'):
        chairman_personality = get_personality(personality_config['chairman'])

    # Stage 3: Synthesize final answer
    stage3_result = await stage3_synthesize_final(
        user_query,
        stage1_results,
        stage2_results,
        context_summary,
        chairman_personality
    )

    # Prepare metadata
    metadata = {
        "label_to_model": label_to_model,
        "aggregate_rankings": aggregate_rankings,
        "personality_assignments_used": actual_personality_config.get('council_assignments') if actual_personality_config else None
    }

    return stage1_results, stage2_results, stage3_result, metadata
