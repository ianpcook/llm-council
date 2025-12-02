import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import CouncilConfigPanel from './components/CouncilConfigPanel';
import PersonalityManager from './components/PersonalityManager';
import { api } from './api';
import './App.css';

function App() {
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [personalities, setPersonalities] = useState([]);
  const [councilConfig, setCouncilConfig] = useState(null);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [showPersonalityManager, setShowPersonalityManager] = useState(false);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
    loadPersonalities();
    loadCouncilConfig();
  }, []);

  // Load conversation details when selected
  useEffect(() => {
    if (currentConversationId) {
      loadConversation(currentConversationId);
    }
  }, [currentConversationId]);

  const loadConversations = async () => {
    try {
      const convs = await api.listConversations();
      setConversations(convs);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const loadConversation = async (id) => {
    try {
      const conv = await api.getConversation(id);
      setCurrentConversation(conv);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  const loadPersonalities = async () => {
    try {
      const data = await api.listPersonalities();
      setPersonalities(data);
    } catch (error) {
      console.error('Failed to load personalities:', error);
    }
  };

  const loadCouncilConfig = async () => {
    try {
      const config = await api.getConfig();
      setCouncilConfig(config);
    } catch (error) {
      console.error('Failed to load council config:', error);
    }
  };

  const handleNewConversation = () => {
    setShowConfigPanel(true);
  };

  const handleConfigConfirm = async (personalityConfig) => {
    try {
      const newConv = await api.createConversation(personalityConfig);
      setConversations([
        { id: newConv.id, created_at: newConv.created_at, title: newConv.title || 'New Conversation', message_count: 0 },
        ...conversations,
      ]);
      setCurrentConversationId(newConv.id);
      setShowConfigPanel(false);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const handleConfigCancel = () => {
    setShowConfigPanel(false);
  };

  const handleManagePersonalities = () => {
    setShowPersonalityManager(true);
  };

  const handleClosePersonalityManager = () => {
    setShowPersonalityManager(false);
    // Refresh personalities list in case changes were made
    loadPersonalities();
  };

  const handleSelectConversation = (id) => {
    setCurrentConversationId(id);
  };

  const handleSendMessage = async (content, mode) => {
    if (!currentConversationId) return;

    setIsLoading(true);
    try {
      // Optimistically add user message to UI
      const userMessage = { role: 'user', content };
      setCurrentConversation((prev) => ({
        ...prev,
        messages: [...prev.messages, userMessage],
      }));

      // Determine effective mode - first message is always council mode
      const isFirstMessage = currentConversation.messages.length === 0;
      const effectiveMode = isFirstMessage ? 'council' : mode;

      // Create a partial assistant message based on mode
      let assistantMessage;
      if (effectiveMode === 'chairman') {
        assistantMessage = {
          role: 'assistant',
          chairman_response: null,
          isLoading: true,
        };
      } else {
        // Council mode
        assistantMessage = {
          role: 'assistant',
          stage1: null,
          stage2: null,
          stage3: null,
          metadata: null,
          loading: {
            stage1: false,
            stage2: false,
            stage3: false,
          },
        };
      }

      // Add the partial assistant message
      setCurrentConversation((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
      }));

      // Send message with streaming, passing the mode
      await api.sendMessageStream(currentConversationId, content, effectiveMode, (eventType, event) => {
        switch (eventType) {
          case 'stage1_start':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.loading.stage1 = true;
              return { ...prev, messages };
            });
            break;

          case 'stage1_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.stage1 = event.data;
              lastMsg.loading.stage1 = false;
              return { ...prev, messages };
            });
            break;

          case 'stage2_start':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.loading.stage2 = true;
              return { ...prev, messages };
            });
            break;

          case 'stage2_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.stage2 = event.data;
              lastMsg.metadata = event.metadata;
              lastMsg.loading.stage2 = false;
              return { ...prev, messages };
            });
            break;

          case 'stage3_start':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.loading.stage3 = true;
              return { ...prev, messages };
            });
            break;

          case 'stage3_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.stage3 = event.data;
              lastMsg.loading.stage3 = false;
              return { ...prev, messages };
            });
            break;

          case 'chairman_start':
            // Chairman mode started (optional, could set loading state)
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.isLoading = true;
              return { ...prev, messages };
            });
            break;

          case 'chairman_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              lastMsg.chairman_response = event.data;
              lastMsg.isLoading = false;
              return { ...prev, messages };
            });
            break;

          case 'title_complete':
            // Reload conversations to get updated title
            loadConversations();
            break;

          case 'complete':
            // Stream complete, reload conversations list
            loadConversations();
            setIsLoading(false);
            break;

          case 'error':
            console.error('Stream error:', event.message);
            setIsLoading(false);
            break;

          default:
            console.log('Unknown event type:', eventType);
        }
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      // Remove optimistic messages on error
      setCurrentConversation((prev) => ({
        ...prev,
        messages: prev.messages.slice(0, -2),
      }));
      setIsLoading(false);
    }
  };

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onManagePersonalities={handleManagePersonalities}
      />
      <ChatInterface
        conversation={currentConversation}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
      />

      {showConfigPanel && (
        <CouncilConfigPanel
          personalities={personalities}
          councilModels={councilConfig?.council_models || []}
          onConfirm={handleConfigConfirm}
          onCancel={handleConfigCancel}
          onManagePersonalities={handleManagePersonalities}
        />
      )}

      {showPersonalityManager && (
        <div className="modal-overlay" onClick={handleClosePersonalityManager}>
          <div className="modal-content" style={{maxWidth: '900px', width: '90%'}} onClick={e => e.stopPropagation()}>
            <PersonalityManager onClose={handleClosePersonalityManager} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
