import type {
	ProjectContext,
	ProjectFileResult,
	ProjectPathResult,
} from "../../../src/native/contracts";
import type { NativeBridgeStateStore } from "../store";

interface ProjectServiceOptions {
	store: NativeBridgeStateStore;
	getCurrentProjectPath: () => string | null;
	getCurrentVideoPath: () => string | null;
	saveProjectFile: (
		projectData: unknown,
		suggestedName?: string,
		existingProjectPath?: string,
		defaultDir?: string,
	) => Promise<ProjectFileResult>;
	loadProjectFile: (defaultDir?: string) => Promise<ProjectFileResult>;
	loadCurrentProjectFile: () => Promise<ProjectFileResult>;
	setCurrentVideoPath: (path: string) => ProjectPathResult | Promise<ProjectPathResult>;
	getCurrentVideoPathResult: () => ProjectPathResult;
	clearCurrentVideoPath: () => ProjectPathResult;
}

export class ProjectService {
	constructor(private readonly options: ProjectServiceOptions) {}

	getCurrentContext(): ProjectContext {
		const context = {
			currentProjectPath: this.options.getCurrentProjectPath(),
			currentVideoPath: this.options.getCurrentVideoPath(),
		};

		this.options.store.setProjectContext(context);
		return context;
	}

	async saveProjectFile(
		projectData: unknown,
		suggestedName?: string,
		existingProjectPath?: string,
		defaultDir?: string,
	) {
		const result = await this.options.saveProjectFile(
			projectData,
			suggestedName,
			existingProjectPath,
			defaultDir,
		);
		this.getCurrentContext();
		return result;
	}

	async loadProjectFile(defaultDir?: string) {
		const result = await this.options.loadProjectFile(defaultDir);
		this.getCurrentContext();
		return result;
	}

	async loadCurrentProjectFile() {
		const result = await this.options.loadCurrentProjectFile();
		this.getCurrentContext();
		return result;
	}

	async setCurrentVideoPath(path: string) {
		const result = await this.options.setCurrentVideoPath(path);
		this.getCurrentContext();
		return result;
	}

	getCurrentVideoPath() {
		const result = this.options.getCurrentVideoPathResult();
		this.getCurrentContext();
		return result;
	}

	clearCurrentVideoPath() {
		const result = this.options.clearCurrentVideoPath();
		this.getCurrentContext();
		return result;
	}
}
