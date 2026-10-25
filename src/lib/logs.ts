// Log text -> structured lines, optionally filtered by regex and classified with suggested next steps.
import { classifyLogLine, severityAtLeast, type LogMatch, type Severity } from './analysis';

export interface LogLine {
	lineNumber?: number;
	timestamp?: string;
	line: string;
	severity?: Severity;
	category?: string;
	rule?: string;
	nextSteps?: string[];
}

export interface LogFilter {
	/** Case-insensitive regex; only matching lines are kept. */
	pattern?: string;
	/** Attach severity / category / next steps from the built-in rules. */
	analyze?: boolean;
	/** With analyze: drop lines that match no rule or are below this severity. */
	minSeverity?: Severity | 'all';
}

export function splitLogContent(content: string, startLine?: number | null): LogLine[] {
	const raw = content.split(/\r?\n/);
	if (raw.length && raw[raw.length - 1] === '') raw.pop();
	return raw.map((line, i) => ({ lineNumber: startLine ? startLine + i : undefined, line }));
}

export function compilePattern(pattern: string | undefined): RegExp | undefined {
	if (!pattern?.trim()) return undefined;
	try {
		return new RegExp(pattern, 'i');
	} catch (error) {
		throw new Error(`Invalid filter pattern "${pattern}": ${(error as Error).message}`);
	}
}

export function filterLogLines(lines: LogLine[], filter: LogFilter): LogLine[] {
	const regex = compilePattern(filter.pattern);
	const out: LogLine[] = [];
	for (const l of lines) {
		if (regex && !regex.test(l.line)) continue;
		if (filter.analyze) {
			const match: LogMatch | null = classifyLogLine(l.line);
			if (filter.minSeverity && filter.minSeverity !== 'all' && (!match || !severityAtLeast(match.severity, filter.minSeverity))) continue;
			out.push(match ? { ...l, ...match } : l);
		} else {
			out.push(l);
		}
	}
	return out;
}
