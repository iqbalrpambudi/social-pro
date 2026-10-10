import { EventEmitter } from 'events';
import { logger } from './logger.js';

export interface PublicationStreamEvent {
  publicationId: string;
  targetId?: string;
  platform?: string;
  status: string;
  timestamp: string;
  message?: string;
  details?: Record<string, any>;
}

class SSEHub extends EventEmitter {
  constructor() {
    super();
    // Allow multiple concurrent frontend clients
    this.setMaxListeners(100);
  }

  broadcast(event: PublicationStreamEvent) {
    logger.debug({ event }, 'Broadcasting SSE event');
    this.emit('publication_event', event);
  }
}

export const sseHub = new SSEHub();
