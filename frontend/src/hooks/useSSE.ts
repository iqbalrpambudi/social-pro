import { useEffect, useState } from 'react';
import { getApiBaseUrl } from '../lib/api';

export interface SSEEventData {
  publicationId: string;
  targetId?: string;
  platform?: string;
  status: string;
  timestamp: string;
  message?: string;
  details?: Record<string, any>;
}

export function useSSE(onEvent?: (event: SSEEventData) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const [latestEvent, setLatestEvent] = useState<SSEEventData | null>(null);

  useEffect(() => {
    const url = `${getApiBaseUrl()}/v1/events/stream`;
    const es = new EventSource(url);

    es.onopen = () => {
      setIsConnected(true);
    };

    es.addEventListener('connected', () => {
      setIsConnected(true);
    });

    es.addEventListener('publication_status', (e) => {
      try {
        const data: SSEEventData = JSON.parse(e.data);
        setLatestEvent(data);
        if (onEvent) {
          onEvent(data);
        }
      } catch (err) {
        console.error('Error parsing SSE data:', err);
      }
    });

    es.onerror = () => {
      setIsConnected(false);
    };

    return () => {
      es.close();
    };
  }, []);

  return { isConnected, latestEvent };
}
