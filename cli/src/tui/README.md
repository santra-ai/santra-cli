# Santra React Application

Santra React Application is a sophisticated, interactive terminal-based user interface (TUI) built with React and Ink. It serves as a powerful tool for managing tasks, reviewing file changes, and interacting with a virtual agent through a command-line interface. The application is designed to be intuitive and efficient, providing real-time feedback and detailed statistics.

## Key Features
- **Interactive Sidebar**: Displays tasks and files, allowing users to navigate and interact with them effortlessly.
- **Agent Log**: Shows log entries with timestamps, levels, and messages, including icons for different log levels and the ability to display diffs.
- **Diff View**: Provides a readable format for displaying differences between files, aiding in code reviews and changes tracking.
- **Input Bar**: Accepts user input and provides suggestions based on the input, enhancing user experience.
- **Status Bar**: Displays statistics such as model usage, token count, and elapsed time, along with an input field for user commands.

## Project Structure
The project consists of the following directories and files:
- **index.tsx**: The entry point of the application, which renders the `App` component.
- **App.tsx**: The main component that renders the user interface, including a sidebar, main panel, and status bar.
- **types/**: Contains type definitions used throughout the application.
  - **index.ts**: Defines types such as `Task`, `FileEntry`, `LogEntry`, `AgentStats`, and `ShellState`.
- **components/**: Contains reusable React components.
  - **AgentLog.tsx**: Displays the agent log entries.
  - **DiffView.tsx**: Displays differences between files.
  - **SiderBar.tsx**: Displays tasks and files.
  - **StatusBar.tsx**: Displays statistics and input suggestions.
- **hooks/**: Contains custom React hooks.

## Installation and Usage
To run the application, follow these steps:

1. Clone the repository:
   ```sh
   git clone https://github.com/your-repo/santra.git
   cd santra
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Start the application:
   ```sh
   npm start
   ```

The application will open in your default terminal, providing a seamless and efficient user experience.
