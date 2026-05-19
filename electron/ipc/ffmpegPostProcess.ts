import { execFile } from "child_process";
import { ipcMain } from "electron";
import * as fs from "fs/promises";
import * as path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

function getFfmpegPath(): string {
	let ffmpegPath = require("ffmpeg-static") as string;
	if (ffmpegPath.includes("app.asar")) {
		ffmpegPath = ffmpegPath.replace("app.asar", "app.asar.unpacked");
	}
	return ffmpegPath;
}

interface PostProcessOptions {
	filePath: string;
	compress: boolean;
	speedUp: boolean;
}

interface PostProcessResult {
	success: boolean;
	message: string;
	originalSize?: number;
	finalSize?: number;
}

export function registerFfmpegPostProcessHandler(): void {
	ipcMain.handle(
		"post-process-export",
		async (_, options: PostProcessOptions): Promise<PostProcessResult> => {
			const { filePath, compress, speedUp } = options;

			if (!filePath || !path.isAbsolute(filePath)) {
				return { success: false, message: "Invalid file path" };
			}

			if (!compress && !speedUp) {
				return { success: true, message: "No post-processing needed" };
			}

			try {
				const ffmpegPath = getFfmpegPath();
				const stat = await fs.stat(filePath);
				const originalSize = stat.size;

				const dir = path.dirname(filePath);
				const ext = path.extname(filePath);
				const base = path.basename(filePath, ext);
				const tempPath = path.join(dir, `${base}_processing${ext}`);

				const args: string[] = ["-y", "-i", filePath];

				if (speedUp) {
					args.push("-vf", "setpts=PTS/1.15");
					args.push("-af", "atempo=1.15");
				}

				if (compress) {
					args.push("-c:v", "libx264", "-crf", "23", "-preset", "medium");
					args.push("-c:a", "aac");
				}

				args.push(tempPath);

				await execFileAsync(ffmpegPath, args, { timeout: 300000 });

				await fs.unlink(filePath);
				await fs.rename(tempPath, filePath);

				const finalStat = await fs.stat(filePath);

				return {
					success: true,
					message: "Post-processing complete",
					originalSize,
					finalSize: finalStat.size,
				};
			} catch (error) {
				console.error("FFmpeg post-processing failed:", error);
				const dir = path.dirname(filePath);
				const ext = path.extname(filePath);
				const base = path.basename(filePath, ext);
				const tempPath = path.join(dir, `${base}_processing${ext}`);
				try {
					await fs.unlink(tempPath);
				} catch {
					/* ignore */
				}
				return {
					success: false,
					message: `Post-processing failed: ${String(error)}`,
				};
			}
		},
	);
}
