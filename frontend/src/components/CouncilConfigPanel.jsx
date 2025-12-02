import React, { useState } from 'react';
import './CouncilConfigPanel.css';

function CouncilConfigPanel({ personalities, councilModels, onConfirm, onCancel, onManagePersonalities }) {
  const [mode, setMode] = useState('none'); // 'none' | 'all_same' | 'each_different'

  // These will be used in later tasks
  const [councilAssignments, setCouncilAssignments] = useState({});
  const [singlePersonality, setSinglePersonality] = useState('');
  const [chairmanPersonalityId, setChairmanPersonalityId] = useState(null);
  const [shuffleEachTurn, setShuffleEachTurn] = useState(false);

  // Initialize assignments when mode changes to each_different
  React.useEffect(() => {
    if (mode === 'each_different' && councilModels) {
      const initial = {};
      councilModels.forEach(model => {
        initial[model] = councilAssignments[model] || '';
      });
      setCouncilAssignments(initial);
    }
  }, [mode, councilModels]);

  const handleAssignmentChange = (model, personalityId) => {
    setCouncilAssignments(prev => ({
      ...prev,
      [model]: personalityId
    }));
  };

  const handleShuffle = () => {
    if (!personalities.length || !councilModels.length) return;

    const shuffled = {};
    councilModels.forEach(model => {
      // Random personality for each model
      const randomIndex = Math.floor(Math.random() * personalities.length);
      shuffled[model] = personalities[randomIndex].id;
    });
    setCouncilAssignments(shuffled);

    // If in all_same mode, also set single personality
    if (mode === 'all_same') {
      const randomIndex = Math.floor(Math.random() * personalities.length);
      setSinglePersonality(personalities[randomIndex].id);
    }
  };

  const handleConfirm = () => {
    // Build personality config based on mode
    let config = null;

    if (mode !== 'none') {
      let assignments = {};

      if (mode === 'all_same' && singlePersonality) {
        councilModels.forEach(m => {
          assignments[m] = singlePersonality;
        });
      } else if (mode === 'each_different') {
        // Filter out empty assignments
        Object.entries(councilAssignments).forEach(([model, personalityId]) => {
          if (personalityId) {
            assignments[model] = personalityId;
          }
        });
      }

      config = {
        mode,
        council_assignments: Object.keys(assignments).length > 0 ? assignments : null,
        chairman_personality_id: chairmanPersonalityId || null,
        shuffle_each_turn: shuffleEachTurn
      };
    }

    onConfirm(config);
  };

  return (
    <div className="council-config-panel">
      <div className="council-config-content">
        <div className="council-config-header">
          <h2>Configure Council</h2>
          <p>Assign personalities to council members before starting the conversation.</p>
        </div>

        {/* Mode Selection */}
        <div className="mode-selection">
          <h3>Personality Mode</h3>
          <div className="mode-options">
            <button
              className={`mode-option ${mode === 'none' ? 'selected' : ''}`}
              onClick={() => setMode('none')}
            >
              <span className="mode-option-label">No Personalities</span>
              <span className="mode-option-description">
                Use default model behavior
              </span>
            </button>

            <button
              className={`mode-option ${mode === 'all_same' ? 'selected' : ''}`}
              onClick={() => setMode('all_same')}
            >
              <span className="mode-option-label">Same for All</span>
              <span className="mode-option-description">
                One personality for all council members
              </span>
            </button>

            <button
              className={`mode-option ${mode === 'each_different' ? 'selected' : ''}`}
              onClick={() => setMode('each_different')}
            >
              <span className="mode-option-label">Configure Each</span>
              <span className="mode-option-description">
                Different personality per model
              </span>
            </button>
          </div>
        </div>

        {/* Placeholder for model assignments - Task 3.8 */}
        {mode === 'all_same' && (
          <div className="single-assignment">
            <label>Select personality for all models:</label>
            <select
              className="personality-select"
              value={singlePersonality}
              onChange={(e) => setSinglePersonality(e.target.value)}
            >
              <option value="">-- Select Personality --</option>
              {personalities.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {mode === 'each_different' && (
          <div className="model-assignments">
            <h3>Model Assignments</h3>
            <div className="assignment-grid">
              {councilModels.map(model => (
                <div key={model} className="assignment-row">
                  <span className="model-name" title={model}>
                    {model.split('/').pop()}
                  </span>
                  <select
                    className="personality-select"
                    value={councilAssignments[model] || ''}
                    onChange={(e) => handleAssignmentChange(model, e.target.value)}
                  >
                    <option value="">None</option>
                    {personalities.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Shuffle Section */}
        {mode !== 'none' && (
          <div className="shuffle-section">
            <button
              className="shuffle-btn"
              onClick={handleShuffle}
              disabled={!personalities.length}
            >
              🎲 Shuffle
            </button>

            <label className="shuffle-toggle">
              <input
                type="checkbox"
                checked={shuffleEachTurn}
                onChange={(e) => setShuffleEachTurn(e.target.checked)}
              />
              Shuffle each turn
            </label>

            <span className="shuffle-tooltip">
              (Randomize personalities for each message)
            </span>
          </div>
        )}

        {/* Chairman Configuration */}
        <div className="chairman-section">
          <h3>Chairman</h3>
          <p>The chairman synthesizes the final answer in Stage 3.</p>
          <select
            className="chairman-select"
            value={chairmanPersonalityId || ''}
            onChange={(e) => setChairmanPersonalityId(e.target.value || null)}
          >
            <option value="">Neutral Moderator (no personality)</option>
            {personalities.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Action Buttons */}
        <div className="config-actions">
          <div className="config-actions-left">
            <button className="btn-link" onClick={onManagePersonalities}>
              Manage Personalities
            </button>
          </div>
          <div className="config-actions-right">
            <button className="btn-cancel" onClick={onCancel}>
              Cancel
            </button>
            <button
              className="btn-start"
              onClick={handleConfirm}
              disabled={mode === 'all_same' && !singlePersonality}
            >
              Start Conversation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CouncilConfigPanel;
