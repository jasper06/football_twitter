# X/Twitter Post Tracker with Local LLM Classification

This Chrome extension monitors X/Twitter for specific posts and uses a local LLM (Ollama) to classify their relevance. When relevant posts are found, it sends desktop notifications.

## Features

- Monitors X/Twitter search results every 10 minutes
- Uses local LLM (via Ollama) for intelligent post classification
- Desktop notifications for relevant posts
- Customizable search parameters and classification criteria
- Stores history of relevant posts
- Manual check option via popup
- No API keys needed - runs completely locally

## Prerequisites

1. **Chrome Browser** - The extension runs on Chrome
2. **Ollama** - Local LLM service
   - Install from [ollama.ai](https://ollama.ai)
   - Supports multiple models (mistral-nemo, mistral, etc.)

## Installation

### 1. Install Ollama
```bash
# macOS/Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Windows
# Download from ollama.ai
```

### 2. Start Ollama with CORS Permissions
```bash
# Find your extension ID from chrome://extensions
# Then run:
OLLAMA_ORIGINS="chrome-extension://YOUR_EXTENSION_ID/*" ollama serve
```

### 3. Pull Required Model
```bash
ollama pull mistral-nemo
# or
ollama pull mistral
```

### 4. Install the Extension
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the extension directory

## Configuration

### Search Parameters
Edit `background.js` to customize the Twitter search URL:
```javascript
const targetUrl = "https://x.com/search?q=YOUR_SEARCH_QUERY&src=typed_query&f=live";
```

### Classification Prompt
Edit the prompt in `background.js` to customize what the LLM looks for:
```javascript
const prompt = `Your classification prompt here...`;
```

## Usage

1. Ensure Ollama is running with correct permissions
2. The extension will automatically check for new posts every 10 minutes
3. Click the extension icon to:
   - View recent relevant posts
   - Trigger a manual check
   - See last refresh time

## Troubleshooting

### CORS Issues
If you encounter CORS errors:

**macOS/Linux**:
```bash
OLLAMA_ORIGINS="chrome-extension://YOUR_EXTENSION_ID/*" ollama serve
```

**Windows**:
Follow CORS setup guide at [Ollama CORS Guide](https://github.com/ollama/ollama/blob/main/docs/cors.md)

### Model Not Found
Ensure the model is installed:
```bash
ollama list  # Check installed models
ollama pull mistral-nemo  # Install if missing
```

### Connection Issues
1. Verify Ollama is running: `ps aux | grep ollama`
2. Check correct port (11434) is being used
3. Restart Ollama if needed

## Files Overview

- `manifest.json` - Extension configuration
- `background.js` - Core extension logic
- `content.js` - X/Twitter page interaction
- `popup.html/js` - Extension popup interface
- `icon.png` - Extension icon

## Technical Details

The extension:
1. Monitors X/Twitter search results
2. Extracts posts using content scripts
3. Filters posts containing target keywords
4. Sends filtered posts to local Ollama for classification
5. Stores relevant posts and shows notifications
6. Maintains post history and prevents duplicates

## Permissions

The extension requires:
- `alarms` - For periodic checks
- `storage` - For post history
- `notifications` - For desktop alerts
- `activeTab` - For page access
- `scripting` - For content script injection
- Host permissions for x.com and localhost

## Support

For issues or questions:
1. Check the troubleshooting section
2. Verify Ollama is running correctly
3. Check Chrome's developer console for errors
4. Ensure all permissions are granted

## Contributing

Feel free to:
1. Fork the repository
2. Make improvements
3. Submit pull requests
4. Report issues
5. Suggest features

## License

[Your chosen license]