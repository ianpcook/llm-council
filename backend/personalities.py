"""Personality management for the LLM Council."""

import json
import os
import random
import uuid
from pathlib import Path
from typing import Dict, Any, List, Optional

# Personalities data directory
PERSONALITIES_DIR = "data/personalities"

# Seed personalities with fixed UUIDs for consistency
SEED_PERSONALITIES = [
    {
        "id": "seed-systems-architect",
        "name": "Systems Architect",
        "type": "detailed",
        "role": "You are a senior systems architect with 20+ years of experience designing large-scale distributed systems. You've led architecture for Fortune 500 companies and have deep expertise in making systems that scale, remain maintainable, and minimize technical debt.",
        "expertise": ["distributed systems", "scalability", "system design", "technical debt management", "microservices"],
        "perspective": "Evaluate solutions for maintainability, scalability, and long-term technical debt implications. Consider operational complexity and failure modes.",
        "communication_style": "Technical but accessible. Uses architectural diagrams conceptually, references industry patterns, and always considers trade-offs."
    },
    {
        "id": "seed-value-investor",
        "name": "Value Investor",
        "type": "detailed",
        "role": "You are a seasoned value investor in the tradition of Benjamin Graham and Warren Buffett. You focus on fundamental analysis, margin of safety, and long-term wealth building. You're skeptical of hype and always look for intrinsic value.",
        "expertise": ["fundamental analysis", "risk management", "portfolio theory", "behavioral finance", "valuation"],
        "perspective": "Evaluate ideas through the lens of long-term value creation, risk-adjusted returns, and margin of safety. Be skeptical of speculation and short-term thinking.",
        "communication_style": "Patient and methodical. Uses concrete examples, historical analogies, and always quantifies risk when possible."
    },
    {
        "id": "seed-academic-philosopher",
        "name": "Academic Philosopher",
        "type": "detailed",
        "role": "You are a philosophy professor specializing in logic, epistemology, and ethics. You've spent decades teaching critical thinking and have published extensively on reasoning and argumentation. You value intellectual rigor above all.",
        "expertise": ["logic", "epistemology", "ethics", "critical thinking", "argumentation theory"],
        "perspective": "Evaluate arguments for logical validity, sound premises, and hidden assumptions. Consider multiple philosophical frameworks and acknowledge genuine uncertainty.",
        "communication_style": "Precise and nuanced. Defines terms carefully, acknowledges counterarguments, and distinguishes between what is known and what is assumed."
    }
]


def ensure_personalities_dir() -> None:
    """Ensure the personalities data directory exists."""
    Path(PERSONALITIES_DIR).mkdir(parents=True, exist_ok=True)


def get_personality_path(personality_id: str) -> str:
    """
    Get the file path for a personality.

    Args:
        personality_id: Unique identifier for the personality

    Returns:
        Full path to the personality JSON file
    """
    return os.path.join(PERSONALITIES_DIR, f"{personality_id}.json")


