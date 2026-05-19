export interface LightningSupport {
	supported: boolean;
	reason?: string;
}

/**
 * Probes hardware video encoder support for Lightning pipeline.
 * Lightning uses WebGL rendering (synchronous) + hardware VideoEncoder.
 * Disabled on Linux where hardware encoding is unreliable.
 */
export async function detectLightningSupport(): Promise<LightningSupport> {
	// Disabled on Linux
	if (typeof navigator !== "undefined" && /linux/i.test(navigator.userAgent)) {
		return { supported: false, reason: "Lightning is not yet supported on Linux." };
	}

	// Check hardware video encoder
	if (typeof VideoEncoder === "undefined") {
		return { supported: false, reason: "VideoEncoder API is not available." };
	}

	try {
		const config: VideoEncoderConfig = {
			codec: "avc1.640033",
			width: 1920,
			height: 1080,
			bitrate: 10_000_000,
			framerate: 60,
			hardwareAcceleration: "prefer-hardware",
			latencyMode: "quality",
			bitrateMode: "variable",
		};
		const support = await VideoEncoder.isConfigSupported(config);
		if (!support.supported) {
			return { supported: false, reason: "Hardware H.264 encoder not supported." };
		}
	} catch {
		return { supported: false, reason: "Failed to probe hardware encoder support." };
	}

	return { supported: true };
}

export function buildPipelinePath(opts: {
	rendererType: "webgpu" | "webgl" | "unknown";
	codec: string;
	hardwareAcceleration: string;
	latencyMode: string;
}): string {
	const renderer =
		opts.rendererType === "webgpu" ? "WebGPU" : opts.rendererType === "webgl" ? "WebGL" : "Unknown";
	return `${renderer} + WebCodecs (${opts.codec}/${opts.hardwareAcceleration}/${opts.latencyMode})`;
}
