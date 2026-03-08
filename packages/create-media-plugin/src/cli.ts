import path from "node:path";
import { Command } from "commander";
import prompts from "prompts";
import { scaffoldProject, type Capability, type DependencyMode, type Language } from "./scaffold";

const program = new Command();

program
  .name("create-media-plugin")
  .argument("[directory]", "output directory")
  .option("--ts", "use TypeScript template")
  .option("--js", "use JavaScript template")
  .option("--registry", "use registry package versions instead of local file dependencies")
  .option("--yes", "skip prompts and use defaults")
  .action(
    async (
      directoryArg: string | undefined,
      options: { ts?: boolean; js?: boolean; yes?: boolean; registry?: boolean },
    ) => {
      const promptDefaults = {
        directory: directoryArg ?? "my-media-plugin",
        language: options.ts ? "ts" : options.js ? "js" : "ts",
        capabilities: ["meta", "stream"] as Capability[],
      };

      const shouldPrompt = !options.yes;

      let directory = promptDefaults.directory;
      let language = promptDefaults.language as Language;
      let capabilities = promptDefaults.capabilities;

      if (shouldPrompt) {
        const answers = await prompts(
          [
            {
              type: "text",
              name: "directory",
              message: "Project directory",
              initial: directory,
            },
            {
              type: "select",
              name: "language",
              message: "Template language",
              choices: [
                { title: "TypeScript", value: "ts" },
                { title: "JavaScript", value: "js" },
              ],
              initial: language === "ts" ? 0 : 1,
            },
            {
              type: "multiselect",
              name: "capabilities",
              message: "Plugin capabilities",
              choices: [
                { title: "catalog", value: "catalog" },
                { title: "meta", value: "meta" },
                { title: "stream", value: "stream" },
                { title: "subtitles", value: "subtitles" },
                { title: "plugin_catalog", value: "plugin_catalog" },
              ],
              instructions: false,
              min: 1,
              hint: "Space to select",
              initial: 1,
            },
          ],
          {
            onCancel: () => {
              process.exit(1);
            },
          },
        );

        directory = answers.directory;
        language = answers.language;
        capabilities = answers.capabilities;
      }

      const targetDir = path.resolve(process.cwd(), directory);
      const projectName = path.basename(targetDir);
      const dependencyMode: DependencyMode = options.registry ? "registry" : "local";

      await scaffoldProject({
        targetDir,
        projectName,
        language,
        capabilities,
        dependencyMode,
      });

      console.log(`Created ${projectName} at ${targetDir}`);
      console.log("Next steps:");
      console.log(`  cd ${directory}`);
      console.log("  npm install");
      console.log("  npm run dev");
    },
  );

void program.parseAsync(process.argv);