def create_personality(
    name: str,
    role: str,
    personality_type: str = "detailed",
    expertise: Optional[List[str]] = None,
    perspective: Optional[str] = None,
    communication_style: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create a new personality.

    Args:
        name: Display name for the personality (required)
        role: Role description/system prompt (required)
        personality_type: Either "simple" or "detailed"
        expertise: List of expertise areas
        perspective: Evaluation perspective for rankings
        communication_style: How this personality communicates

    Returns:
        The created personality dict

    Raises:
        ValueError: If required fields are missing
    """
    if not name or not name.strip():
        raise ValueError("Personality name is required")
    if not role or not role.strip():
        raise ValueError("Personality role is required")

    ensure_personalities_dir()

    personality_id = str(uuid.uuid4())
    personality = {
        "id": personality_id,
        "name": name.strip(),
        "type": personality_type,
        "role": role.strip(),
        "expertise": expertise or [],
        "perspective": perspective or "",
        "communication_style": communication_style or ""
    }

    path = get_personality_path(personality_id)
    with open(path, 'w') as f:
        json.dump(personality, f, indent=2)

    return personality


def get_personality(personality_id: str) -> Optional[Dict[str, Any]]:
    """
    Load a personality from storage.

    Args:
        personality_id: Unique identifier for the personality

    Returns:
        Personality dict or None if not found
    """
    path = get_personality_path(personality_id)

    if not os.path.exists(path):
        return None

    with open(path, 'r') as f:
        return json.load(f)


def update_personality(personality_id: str, **kwargs) -> Optional[Dict[str, Any]]:
    """
    Update an existing personality.

    Args:
        personality_id: Unique identifier for the personality
        **kwargs: Fields to update (name, type, role, expertise, perspective, communication_style)

    Returns:
        Updated personality dict or None if not found
    """
    personality = get_personality(personality_id)
    if personality is None:
        return None

    # Fields that can be updated
    updatable_fields = {'name', 'type', 'role', 'expertise', 'perspective', 'communication_style'}

    for key, value in kwargs.items():
        if key in updatable_fields:
            # Strip strings, keep other types as-is
            if isinstance(value, str):
                personality[key] = value.strip()
            else:
                personality[key] = value

    path = get_personality_path(personality_id)
    with open(path, 'w') as f:
        json.dump(personality, f, indent=2)

    return personality


def delete_personality(personality_id: str) -> bool:
    """
    Delete a personality.

    Args:
        personality_id: Unique identifier for the personality

    Returns:
        True if deleted, False if not found
    """
    path = get_personality_path(personality_id)

    if not os.path.exists(path):
        return False

    os.remove(path)
    return True


def list_personalities(type_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    List all personalities with optional filtering.

    Args:
        type_filter: Optional filter by type ("simple" or "detailed")

    Returns:
        List of personality dicts sorted by name alphabetically
    """
    ensure_personalities_dir()

    personalities = []
    for filename in os.listdir(PERSONALITIES_DIR):
        if filename.endswith('.json'):
            path = os.path.join(PERSONALITIES_DIR, filename)
            with open(path, 'r') as f:
                personality = json.load(f)
                # Apply type filter if specified
                if type_filter is None or personality.get('type') == type_filter:
                    personalities.append(personality)

    # Sort by name alphabetically
    personalities.sort(key=lambda x: x.get('name', '').lower())

    return personalities


def initialize_seed_personalities() -> bool:
    """
    Initialize seed personalities if the directory is empty.

    Only creates seed personalities if no personalities exist yet.
    Uses fixed UUIDs for consistency across installations.

    Returns:
        True if seed personalities were created, False if skipped
    """
    ensure_personalities_dir()

    # Check if any personalities already exist
    existing = os.listdir(PERSONALITIES_DIR)
    if any(f.endswith('.json') for f in existing):
        return False

    # Create seed personalities with fixed IDs
    for seed in SEED_PERSONALITIES:
        path = get_personality_path(seed['id'])
        with open(path, 'w') as f:
            json.dump(seed, f, indent=2)

    return True


def shuffle_assignments(models: List[str], personality_ids: List[str]) -> Dict[str, str]:
    """
    Randomly assign personalities to models.

    Args:
        models: List of model identifiers
        personality_ids: List of personality IDs to assign from

    Returns:
        Dict mapping model_id to personality_id
    """
    if not personality_ids:
        return {}

    return {model: random.choice(personality_ids) for model in models}


def build_personality_prompt(personality: Optional[Dict[str, Any]], stage: str) -> str:
    """
    Build a system prompt fragment from a personality for a specific stage.

    Args:
        personality: Personality dict (can be None)
        stage: One of "response", "ranking", or "synthesis"

    Returns:
        Formatted prompt string, or empty string if personality is None
    """
    if personality is None:
        return ""

    name = personality.get('name', '')
    role = personality.get('role', '')
    expertise = personality.get('expertise', [])
    perspective = personality.get('perspective', '')
    communication_style = personality.get('communication_style', '')

    if stage == "response":
        # Stage 1: Full persona context
        lines = [f"You are responding as a {name}. {role}"]

        # Add expertise if present
        if expertise:
            expertise_str = ", ".join(expertise)
            lines.append(f"Your areas of expertise: {expertise_str}")

        # Add communication style if present
        if communication_style:
            lines.append(f"Communication style: {communication_style}")

        return "\n".join(lines)

    elif stage == "ranking":
        # Stage 2: Perspective-focused
        if perspective:
            return f"Evaluate these responses from your perspective as a {name}.\nConsider: {perspective}"
        else:
            return f"Evaluate these responses from your perspective as a {name}."

    elif stage == "synthesis":
        # Stage 3: Chairman framing
        return f"You are synthesizing as a {name}. {role}\nBring your unique perspective to create a balanced final answer."

    else:
        # Unknown stage, return empty string
        return ""
