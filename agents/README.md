# Santra Agents

Santra Agents are specialized components that perform specific tasks within the Santra CLI-based coding assistant. Each agent is designed to handle a particular aspect of the coding process, ensuring that Santra can provide comprehensive support for developers.

## Available Agents
- **file-picker**: Finds relevant files for tasks.
- **reader**: Explains architecture or synthesizes repository context.
- **executor**: Implements larger edits after context is gathered.
- **reviewer**: Critiques or summarizes recent work.
- **thinker**: Reasons through tricky decisions.

## Developing Agents
To develop a new agent, follow these steps:
1. Create a new file in the `agents` directory.
2. Implement the agent logic according to the [agent guidelines](../docs/agent_guidelines.md).
3. Test the agent thoroughly.
4. Submit a pull request with your new agent.

## Contributing
Contributions to Santra Agents are welcome! Please see the [contributing guidelines](../CONTRIBUTING.md) for more information.

## License
This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.