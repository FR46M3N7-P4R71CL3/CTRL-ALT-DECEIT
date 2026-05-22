const API_KEY = "YOUR_GEMINI_API_KEY";
const THRESHOLD = 0.8;
const DEBUG_MODE = false;

function logDebug(...args) {
  if (DEBUG_MODE) {
    console.log("[LinkedIn AI Filter - Background]", ...args);
  }
}

// Keep track of evaluated texts in the background to save API calls
const evaluatedCache = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'checkAI') {
    logDebug("Received checkAI message from content script.", { textLength: message.text?.length });
    const text = message.text;

    if (evaluatedCache.has(text)) {
      logDebug("Cache hit for text. Returning cached result:", evaluatedCache.get(text));
      sendResponse({ isAI: evaluatedCache.get(text) });
      return true;
    }

    logDebug("Cache miss. Initiating Gemini API request...");

    const requestBody = {
      contents: [{
        parts: [{
          text: `Evaluate the following text and determine if it was written by an AI model. Return ONLY a JSON object with a single key "score" and the float probability (0.0 to 1.0). Text: "${text}"`
        }]
      }],
      generationConfig: {
        thinkingConfig: {
          thinkingLevel: "MINIMAL"
        }
      }
    };

    logDebug("Request payload:", requestBody);

    fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
    .then(response => {
      logDebug("Received response status from Gemini API:", response.status);
      if (!response.ok) {
        throw new Error(`Network response was not ok, status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      logDebug("Received JSON response from Gemini API:", data);
      let isAI = false;
      if (data && data.candidates && data.candidates.length > 0) {
        const rawText = data.candidates[0].content.parts[0].text;
        logDebug("Extracted raw text from Gemini response:", rawText);
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const result = JSON.parse(jsonMatch[0]);
            logDebug("Parsed JSON from Gemini response:", result);
            if (typeof result.score === 'number') {
              if (result.score > THRESHOLD) {
                logDebug(`Score ${result.score} is greater than threshold ${THRESHOLD}. Marking as AI.`);
                isAI = true;
              } else {
                logDebug(`Score ${result.score} is not greater than threshold ${THRESHOLD}. Marking as human.`);
              }
            } else {
              logDebug("Warning: Extracted JSON did not contain a numeric 'score' field.");
            }
          } catch (e) {
            console.error("[LinkedIn AI Filter - Background] Failed to parse matched JSON from Gemini response:", e);
          }
        } else {
          logDebug("Warning: Could not find JSON object in Gemini response text.");
        }
      } else {
         logDebug("Warning: Invalid or missing 'candidates' array in Gemini API response.");
      }

      logDebug("Setting cache and sending response to content script. isAI:", isAI);
      evaluatedCache.set(text, isAI);
      sendResponse({ isAI });
    })
    .catch(err => {
      console.error("[LinkedIn AI Filter - Background] Error evaluating AI text:", err);
      // Fail open: don't block posts if API fails
      sendResponse({ isAI: false });
    });

    // Return true to indicate we wish to send a response asynchronously
    return true;
  }
});
