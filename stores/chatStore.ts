import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  documents?: Array<{
    id: string;
    uri: string;
    title: string;
    type: string;
  }>;
  isLoading?: boolean;
}

interface ChatStore {
  messages: ChatMessage[];
  isTyping: boolean;
  
  // Actions
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  clearMessages: () => void;
  setIsTyping: (typing: boolean) => void;
  sendMessage: (text: string) => Promise<void>;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [
    {
      id: '1',
      text: "Hi! I can help you find documents in your gallery. Just ask me about any document you're looking for.",
      sender: 'ai',
      timestamp: new Date(),
    }
  ],
  isTyping: false,
  
  addMessage: (message) => {
    const newMessage: ChatMessage = {
      ...message,
      id: Date.now().toString(),
      timestamp: new Date(),
    };
    
    set((state) => ({
      messages: [...state.messages, newMessage]
    }));
  },
  
  updateMessage: (id, updates) => {
    set((state) => ({
      messages: state.messages.map(msg => 
        msg.id === id ? { ...msg, ...updates } : msg
      )
    }));
  },
  
  clearMessages: () => {
    set({ 
      messages: [{
        id: '1',
        text: "Hi! I can help you find documents in your gallery. Just ask me about any document you're looking for.",
        sender: 'ai',
        timestamp: new Date(),
      }]
    });
  },
  
  setIsTyping: (typing) => set({ isTyping: typing }),
  
  sendMessage: async (text: string) => {
    if (!text.trim()) return;
    
    // Add user message
    get().addMessage({
      text: text.trim(),
      sender: 'user',
    });
    
    // Set typing indicator
    set({ isTyping: true });
    
    try {
      // Simulate AI processing
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // For now, return mock response
      const mockDocuments = [
        { id: '1', uri: 'https://via.placeholder.com/150', title: 'Receipt from Store', type: 'receipt' },
        { id: '2', uri: 'https://via.placeholder.com/150', title: 'Invoice #1234', type: 'invoice' },
      ];
      
      get().addMessage({
        text: `I found ${mockDocuments.length} documents that might match your query:`,
        sender: 'ai',
        documents: mockDocuments,
      });
      
    } catch (error) {
      get().addMessage({
        text: "Sorry, I encountered an error while searching your documents. Please try again.",
        sender: 'ai',
      });
    } finally {
      set({ isTyping: false });
    }
  },
}));