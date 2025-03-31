# CatColab dev container

CatColab has experimental support for development using a dev container, which
simplifies the setup process by providing a pre-configured environment via a
Dockerfile. This is most useful for developers using [Visual Studio
Code](https://code.visualstudio.com/) or other editors that support the [dev
containers standard](https://containers.dev/).

To use the dev container:

1. Ensure you have a container runtime installed and running on your machine. You can refer to the [Open Container Initiative](https://opencontainers.org/) for more information on container standards and runtimes. For practical guidance, you might consider starting with [Docker's Get Started Guide](https://www.docker.com/get-started).
2. Open the CatColab repository in VS Code.
3. Open the VS Code command pallet by pressing `Cmd+Shift+P` on macOS or `Ctrl+Shift+P` on Linux
4. Issue the command "Dev Containers: Reopen in Container".
5. Once the container is running, the necessary setup commands will be executed automatically.
6. VS Code will prompt "Your application running on port 5173 is available. See all forwarded ports". Click the link to open the application in your browser.
