export interface LightningSupport {
	supported: boolean;
	reason?: string;
	hasWebGPU: boolean;
	hasWebCodecs: boolean;
}

/**
 * Probes hardware video encoder support for Lightning pipeline.
 * Lightning uses WebGPU rendering (synchronous) + hardware VideoEncoder.
 * Disabled on Linux where hardware encoding is unreliable.
 */
export async function detectLightningSupport(): Promise<LightningSupport> {
	const hasWebCodecs = typeof VideoEncoder !== "undefined" && typeof VideoDecoder !== "undefined";
	const hasWebGPU = typeof navigator !== "undefined" && "gpu" in navigator;

	// Disabled on Linux
	if (typeof navigator !== "undefined" && /linux/i.test(navigator.userAgent)) {
		return {
			supported: false,
			reason: "Lightning is not yet supported on Linux.",
			hasWebGPU,
			hasWebCodecs,
		};
	}

	// Check WebCodecs
	if (!hasWebCodecs) {
		return {
			supported: false,
			reason: "VideoEncoder/VideoDecoder API is not available.",
			hasWebGPU,
			hasWebCodecs,
		};
	}

	// Check WebGPU
	if (!hasWebGPU) {
		return {
			supported: false,
			reason: "WebGPU (navigator.gpu) is not available.",
			hasWebGPU,
			hasWebCodecs,
		};
	}

	// Probe hardware encoder
	try {
		const config: VideoEncoderConfig = {
			codec: "avc1.640033",
			width: 1920,
			height: 1080,
			bitrate: 8_000_000,
			framerate: 60,
			hardwareAcceleration: "prefer-hardware",
		};
		const support = await VideoEncoder.isConfigSupported(config);
		if (!support.supported) {
			return {
				supported: false,
				reason: "Hardware H.264 encoder not supported.",
				hasWebGPU,
				hasWebCodecs,
			};
		}
	} catch {
		return {
			supported: false,
			reason: "Failed to probe hardware encoder support.",
			hasWebGPU,
			hasWebCodecs,
		};
	}

	return { supported: true, hasWebGPU, hasWebCodecs };
}

export function buildPipelinePath(
	rendererType: string,
	codec: string,
	acceleration: string,
): string {
	const renderer =
		rendererType === "webgpu" ? "WebGPU" : rendererType === "webgl" ? "WebGL" : "Unknown";
	return `${renderer} + WebCodecs (${codec}/${acceleration})`;
}
