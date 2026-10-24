import { createRootRoute, Outlet } from '@tanstack/react-router';
import React from 'react';

type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'event';

type LogEntry = {
	id: number;
	time: string;
	level: LogLevel;
	message: string;
};

const MAX_LOG_ENTRIES = 500;

function formatLogValue(value: unknown): string {
	if (value instanceof Error) {
		return value.stack || `${value.name}: ${value.message}`;
	}
	if (typeof value === 'string') return value;
	try {
		const serialized = JSON.stringify(value);
		return serialized === undefined ? String(value) : serialized;
	} catch {
		return String(value);
	}
}

export const Route = createRootRoute({
	component: RootComponent
});

function RootComponent() {
	const [logs, setLogs] = React.useState<LogEntry[]>([]);
	const [logsOpen, setLogsOpen] = React.useState(false);
	const logId = React.useRef(0);
	const logEndRef = React.useRef<HTMLDivElement>(null);

	const addLog = React.useCallback((level: LogLevel, message: string) => {
		const now = new Date();
		const time = now.toLocaleTimeString([], { hour12: false });
		const entry: LogEntry = { id: ++logId.current, time, level, message };
		setLogs((current) => [...current, entry].slice(-MAX_LOG_ENTRIES));
	}, []);

	React.useEffect(() => {
		const original = {
			log: console.log.bind(console),
			info: console.info.bind(console),
			warn: console.warn.bind(console),
			error: console.error.bind(console)
		};

		const capture = (level: Exclude<LogLevel, 'event'>, args: unknown[]) => {
			addLog(level, args.map(formatLogValue).join(' '));
			original[level](...args);
		};

		console.log = (...args) => capture('log', args);
		console.info = (...args) => capture('info', args);
		console.warn = (...args) => capture('warn', args);
		console.error = (...args) => capture('error', args);

		const onError = (event: ErrorEvent) => {
			addLog('error', `Uncaught error: ${event.message} (${event.filename || 'unknown file'}:${event.lineno ?? 0}:${event.colno ?? 0})${event.error ? `\\n${formatLogValue(event.error)}` : ''}`);
		};
		const onRejection = (event: PromiseRejectionEvent) => {
			addLog('error', `Unhandled promise rejection: ${formatLogValue(event.reason)}`);
		};
		const onClick = (event: MouseEvent) => {
			const target = event.target instanceof Element ? event.target.closest('button, [role="button"], a, input, select, [tabindex]') : null;
			if (!target) return;
			const element = target as HTMLElement;
			const label = element.getAttribute('aria-label') || element.getAttribute('title') || element.innerText?.trim() || element.getAttribute('name') || element.tagName.toLowerCase();
			addLog('event', `Click: <${element.tagName.toLowerCase()}> "${label.slice(0, 120)}"`);
		};

		window.addEventListener('error', onError);
		window.addEventListener('unhandledrejection', onRejection);
		window.addEventListener('click', onClick, true);

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.altKey && event.key.toLowerCase() === 'l') {
				event.preventDefault();
				event.stopPropagation();
				setLogsOpen((open) => !open);
			}
			if (event.key === 'Escape') setLogsOpen(false);
		};
		window.addEventListener('keydown', onKeyDown, true);

		addLog('info', 'Log viewer ready. Press Alt+L to show or hide logs.');
		return () => {
			console.log = original.log;
			console.info = original.info;
			console.warn = original.warn;
			console.error = original.error;
			window.removeEventListener('error', onError);
			window.removeEventListener('unhandledrejection', onRejection);
			window.removeEventListener('click', onClick, true);
			window.removeEventListener('keydown', onKeyDown, true);
		};
	}, [addLog]);

	React.useEffect(() => {
		if (logsOpen) logEndRef.current?.scrollIntoView({ block: 'end' });
	}, [logs, logsOpen]);

	const copyLogs = async () => {
		const text = logs.map((entry) => `[${entry.time}] [${entry.level.toUpperCase()}] ${entry.message}`).join('\\n');
		try {
			await navigator.clipboard.writeText(text);
			addLog('info', 'Logs copied to clipboard.');
		} catch (error) {
			addLog('error', `Could not copy logs: ${formatLogValue(error)}`);
		}
	};

	return (
		<>
			<Outlet />
			{logsOpen && (
				<div
					role="dialog"
					aria-label="FocusCat logs"
					style={{
						position: 'fixed', inset: 0, zIndex: 2147483647, display: 'flex',
						flexDirection: 'column', background: '#111318', color: '#e8eaf0',
						fontFamily: 'Consolas, "Cascadia Code", monospace', fontSize: 12,
						padding: 12, boxSizing: 'border-box'
					}}
				>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexShrink: 0 }}>
						<strong style={{ fontSize: 14, marginRight: 'auto' }}>FocusCat logs ({logs.length})</strong>
						<span style={{ color: '#9ca3af' }}>Alt+L toggles · Esc closes</span>
						<button onClick={() => void copyLogs()} style={logButtonStyle}>Copy logs</button>
						<button onClick={() => setLogs([])} style={logButtonStyle}>Clear</button>
						<button onClick={() => setLogsOpen(false)} style={logButtonStyle}>Close</button>
					</div>
					<div style={{ overflow: 'auto', flex: 1, border: '1px solid #343844', borderRadius: 6, padding: 8 }}>
						{logs.length === 0 && <div style={{ color: '#9ca3af' }}>No logs captured yet. Click the broken button and check again.</div>}
						{logs.map((entry) => (
							<div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '72px 54px minmax(0, 1fr)', gap: 8, padding: '3px 0', borderBottom: '1px solid #242731', color: entry.level === 'error' ? '#ff8b8b' : entry.level === 'warn' ? '#ffd479' : entry.level === 'event' ? '#91c8ff' : '#d1d5db', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
								<span style={{ color: '#9ca3af' }}>{entry.time}</span>
								<span>[{entry.level.toUpperCase()}]</span>
								<span>{entry.message}</span>
							</div>
						))}
						<div ref={logEndRef} />
					</div>
				</div>
			)}
		</>
	);
}

const logButtonStyle: React.CSSProperties = {
	background: '#292d38',
	color: '#f3f4f6',
	border: '1px solid #464b59',
	borderRadius: 5,
	padding: '6px 9px',
	cursor: 'pointer'
};
