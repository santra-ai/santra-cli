# Santra Project

Santra is a monorepo that encompasses multiple components including a web application, command-line interface (CLI), core backend logic, and shared packages. This repository is structured to facilitate development, testing, and deployment of these components.

## Overview

- **Core**: Contains the core backend logic and utilities.
- **Web**: A Next.js application for the web interface.
- **Agents**: Various agents that perform specific tasks.
- **CLI**: Command-line interface for interacting with the system.
- **Packages**: Shared packages used across different components.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) version 1.3.11
- [Node.js](https://nodejs.org) (if using npm, yarn, or pnpm)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-repo/santra-project.git
   cd santra-project
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

### Running the Web Application

1. Navigate to the `web` directory:
   ```bash
   cd web
   ```

2. Start the development server:
   ```bash
   bun dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Running the CLI

1. Start the CLI:
   ```bash
   bun run cli
   ```

2. For the TUI (Text User Interface):
   ```bash
   bun run tui
   ```

## Project Structure

- **core/**: Core backend logic.
- **web/**: Next.js web application.
- **agents/**: Various agents performing specific tasks.
- **cli/**: Command-line interface.
- **packages/**: Shared packages.

## Development

### Type Checking

Run type checking to ensure your code is type-safe:

```bash
bun run typecheck
```

## License

This project is licensed under the [Apache-2.0 License](LICENSE).

## Contributing

Contributions are welcome! Please read the [CONTRIBUTING.md](CONTRIBUTING.md) file for guidelines on how to contribute.

## Contact

For any questions or issues, please contact the maintainers via [GitHub Issues](https://github.com/your-repo/santra-project/issues).
