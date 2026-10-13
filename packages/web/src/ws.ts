import { useCallback, useEffect, useRef, useState } from 'react';
import type { Role } from '@ashour/shared';
import { randomId } from './id';
export function identity(role: Role) {
  const key = `ashour-${role}`;
  let id = localStorage.getItem(key + '-id');
  if (!id) {
    id = randomId();
    localStorage.setItem(key + '-id', id);
  }
  return { id, token: localStorage.getItem(key + '-token') ?? undefined, key };
}
export function useConnection(role: Role, pin: string, onAck?: (type: string) => void) {
  const [snapshot, setSnapshot] = useState<any>(null),
    [connected, setConnected] = useState(false),
    [error, setError] = useState(''),
    [offset, setOffset] = useState(0);
  const ws = useRef<WebSocket | null>(null);
  const pending = useRef<Map<string, string>>(new Map());
  const ackRef = useRef(onAck);
  ackRef.current = onAck;
  const samples = useRef<{ offset: number; rtt: number }[]>([]);
  useEffect(() => {
    if (role === 'admin' && !pin) return;
    let stop = false,
      retry: ReturnType<typeof setTimeout>,
      sync: ReturnType<typeof setInterval>;
    let burst: ReturnType<typeof setInterval>;
    function open() {
      if (stop) return;
      const socket = new WebSocket(
        `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
      );
      ws.current = socket;
      socket.onopen = () => {
        const d = identity(role);
        socket.send(
          JSON.stringify({
            v: 1,
            type: 'hello',
            payload: {
              role,
              deviceId: d.id,
              deviceToken: d.token,
              ...(role === 'admin' ? { pin } : {}),
            },
          }),
        );
      };
      function ping() {
        if (socket.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify({ v: 1, type: 'time.ping', payload: { c0: Date.now() } }));
      }
      function syncClock() {
        samples.current = [];
        let n = 0;
        clearInterval(burst);
        burst = setInterval(() => {
          ping();
          if (++n === 8) clearInterval(burst);
        }, 100);
      }
      socket.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type === 'hello.ok') {
          localStorage.setItem(identity(role).key + '-token', m.payload.deviceToken);
          setConnected(true);
          setError('');
          syncClock();
          sync = setInterval(syncClock, 10000);
        }
        if (m.type === 'state.snapshot') setSnapshot(m.payload);
        if (m.type === 'error') {
          if (m.payload.cmdId) pending.current.delete(m.payload.cmdId);
          setError(m.payload.message);
        }
        if (m.type === 'command.ack') {
          const type = pending.current.get(m.payload.cmdId);
          pending.current.delete(m.payload.cmdId);
          if (type) ackRef.current?.(type);
        }
        if (m.type === 'time.pong') {
          const now = Date.now();
          samples.current.push({
            rtt: now - m.payload.c0,
            offset: m.payload.s1 - (m.payload.c0 + now) / 2,
          });
          const sorted = [...samples.current].sort((a, b) => a.offset - b.offset);
          setOffset(sorted[Math.floor(sorted.length / 2)].offset);
        }
      };
      socket.onclose = () => {
        setConnected(false);
        clearInterval(sync);
        clearInterval(burst);
        if (!stop) retry = setTimeout(open, 1500);
      };
      socket.onerror = () => setConnected(false);
    }
    open();
    return () => {
      stop = true;
      clearTimeout(retry);
      clearInterval(sync);
      clearInterval(burst);
      ws.current?.close();
    };
  }, [role, pin]);
  const send = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    setError('');
    if (ws.current?.readyState !== WebSocket.OPEN) {
      setError('Connection unavailable');
      return;
    }
    const cmdId = randomId();
    pending.current.set(cmdId, type);
    ws.current.send(JSON.stringify({ v: 1, type, cmdId, payload }));
  }, []);
  async function bulk(type: string, payload: unknown) {
    setError('');
    try {
      const response = await fetch('/api/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${identity(role).token}`,
        },
        body: JSON.stringify({ type, cmdId: randomId(), payload }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  }
  return { snapshot, connected, error, setError, send, bulk, offset };
}
