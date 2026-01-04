import {
  Bot,
  Globe,
  Loader2,
  MessageCircle,
  Mic,
  MoreVertical,
  Send,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../store/useAuthStore';
import { Button } from '../ui/button';

interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: string; // Changed to string for JSON serialization
}

interface ChatResponse {
  message: string;
  conversationId: string;
}

interface StoredConversation {
  conversationId: string;
  messages: ChatMessage[];
}

const STORAGE_KEY_PREFIX = 'domotic-ai-chat';
const SPEECH_LANG_KEY = 'domotic-ai-speech-lang';
const MAX_MESSAGES = 50;
const MAX_RECORDING_TIME = 10000; // 10 seconds

// Available speech languages
const SPEECH_LANGUAGES = [
  { code: 'auto', label: 'Auto (Browser)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'es-ES', label: 'Spanish (Spain)' },
  { code: 'es-MX', label: 'Spanish (Mexico)' },
  { code: 'fr-FR', label: 'French' },
  { code: 'de-DE', label: 'German' },
  { code: 'it-IT', label: 'Italian' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)' },
  { code: 'zh-CN', label: 'Chinese (Simplified)' },
  { code: 'ja-JP', label: 'Japanese' },
];

// Get browser language or fallback
const getBrowserLanguage = (): string => {
  if (typeof navigator !== 'undefined') {
    return navigator.language || 'en-US';
  }
  return 'en-US';
};

// Check if Web Speech API is available
const SpeechRecognition =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    : null;
const isSpeechRecognitionAvailable = !!SpeechRecognition;

// Load/save speech language preference
const loadSpeechLanguage = (): string => {
  try {
    const stored = localStorage.getItem(SPEECH_LANG_KEY);
    return stored || 'auto';
  } catch {
    return 'auto';
  }
};

const saveSpeechLanguage = (lang: string) => {
  try {
    localStorage.setItem(SPEECH_LANG_KEY, lang);
  } catch (error) {
    console.error('Error saving speech language:', error);
  }
};

// Helper functions for localStorage (now require userId)
const getStorageKey = (userId: string) => `${STORAGE_KEY_PREFIX}-${userId}`;

const loadConversation = (userId: string): StoredConversation | null => {
  try {
    const stored = localStorage.getItem(getStorageKey(userId));
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Error loading conversation from localStorage:', error);
  }
  return null;
};

const saveConversation = (
  userId: string,
  conversationId: string,
  messages: ChatMessage[],
) => {
  try {
    // Keep only the last MAX_MESSAGES
    const trimmedMessages = messages.slice(-MAX_MESSAGES);
    const data: StoredConversation = {
      conversationId,
      messages: trimmedMessages,
    };
    localStorage.setItem(getStorageKey(userId), JSON.stringify(data));
  } catch (error) {
    console.error('Error saving conversation to localStorage:', error);
  }
};

const clearConversation = (userId: string) => {
  try {
    localStorage.removeItem(getStorageKey(userId));
  } catch (error) {
    console.error('Error clearing conversation from localStorage:', error);
  }
};

export default function AIChatbox() {
  const { user } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [speechLanguage, setSpeechLanguage] = useState(() =>
    loadSpeechLanguage(),
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Load conversation from localStorage on mount (when user is available)
  useEffect(() => {
    if (!user?.id) return;
    const stored = loadConversation(user.id);
    if (stored) {
      setMessages(stored.messages);
      setConversationId(stored.conversationId);
    }
  }, [user?.id]);

  // Save conversation to localStorage when messages change
  useEffect(() => {
    if (user?.id && conversationId && messages.length > 0) {
      saveConversation(user.id, conversationId, messages);
    }
  }, [messages, conversationId, user?.id]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClearChat = () => {
    setMessages([]);
    setConversationId(null);
    if (user?.id) {
      clearConversation(user.id);
    }
    setIsMenuOpen(false);
  };

  const sendMessage = async () => {
    const trimmedInput = inputValue.trim();
    if (!trimmedInput || isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      content: trimmedInput,
      role: 'user',
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const payload: { message: string; conversationId?: string } = {
        message: trimmedInput,
      };
      if (conversationId) {
        payload.conversationId = conversationId;
      }

      const response = await api.post<ChatResponse>('/ai/chat', payload);

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        content: response.data.message,
        role: 'assistant',
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setConversationId(response.data.conversationId);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        content:
          'Sorry, there was an error processing your message. Please try again.',
        role: 'assistant',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Speech recognition handlers
  const startRecording = () => {
    if (!isSpeechRecognitionAvailable || isLoading) return;

    // Clear previous input when starting new recording
    setInputValue('');
    setIsRecording(true);

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang =
      speechLanguage === 'auto' ? getBrowserLanguage() : speechLanguage;

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInputValue(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }
    };

    recognitionRef.current = recognition;
    recognition.start();

    // Set max recording timeout
    recordingTimeoutRef.current = setTimeout(() => {
      stopRecording();
    }, MAX_RECORDING_TIME);
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
  };

  return (
    <>
      {/* Chat Window */}
      <div
        className={cn(
          'fixed bottom-24 right-6 z-50 w-[360px] max-w-[calc(100vw-2rem)] transition-all duration-300 ease-out',
          isOpen
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-4 pointer-events-none',
        )}
      >
        <div className="bg-card/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[500px]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-linear-to-r from-primary/10 to-purple-500/10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-linear-to-br from-primary to-purple-500 flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Domotic AI</h3>
                <p className="text-xs text-muted-foreground">Smart Assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Menu Button */}
              <div className="relative" ref={menuRef}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
                {/* Dropdown Menu */}
                {isMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-lg shadow-lg py-1 z-10 animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Language selector - only show if speech is available */}
                    {isSpeechRecognitionAvailable && (
                      <div className="px-3 py-2 border-b border-border">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                          <Globe className="w-3 h-3" />
                          Speech Language
                        </label>
                        <select
                          value={speechLanguage}
                          onChange={(e) => {
                            setSpeechLanguage(e.target.value);
                            saveSpeechLanguage(e.target.value);
                          }}
                          className="w-full text-sm bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          {SPEECH_LANGUAGES.map((lang) => (
                            <option key={lang.code} value={lang.code}>
                              {lang.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <button
                      onClick={handleClearChat}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Clear chat
                    </button>
                  </div>
                )}
              </div>
              {/* Close Button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setIsOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px] max-h-[350px]">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <Bot className="w-12 h-12 mb-3 opacity-50" />
                <p className="text-sm font-medium">Hi! I'm your assistant.</p>
                <p className="text-xs mt-1">Ask me about your smart home.</p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300',
                    message.role === 'user' ? 'justify-end' : 'justify-start',
                  )}
                >
                  {message.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full bg-linear-to-br from-primary to-purple-500 flex items-center justify-center shrink-0 mt-1">
                      <Bot className="w-3 h-3 text-white" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'flex flex-col',
                      message.role === 'user' && 'items-end',
                    )}
                  >
                    <div
                      className={cn(
                        'px-3 py-2 rounded-2xl text-sm',
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-muted rounded-bl-md',
                      )}
                    >
                      <p className="whitespace-pre-wrap wrap-break-word">
                        {message.content}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'text-[10px] text-muted-foreground mt-1 px-1',
                        message.role === 'user' ? 'text-right' : 'text-left',
                      )}
                    >
                      {new Date(message.timestamp).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {message.role === 'user' && (
                    <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center shrink-0 mt-1">
                      <User className="w-3 h-3" />
                    </div>
                  )}
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex gap-2 justify-start animate-in fade-in duration-300">
                <div className="w-6 h-6 rounded-full bg-linear-to-br from-primary to-purple-500 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="w-3 h-3 text-white" />
                </div>
                <div className="bg-muted px-4 py-3 rounded-2xl rounded-bl-md">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border/50 bg-card/50">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isRecording ? 'Listening...' : 'Type a message...'}
                className={cn(
                  'flex-1 resize-none bg-background border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary min-h-[40px] max-h-[100px]',
                  isRecording
                    ? 'border-red-500 animate-pulse'
                    : 'border-border',
                )}
                rows={1}
                disabled={isLoading || isRecording}
              />
              {/* Microphone button - only show if Speech API is available */}
              {isSpeechRecognitionAvailable && (
                <Button
                  size="icon"
                  variant={isRecording ? 'destructive' : 'outline'}
                  className={cn(
                    'h-10 w-10 rounded-xl transition-all duration-200',
                    isRecording && 'animate-pulse',
                  )}
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onMouseLeave={stopRecording}
                  onTouchStart={startRecording}
                  onTouchEnd={stopRecording}
                  disabled={isLoading}
                  aria-label={isRecording ? 'Recording...' : 'Hold to speak'}
                >
                  <Mic className="w-4 h-4" />
                </Button>
              )}
              <Button
                size="icon"
                className="h-10 w-10 rounded-xl bg-linear-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90 transition-all duration-200"
                onClick={sendMessage}
                disabled={!inputValue.trim() || isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg transition-all duration-300 ease-out',
          'bg-linear-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90',
          'flex items-center justify-center',
          'hover:scale-105 hover:shadow-xl hover:shadow-primary/25',
          'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background',
          isOpen && 'rotate-90',
        )}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white transition-transform duration-300" />
        ) : (
          <MessageCircle className="w-6 h-6 text-white transition-transform duration-300" />
        )}
      </button>
    </>
  );
}
