FROM ubuntu:22.04

# Install system dependencies with basic LaTeX instead of full
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
    texlive-latex-base \
    texlive-latex-recommended \
    texlive-latex-extra \
    texlive-fonts-recommended \
    texlive-science \
    texlive-bibtex-extra \
    texlive-plain-generic \
    latexmk \
    git \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Claude CLI
# Install Node.js first (required for Claude CLI)
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Install Claude CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Install MCP SDK for permission prompt server
RUN npm install -g @modelcontextprotocol/sdk

# Copy permission prompt server
COPY permission-prompt-server.js /usr/local/bin/permission-prompt-server.js
RUN chmod +x /usr/local/bin/permission-prompt-server.js

# Verify installation
RUN claude --version || echo "Claude CLI installed but may need configuration"

WORKDIR /workdir
CMD ["bash"]
