# Santra Project

Santra is a monorepo that includes a CLI, web application, core functionalities, and shared packages. This repository is structured to facilitate development and collaboration across different components of the Santra ecosystem.

## Overview

- **CLI**: Command-line interface for interacting with Santra.
- **Web**: Web application built with Next.js.
- **Core**: Core functionalities and utilities.
- **Agents**: Various agents used by the CLI and web application.
- **Shared**: Shared types and validation schemas.
- **Agent Runtime**: Runtime environment for agents.

## Getting Started

### Prerequisites

- Node.js (v20.x)
- Bun (v1.3.11)
- TypeScript (v6.x)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-repo/santra.git
   cd santra
   ```
2. Install dependencies:
   ```bash
   bun install
   ```

### Running the CLI

To run the Santra CLI, use the following command:
```bash
bun cli/index.ts
```

### Running the Web Application

To start the development server for the web application, use:
```bash
bun web
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Structure

- **core/**: Core functionalities and utilities.
  - `index.ts`: Exports the `Runner` class and its types.
- **cli/**: Command-line interface for interacting with Santra.
  - `README.md`: Documentation for the CLI.
  - `package.json`: Configuration for the CLI package.
- **web/**: Web application built with Next.js.
  - `README.md`: Documentation for the web application.
  - `package.json`: Configuration for the web package.
- **agents/**: Various agents used by the CLI and web application.
  - `index.ts`: Registry and prompts for agents.
- **packages/**: Shared packages and agent runtime.
  - **shared/**: Shared types and validation schemas.
    - `README.md`: Documentation for shared packages.
    - `package.json`: Configuration for shared packages.
  - **agent-runtime/**: Runtime environment for agents.
    - `package.json`: Configuration for agent runtime.

## Configuration

- **tsconfig.json**: TypeScript configuration for the entire monorepo.
- **package.json**: Root configuration for the monorepo, including scripts and workspaces.

## Scripts

- `web`: Starts the development server for the web application.
- `cli`: Runs the Santra CLI.
- `tui`: Runs the TUI for the Santra CLI.
- `typecheck`: Runs TypeScript type checking for the entire monorepo.

## License

This project is licensed under the Apache-2.0 License - see the [LICENSE](LICENSE) file for details.
