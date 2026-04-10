import { useState, type FormEvent } from 'react';

interface RunFormProps {
  onSubmit: (sessionId: string, query: string) => void;
  isDisabled: boolean;
}

export function RunForm({ onSubmit, isDisabled }: RunFormProps) {
  const [sessionId, setSessionId] = useState(crypto.randomUUID());
  const [query, setQuery] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSubmit(sessionId, query.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div>
        <label htmlFor="session-id" style={{ display: 'block', fontSize: '0.75rem', color: '#808090', marginBottom: '0.25rem' }}>
          Session ID
        </label>
        <input
          id="session-id"
          type="text"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            background: '#1a1a24',
            border: '1px solid #2a2a3a',
            borderRadius: 6,
            color: '#e0e0e8',
            fontSize: '0.8125rem',
            fontFamily: 'monospace',
          }}
        />
      </div>

      <div>
        <label htmlFor="query" style={{ display: 'block', fontSize: '0.75rem', color: '#808090', marginBottom: '0.25rem' }}>
          Query
        </label>
        <textarea
          id="query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask the research assistant something..."
          rows={3}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            background: '#1a1a24',
            border: '1px solid #2a2a3a',
            borderRadius: 6,
            color: '#e0e0e8',
            fontSize: '0.875rem',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
      </div>

      <button
        type="submit"
        disabled={isDisabled || !query.trim()}
        style={{
          padding: '0.625rem 1.25rem',
          background: isDisabled ? '#2a2a3a' : '#4040cc',
          border: 'none',
          borderRadius: 6,
          color: '#fff',
          fontSize: '0.875rem',
          fontWeight: 500,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          alignSelf: 'flex-start',
        }}
      >
        {isDisabled ? 'Running...' : 'Submit Run'}
      </button>
    </form>
  );
}
