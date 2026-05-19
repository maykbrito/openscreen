import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { accessSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface ExportSession {
	id: string;
	process: ChildProcess;
	outputPath: string;
	writeQueue: Promise<void>;
}

const sessions = new Map<string, ExportSession>();

function getFFmpegPath(): string {
	try {
		return require("ffmpeg-static");
	} catch {
		// ffmpeg-static not installed
	}
	const paths = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"];
	for (const p of paths) {
		try {
			accessSync(p);
			return p;
		} catch {
			// Not found at this path, try next
		}
	}
	throw new Error("FFmpeg not found. Install ffmpeg or ffmpeg-static.");
}

export function startNativeExport(config: {
	width: number;
	height: number;
	frameRate: number;
}): string {
	const id = randomUUID();
	const outputPath = join(tmpdir(), `openscreen-export-${id}.mp4`);
	const ffmpegPath = getFFmpegPath();

	const args = [
		"-y",
		"-hide_banner",
		"-loglevel",
		"error",
		"-f",
		"h264",
		"-r",
		String(config.frameRate),
		"-i",
		"pipe:0",
		"-an",
		"-c:v",
		"copy",
		"-movflags",
		"+faststart",
		outputPath,
	];

	const proc = spawn(ffmpegPath, args, { stdio: ["pipe", "ignore", "pipe"] });

	proc.stderr?.on("data", () => {
		// Drain stderr to prevent backpressure
	});

	sessions.set(id, { id, process: proc, outputPath, writeQueue: Promise.resolve() });
	return id;
}

export async function writeNativeFrame(sessionId: string, frameData: Uint8Array): Promise<void> {
	const session = sessions.get(sessionId);
	if (!session) throw new Error(`Export session ${sessionId} not found`);

	session.writeQueue = session.writeQueue.then(
		() =>
			new Promise<void>((resolve, reject) => {
				if (!session.process.stdin || session.process.stdin.destroyed) {
					reject(new Error("FFmpeg stdin closed"));
					return;
				}
				const buffer = Buffer.from(frameData);
				const ok = session.process.stdin.write(buffer, (err) => {
					if (err) reject(err);
					else resolve();
				});
				if (!ok) {
					session.process.stdin.once("drain", () => resolve());
				}
			}),
	);

	return session.writeQueue;
}

export async function finishNativeExport(sessionId: string): Promise<string> {
	const session = sessions.get(sessionId);
	if (!session) throw new Error(`Export session ${sessionId} not found`);

	await session.writeQueue;

	return new Promise<string>((resolve, reject) => {
		session.process.stdin?.end();
		session.process.on("close", (code) => {
			sessions.delete(sessionId);
			if (code === 0) resolve(session.outputPath);
			else reject(new Error(`FFmpeg exited with code ${code}`));
		});
		session.process.on("error", (err) => {
			sessions.delete(sessionId);
			reject(err);
		});
	});
}

export function cancelNativeExport(sessionId: string): void {
	const session = sessions.get(sessionId);
	if (session) {
		session.process.kill("SIGKILL");
		sessions.delete(sessionId);
	}
}
