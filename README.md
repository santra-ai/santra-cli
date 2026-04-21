# Santra

Santra is a CLI-based coding assistant designed to help developers with their coding tasks. It provides a range of features to streamline the development process and improve productivity.

## Features

- **Code Generation**: Automatically generate code snippets and templates.
- **Code Review**: Perform code reviews and suggest improvements.
- **Documentation**: Generate and update documentation based on code.
- **Task Management**: Manage and track coding tasks and to-dos.

## Getting Started

To get started with Santra, follow these steps:

1. Install Santra using npm: `npm install -g santra`
2. PATH setup is attempted automatically during install.
3. If `santra` is still not in PATH, run setup manually: `npx santra --install-shell`
4. Apply the profile update without restarting:

- zsh: `source ~/.zshrc`
- bash: `source ~/.bashrc`

5. Run Santra in your project directory: `santra`

If you'd rather avoid global install, you can run Santra directly with `npx santra`.

## Usage

For detailed usage instructions and available commands, refer to the [docs](docs/README.md).

## Subdirectories

### core/

- **Purpose**: Contains the core logic and utilities for Santra.
- **Key Files**:
  - `index.ts`: Exports the main `Runner` class and related types.
  - `src/runner.ts`: Implements the main runner logic.
  - `src/classifier.ts`: Handles prompt classification.

### web/

- **Purpose**: Contains the web application built with Next.js.
- **Key Files**:
  - `README.md`: Provides instructions for running and deploying the web application.
  - `app/page.tsx`: Main page component.

### agents/

- **Purpose**: Contains specialized agents that perform specific tasks within Santra.
- **Key Files**:
  - `README.md`: Describes available agents and guidelines for developing new agents.
  - `file-picker.ts`: Agent for finding relevant files.
  - `reader.ts`: Agent for explaining architecture or synthesizing repository context.
  - `executor.ts`: Agent for implementing larger edits.
  - `reviewer.ts`: Agent for critiquing or summarizing recent work.
  - `thinker.ts`: Agent for reasoning through tricky decisions.

### cli/

- **Purpose**: Contains the CLI application workspace package.
- **Key Files**:
  - `README.md`: Provides instructions for running the CLI in development mode.
  - `index.ts`: Main entry point for the CLI.

### docs/

- **Purpose**: Contains documentation for using and contributing to Santra.
- **Key Files**:
  - `README.md`: Provides an overview of the documentation structure.
  - `user_guide.md`: Detailed user guide.
  - `developer_guide.md`: Detailed developer guide.

### codebuff-main/

- **Purpose**: Contains the main Codebuff and Freebuff modules.
- **Key Files**:
  - `README.md`: Provides an overview of Codebuff and Freebuff.
  - `packages/agent-runtime/src/templates/README.md`: Describes templates used by the agent runtime.
  - `scripts/tmux/README.md`: Describes tmux scripts used for development.
  - `scripts/tmux/tmux-viewer/README.md`: Describes tmux viewer scripts.
  - `scripts/ft-file-selection/README.md`: Describes file selection scripts.
  - `sdk/README.md`: Provides an overview of the SDK.
  - `sdk/e2e/README.md`: Describes end-to-end tests for the SDK.
  - `python-app/README.md`: Provides an overview of the Python application.
  - `common/src/templates/initial-agents-dir/README.md`: Describes initial agent directory templates.
  - `common/src/templates/initial-agents-dir/skills/README.md`: Describes initial agent skills templates.
  - `cli/README.md`: Provides an overview of the CLI.
  - `cli/src/__tests__/README.md`: Describes tests for the CLI.
  - `cli/release/README.md`: Describes the release process for the CLI.
  - `cli/release-staging/README.md`: Describes the staging release process for the CLI.
  - `web/README.md`: Provides an overview of the web application.
  - `freebuff/README.md`: Provides an overview of the freebuff module.
  - `freebuff/e2e/README.md`: Describes end-to-end tests for freebuff.
  - `freebuff/cli/release/README.md`: Describes the release process for freebuff CLI.
  - `evals/README.md`: Provides an overview of the evaluation tools.
  - `evals/buffbench/README.md`: Describes the buffbench evaluation tool.

### packages/

- **Purpose**: Contains shared packages used across the project.
- **Key Files**:
  - `shared/README.md`: Provides an overview of the shared package.

## Contributing

Contributions to Santra are welcome! Please see the [contributing guidelines](CONTRIBUTING.md) for more information.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Recent Updates

- **Improved Code Generation**: Enhanced the code generation feature to support more complex templates and snippets.
- **Enhanced Code Review**: Added new features to the code review agent for better suggestions and feedback.
- **Updated Documentation**: Updated the documentation to include new features and usage instructions.
- **Bug Fixes**: Resolved several bugs in the CLI and web application for a smoother user experience.
