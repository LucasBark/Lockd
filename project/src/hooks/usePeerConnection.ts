import { useState, useEffect, useRef, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';

export interface StudentHeartbeat {
  studentId: string;
  studentName: string;
  isTabActive: boolean;
  isWindowFocused: boolean;
  lastInput: number;
  snippet: string;
}

interface UsePeerConnectionProps {
  role: 'teacher' | 'student';
  onReceiveHeartbeat?: (data: StudentHeartbeat) => void;
  teacherPeerId?: string;
}

export function usePeerConnection({ role, onReceiveHeartbeat, teacherPeerId }: UsePeerConnectionProps) {
  const [peer, setPeer] = useState<Peer | null>(null);
  const [peerId, setPeerId] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [connections, setConnections] = useState<Map<string, DataConnection>>(new Map());
  const connectionRef = useRef<DataConnection | null>(null);

  useEffect(() => {
    const newPeer = new Peer();

    newPeer.on('open', (id) => {
      setPeerId(id);
      setPeer(newPeer);
    });

    if (role === 'teacher') {
      newPeer.on('connection', (conn) => {
        conn.on('open', () => {
          setConnections((prev) => {
            const newMap = new Map(prev);
            newMap.set(conn.peer, conn);
            return newMap;
          });
        });

        conn.on('data', (data) => {
          if (onReceiveHeartbeat) {
            onReceiveHeartbeat(data as StudentHeartbeat);
          }
        });

        conn.on('close', () => {
          setConnections((prev) => {
            const newMap = new Map(prev);
            newMap.delete(conn.peer);
            return newMap;
          });
        });
      });
    }

    return () => {
      newPeer.destroy();
    };
  }, [role, onReceiveHeartbeat]);

  const connectToTeacher = useCallback((targetPeerId: string) => {
    if (!peer || role !== 'student') return;

    const conn = peer.connect(targetPeerId);

    conn.on('open', () => {
      connectionRef.current = conn;
      setIsConnected(true);
    });

    conn.on('close', () => {
      connectionRef.current = null;
      setIsConnected(false);
    });

    conn.on('error', (err) => {
      console.error('Connection error:', err);
      setIsConnected(false);
    });
  }, [peer, role]);

  const sendHeartbeat = useCallback((data: StudentHeartbeat) => {
    if (connectionRef.current && connectionRef.current.open) {
      connectionRef.current.send(data);
    }
  }, []);

  useEffect(() => {
    if (role === 'student' && teacherPeerId && peer) {
      connectToTeacher(teacherPeerId);
    }
  }, [role, teacherPeerId, peer, connectToTeacher]);

  return {
    peerId,
    isConnected,
    sendHeartbeat,
    connections,
    connectToTeacher,
  };
}
