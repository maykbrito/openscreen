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
		<div className="space-y-1.5">
			<span className="text-xs font-medium text-muted-foreground">{t("export.pipeline")}</span>
			<div className="flex gap-1.5">
				<button
					type="button"
					onClick={() => onChange("legacy")}
					className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
						value === "legacy"
							? "bg-primary text-primary-foreground"
							: "bg-muted text-muted-foreground hover:bg-muted/80"
					}`}
				>
					{t("export.pipelineLegacy")}
				</button>
				<button
					type="button"
					onClick={() => lightningSupported && onChange("lightning")}
					disabled={!lightningSupported}
					title={!lightningSupported ? lightningSupportReason : undefined}
					className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
						value === "lightning"
							? "bg-amber-500 text-white"
							: lightningSupported
								? "bg-muted text-muted-foreground hover:bg-muted/80"
								: "bg-muted text-muted-foreground/50 cursor-not-allowed"
					}`}
				>
					<Zap className="h-3 w-3" />
					{t("export.pipelineLightning")}
				</button>
			</div>
		</div>
	);
}
