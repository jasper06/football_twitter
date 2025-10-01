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
# First, stop any running Ollama instances
pkill ollama

# Find your extension ID from chrome://extensions
# Then run with BOTH wildcarded and non-wildcarded origins:
OLLAMA_ORIGINS="chrome-extension://YOUR_EXTENSION_ID/*,chrome-extension://YOUR_EXTENSION_ID" ollama serve

# Example:
OLLAMA_ORIGINS="chrome-extension://nkpajojnedpbanonnffmhmdijadbcong/*,chrome-extension://nkpajojnedpbanonnffmhmdijadbcong" ollama serve
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

1. **Verify Extension ID**:
   - Go to `chrome://extensions/`
   - Enable Developer Mode
   - Find your extension ID
   - Ensure it exactly matches the OLLAMA_ORIGINS setting

2. **Proper CORS Configuration**:
```bash
# Stop any running instances first
pkill ollama

# Start with both wildcarded and non-wildcarded origins
OLLAMA_ORIGINS="chrome-extension://YOUR_EXTENSION_ID/*,chrome-extension://YOUR_EXTENSION_ID" ollama serve
```

3. **Check manifest.json Permissions**:
```json
{
    "permissions": [
        "alarms",
        "storage",
        "notifications",
        "activeTab",
        "scripting",
        "nativeMessaging"
    ],
    "host_permissions": [
        "https://x.com/*",
        "http://127.0.0.1:11434/*",
        "http://localhost:11434/*"
    ]
}
```

4. **Reload Extension**:
   - Go to `chrome://extensions/`
   - Find your extension
   - Click the reload button (circular arrow)
   - Restart Chrome if issues persist

5. **Debug Steps If CORS Persists**:
   - Check console for exact error messages
   - Verify Ollama is running with correct permissions
   - Ensure no other instances of Ollama are running
   - Try clearing browser cache and cookies
   - Check if antivirus/firewall is blocking connections

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
4. Sends filtered posts to local Ollama with proper CORS headers for classification
5. Stores relevant posts and shows notifications
6. Maintains post history and prevents duplicates
7. Implements retry logic for failed requests
8. Handles CORS requirements for local LLM communication

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

MIT License

Copyright (c) 2024 [Your Name]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.