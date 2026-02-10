---
description: Set up the PrivateVoice MCP server environment — install Python dependencies, verify system requirements, and configure Claude Desktop.
argument-hint: "[--check-only]"
allowed-tools: ["Bash", "Read", "Write"]
---

# PrivateVoice MCP Setup

Set up the PrivateVoice Control MCP server for round-trip testing.

## Steps

1. **Check Python version** — Requires Python 3.10+. Run `python3 --version`.

2. **Check uv is installed** — Run `uv --version`. If not installed, tell the user to install with `curl -LsSf https://astral.sh/uv/install.sh | sh`.

3. **Install MCP server dependencies** — Run `uv sync` in the `mcp-server/` directory within this plugin.

4. **Verify mlx-whisper** — Run `python3 -c "import mlx_whisper; print('mlx-whisper OK')"` from the mcp-server venv. If it fails, note that mlx-whisper requires Apple Silicon.

5. **Check ffmpeg** — Run `which ffmpeg`. If missing, tell the user: `brew install ffmpeg`.

6. **Check audiotee** (optional) — Run `which audiotee`. If missing, suggest: `cargo install audiotee` for best audio capture support.

7. **Verify PrivateVoice app** — Check if `/Applications/PrivateVoice.app` exists. If not, ask the user for the correct path.

8. **Check Tauri MCP bridge build** — Look for `mcp-bridge` in the Cargo.toml features. Remind the user to build with `cargo tauri build --features mcp-bridge` for full bridge support.

9. **Generate Claude Desktop config** — Show the user the JSON snippet to add to their `claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "privatevoice": {
         "command": "uv",
         "args": ["run", "--directory", "<plugin-path>/mcp-server", "privatevoice-mcp"]
       }
     }
   }
   ```

10. **Summary** — Print a status table showing what's installed and what's missing.

If the user passed `--check-only`, skip installation steps and only report status.
