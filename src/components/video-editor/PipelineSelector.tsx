import { Zap } from "lucide-react";
import { useScopedT } from "@/contexts/I18nContext";
import type { ExportPipeline } from "@/lib/exporter";

interface PipelineSelectorProps {
	value: ExportPipeline;
	onChange: (pipeline: ExportPipeline) => void;
	lightningSupported: boolean;
	lightningSupportReason?: string;
}

export function PipelineSelector({
	value,
	onChange,
	lightningSupported,
	lightningSupportReason,
}: PipelineSelectorProps) {
	const t = useScopedT("settings");

	return (
		<div className="space-y-2">
			<span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
				{t("export.pipeline")}
			</span>
			<div className="relative flex rounded-lg border border-border/50 bg-muted/30 p-1">
				{/* Animated pill background */}
				<div
					className="absolute top-1 bottom-1 rounded-md bg-background border border-border shadow-sm transition-all duration-200 ease-out"
					style={{
						left: value === "legacy" ? "4px" : "50%",
						right: value === "lightning" ? "4px" : "50%",
					}}
				/>
				<button
					type="button"
					onClick={() => onChange("legacy")}
					className={`relative z-10 flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
						value === "legacy"
							? "text-foreground"
							: "text-muted-foreground hover:text-foreground/70"
					}`}
				>
					{t("export.pipelineLegacy")}
				</button>
				<button
					type="button"
					onClick={() => lightningSupported && onChange("lightning")}
					disabled={!lightningSupported}
					title={!lightningSupported ? lightningSupportReason : undefined}
					className={`relative z-10 flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
						value === "lightning"
							? "text-foreground"
							: lightningSupported
								? "text-muted-foreground hover:text-foreground/70"
								: "text-muted-foreground/40 cursor-not-allowed"
					}`}
				>
					<Zap className="h-3.5 w-3.5" />
					{t("export.pipelineLightning")}
				</button>
			</div>
			<p className="text-xs text-muted-foreground">
				{value === "lightning" ? t("export.pipelineLightningHint") : t("export.pipelineLegacyHint")}
			</p>
		</div>
	);
}
